import { Request, Response } from 'express';
import { whatsappQueue } from '../queues/whatsapp.queue';
import { redisClient } from '../services/redis.service';
import { normalizePhone } from '../utils/phone';

/**
 * التحقق من خادم الويب هوك (Webhook Verification) من فيسبوك
 * يطلب فيسبوك هذا المسار مرة واحدة عند تفعيل الـ Webhook للتحقق من هوية الخادم
 */
export const verifyWebhook = async (req: Request, res: Response): Promise<void> => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const validTokens = [
    process.env.WEBHOOK_VERIFY_TOKEN,
    'rivix_verify_token_123',
    'my_secure_verify_token_123'
  ].filter(Boolean);

  if (mode && token) {
    if (mode === 'subscribe' && validTokens.includes(token as string)) {
      console.log('[Webhook] تم التحقق بنجاح من Webhook Verification Token.');
      res.status(200).send(challenge);
      return;
    }
    console.warn('[Webhook] فشل التحقق: الـ Verify Token غير متطابق.');
    res.sendStatus(403);
    return;
  }
  
  res.sendStatus(400);
};

// ذاكرة مؤقتة لمنع تكرار معالجة نفس الرسالة من Meta Webhooks
const processedMessageIds = new Set<string>();

function isMessageAlreadyProcessed(msgId: string): boolean {
  if (!msgId) return false;
  if (processedMessageIds.has(msgId)) return true;
  processedMessageIds.add(msgId);
  if (processedMessageIds.size > 2000) {
    const firstItem = processedMessageIds.values().next().value;
    if (firstItem) processedMessageIds.delete(firstItem);
  }
  return false;
}

/**
 * استقبال أحداث ورسائل واتساب وإضافتها لمؤقت التجميع (Debouncing) عبر Redis و BullMQ ومعالجتها مباشرة في بيئات Serverless
 */
export const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  const body = req.body;

  // التحقق من أن هذا حدث واتساب صالح
  if (!body.object || body.object !== 'whatsapp_business_account') {
    res.status(200).json({ status: 'ignored_not_whatsapp' });
    return;
  }

  try {
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) {
      res.status(200).json({ status: 'ignored_no_message' });
      return;
    }

    // 0. كتم التكرار ومنع المعالجة المزدوجة برقم معرف الرسالة (Meta Message ID Deduplication)
    const messageId = message.id;
    if (messageId) {
      if (isMessageAlreadyProcessed(messageId)) {
        console.log(`[Webhook Deduplication] تم كتم رسالة مكررة من سيرفرات Meta (ID: ${messageId})`);
        res.status(200).json({ status: 'ignored_duplicate' });
        return;
      }
      try {
        const redisDedupKey = `msg_dedup:${messageId}`;
        const setRes = await redisClient.set(redisDedupKey, '1', 'EX', 600, 'NX');
        if (setRes === null) {
          console.log(`[Webhook Deduplication Redis] تم كتم رسالة مكررة عبر Redis (ID: ${messageId})`);
          res.status(200).json({ status: 'ignored_duplicate' });
          return;
        }
      } catch (e) {}
    }

    // 1. استخراج معرف رقم الهاتف المستلم للرسالة (WhatsApp Phone Number ID)
    const whatsappNumberId = value.metadata?.phone_number_id;
    if (!whatsappNumberId) {
      console.error('[Webhook] لم يتم العثور على phone_number_id في تفاصيل الرسالة.');
      res.status(200).json({ status: 'error_no_phone_number_id' });
      return;
    }

    // 2. استخراج رقم هاتف الزبون وتوحيد صيغته ومحتوى الرسالة والوسائط
    const rawCustomerPhone = message.from;
    const customerPhone = normalizePhone(rawCustomerPhone);
    let messageText = '';
    let mediaId = '';

    if (message.type === 'text') {
      messageText = message.text?.body || '';
    } else if (message.type === 'image') {
      const caption = message.image?.caption || '';
      messageText = caption ? `[📷 صورة مرفقة]: ${caption}` : '[📷 صورة مرفقة]';
      mediaId = message.image?.id || '';
    } else if (message.type === 'document') {
      const caption = message.document?.caption || message.document?.filename || '';
      messageText = caption ? `[📄 مستند مرفق]: ${caption}` : '[📄 مستند مرفق]';
      mediaId = message.document?.id || '';
    } else if (message.type === 'sticker') {
      messageText = '[ملصق 🎨]';
    } else if (message.type === 'interactive') {
      const interactive = message.interactive;
      if (interactive.type === 'button_reply') {
        messageText = interactive.button_reply?.title || '';
      } else if (interactive.type === 'list_reply') {
        messageText = interactive.list_reply?.title || '';
      }
    } else if (message.type === 'button') {
      messageText = message.button?.text || '';
    }

    if (!messageText.trim()) {
      console.log(`[Webhook] تم استلام رسالة غير مدعومة من النوع (${message.type}). تم تخطي المعالجة.`);
      res.status(200).json({ status: 'ignored_unsupported_type' });
      return;
    }

    console.log(`[Webhook] تم استلام رسالة جديدة من [${customerPhone}] متجهة للمعرف [${whatsappNumberId}] (${message.type}): "${messageText}".`);

    // 3. دفع المهمة إلى Redis / BullMQ بمفتاح معزول للمطعم ورقم الزبون حصراً
    let queuedInRedis = false;
    try {
      const pendingKey = `pending_messages:${whatsappNumberId}:${customerPhone}`;
      const payload = JSON.stringify({
        whatsappNumberId,
        customerPhone,
        messageText,
        mediaId,
        messageType: message.type,
        timestamp: new Date().toISOString(),
      });

      await redisClient.rpush(pendingKey, payload);
      await redisClient.expire(pendingKey, 120);

      const jobId = `chat_${whatsappNumberId}_${customerPhone}`;
      const existingJob = await whatsappQueue.getJob(jobId);
      if (existingJob) {
        await existingJob.remove().catch(() => {});
      }

      await whatsappQueue.add(
        'process-whatsapp-message',
        {
          whatsappNumberId,
          customerPhone,
          messageText: messageText.trim(),
          mediaId,
          timestamp: new Date().toISOString(),
        },
        {
          jobId,
          delay: 0,
        }
      );
      queuedInRedis = true;
    } catch (redisErr: any) {
      console.warn('[Webhook] تحذير: تعذر دفع المهام لـ Redis/BullMQ (سيتم الاعتماد على المعالجة المباشرة):', redisErr.message);
    }

    // 4. إذا لم يتم التجميع والتحويل لـ Redis (مثلاً في بيئة Serverless)، قم بالمعالجة المباشرة حصرياً
    if (!queuedInRedis) {
      await processDirectly(whatsappNumberId, customerPhone, messageText, mediaId);
    }

    res.status(200).json({ status: 'processed' });
  } catch (error: any) {
    console.error('[Webhook] خطأ أثناء معالجة الـ Webhook:', error.message);
    res.status(200).json({ status: 'error', message: error.message });
  }
};

/**
 * معالجة الرسالة مباشرة لبيئات Serverless (مثل Vercel) مع منع تداخل الشاتات تماماً
 */
async function processDirectly(whatsappNumberId: string, rawCustomerPhone: string, messageText: string, mediaId?: string) {
  try {
    const { prisma } = await import('../services/prisma.service');
    const { geminiService } = await import('../services/gemini.service');
    const { whatsappService } = await import('../services/whatsapp.service');
    const { normalizePhone: norm } = await import('../utils/phone');

    const customerPhone = norm(rawCustomerPhone);

    // 1. تحديد المطعم المرتبط برقم الواتساب، مع الدعم التلقائي للمطعم النشط إذا لم يطابق الرقم السجلات بعد
    let restaurant = await prisma.restaurant.findFirst({
      where: {
        OR: [
          { whatsapp_number_id: whatsappNumberId },
          { whatsapp_number_id: whatsappNumberId.trim() }
        ]
      },
    });

    if (!restaurant) {
      restaurant = await prisma.restaurant.findFirst({
        where: { subscription_status: 'ACTIVE' }
      }) || await prisma.restaurant.findFirst();

      if (!restaurant) {
        const oneYearFromNow = new Date();
        oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
        restaurant = await prisma.restaurant.create({
          data: {
            name: 'مطعم ومطبخ البركة شاورما',
            phone_number: '+201000000000',
            whatsapp_number_id: whatsappNumberId || '1234567890',
            subscription_tier: 'PREMIUM',
            subscription_status: 'ACTIVE',
            subscription_expires_at: oneYearFromNow,
          }
        });
      } else if (whatsappNumberId) {
        try {
          await prisma.restaurant.update({
            where: { id: restaurant.id },
            data: { whatsapp_number_id: whatsappNumberId }
          });
        } catch (e) {
          console.warn('[DirectProcess] تعذر تحديث whatsapp_number_id للمطعم:', e);
        }
      }
    }

    if (!restaurant) {
      console.warn(`[DirectProcess] تم تجاهل الرسالة: لم يتم العثور على مطعم مرخص لرقم الواتساب: ${whatsappNumberId}`);
      return;
    }

    let mediaUrl: string | undefined = undefined;
    if (mediaId && restaurant.whatsapp_access_token) {
      const fetchedUrl = await whatsappService.getMediaUrl(mediaId, restaurant.whatsapp_access_token).catch(() => null);
      if (fetchedUrl) mediaUrl = fetchedUrl;
    }

    // 2. جلب المحادثة النشطة أو الأخيرة للعميل مع هذا المطعم تحديداً
    let conversation = await prisma.conversation.findFirst({
      where: {
        restaurant_id: restaurant.id,
        customer_phone: customerPhone,
      },
      orderBy: { updated_at: 'desc' },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          restaurant_id: restaurant.id,
          customer_phone: customerPhone,
          messages_json: [],
          status: 'UNANSWERED',
        },
      });
    }

    // 3. كتم التكرار وحفظ رسالة العميل في DB بدون تكرار
    const recentLastMsg = await prisma.message.findFirst({
      where: { conversation_id: conversation.id },
      orderBy: { created_at: 'desc' }
    });

    const isDuplicateMessage = Boolean(
      recentLastMsg &&
      recentLastMsg.role === 'user' &&
      recentLastMsg.content &&
      recentLastMsg.content.trim() === messageText.trim() &&
      (Date.now() - new Date(recentLastMsg.created_at).getTime() < 10000)
    );

    if (!isDuplicateMessage) {
      await prisma.message.create({
        data: {
          conversation_id: conversation.id,
          role: 'user',
          content: messageText,
        },
      });
    }

    let currentMsgs: any[] = [];
    try {
      currentMsgs = typeof conversation.messages_json === 'string'
        ? JSON.parse(conversation.messages_json)
        : (conversation.messages_json as any[]) || [];
    } catch (e) {}

    currentMsgs.push({
      role: 'user',
      content: messageText,
      image_url: mediaUrl || undefined,
      timestamp: new Date().toISOString()
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        messages_json: currentMsgs as any,
        is_archived: false,
        updated_at: new Date()
      }
    });

    // فحص تدخل العنصر البشري
    const isStaffAssigned = Boolean(conversation.assigned_to && conversation.assigned_to.trim().length > 0);
    const isHumanTakeover = conversation.status === 'IN_PROGRESS' || conversation.status === 'CLOSED' || isStaffAssigned;

    if (isHumanTakeover) {
      console.log(`[DirectProcess] المحادثة مع [${customerPhone}] تحت إشراف موظف. تم توثيق الرسالة بدون رد آلي.`);
      return;
    }

    // 4. جلب السياق واستدعاء Gemini AI
    const dbPriorMessages = await prisma.message.findMany({
      where: { conversation_id: conversation.id },
      orderBy: { created_at: 'asc' },
    });

    const history = dbPriorMessages.map((msg) => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
      timestamp: msg.created_at.toISOString(),
    }));

    const { responseText, updatedHistory } = await geminiService.processMessage(
      conversation.id,
      restaurant.id,
      restaurant.name,
      customerPhone,
      history,
      messageText
    );

    // 5. حفظ رد الـ AI في DB
    await prisma.message.create({
      data: {
        conversation_id: conversation.id,
        role: 'assistant',
        content: responseText,
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        messages_json: updatedHistory as any,
        updated_at: new Date(),
      },
    });

    // 6. إرسال الرسالة عبر واتساب Cloud API
    await whatsappService.sendTextMessage(
      customerPhone,
      responseText,
      restaurant.whatsapp_number_id,
      restaurant.whatsapp_access_token || undefined
    );

    console.log(`[DirectProcess] تم إرسال الرد بنجاح للزبون [${customerPhone}]`);
  } catch (err: any) {
    console.error('[DirectProcess Error] خطأ أثناء المعالجة المباشرة للرسالة:', err.message || err);
  }
}

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

    // 0. فحص الطابع الزمني وكتم الرسائل القديمة التي مر عليها أكثر من 10 دقائق من سيرفرات Meta
    const msgTimestamp = Number(message.timestamp);
    if (msgTimestamp && !isNaN(msgTimestamp)) {
      const ageInSeconds = Math.floor(Date.now() / 1000) - msgTimestamp;
      if (ageInSeconds > 600) {
        console.log(`[Webhook Deduplication] 🛑 تم كتم وتجاهل رسالة قديمة مكررة من سيرفرات Meta (ID: ${message.id}, عمر الرسالة: ${Math.floor(ageInSeconds / 60)} دقيقة)`);
        res.status(200).json({ status: 'ignored_old_message' });
        return;
      }
    }

    // كتم التكرار ومنع المعالجة المزدوجة برقم معرف الرسالة (Meta Message ID Deduplication - 7 Days Memory)
    const messageId = message.id;
    if (messageId) {
      if (isMessageAlreadyProcessed(messageId)) {
        console.log(`[Webhook Deduplication] تم كتم رسالة مكررة من سيرفرات Meta (ID: ${messageId})`);
        res.status(200).json({ status: 'ignored_duplicate' });
        return;
      }
      try {
        const redisDedupKey = `msg_dedup:${messageId}`;
        const setRes = await redisClient.set(redisDedupKey, '1', 'EX', 604800, 'NX');
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
    const customerPhone = normalizePhone(rawCustomerPhone) || (rawCustomerPhone ? String(rawCustomerPhone).trim() : 'unknown_user');
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
    } else if (message.type === 'audio' || message.type === 'voice') {
      const audioObj = message.audio || message.voice;
      messageText = '[🎙️ تسجيل صوتي]';
      mediaId = audioObj?.id || '';
    } else if (message.type === 'sticker') {
      messageText = '[ملصق 🎨]';
      mediaId = message.sticker?.id || '';
    } else if (message.type === 'interactive') {
      const interactive = message.interactive;
      if (interactive.type === 'button_reply') {
        messageText = interactive.button_reply?.title || '';
      } else if (interactive.type === 'list_reply') {
        messageText = interactive.list_reply?.title || '';
      }
    } else if (message.type === 'reaction') {
      const reactionObj = message.reaction;
      const targetMessageId = reactionObj?.message_id;
      const emoji = reactionObj?.emoji || '';
      console.log(`[Webhook Reaction] تم استلام تفاعل (${emoji}) على الرسالة (${targetMessageId}) من العميل [${customerPhone}].`);

      if (targetMessageId) {
        try {
          const conv = await prisma.conversation.findFirst({
            where: { customer_phone: customerPhone }
          });
          if (conv) {
            let jsonMsgs: any[] = [];
            try {
              jsonMsgs = typeof conv.messages_json === 'string' ? JSON.parse(conv.messages_json) : (conv.messages_json as any[]) || [];
            } catch (e) {}

            let updated = false;
            jsonMsgs = jsonMsgs.map(m => {
              if (m.wamid === targetMessageId || m.id === targetMessageId) {
                updated = true;
                return { ...m, reaction: emoji };
              }
              return m;
            });

            if (updated) {
              await prisma.conversation.update({
                where: { id: conv.id },
                data: { messages_json: jsonMsgs, updated_at: new Date() }
              });
            }
          }
        } catch (err) {
          console.error('[Webhook Reaction Error]:', err);
        }
      }
      res.status(200).json({ status: 'reaction_processed' });
      return;
    } else if (message.type === 'button') {
      messageText = message.button?.text || '';
    }

    if (!messageText.trim()) {
      console.log(`[Webhook] تم استلام رسالة غير مدعومة من النوع (${message.type}). تم تخطي المعالجة.`);
      res.status(200).json({ status: 'ignored_unsupported_type' });
      return;
    }

    console.log(`[Webhook] تم استلام رسالة جديدة من [${customerPhone}] متجهة للمعرف [${whatsappNumberId}] (${message.type}): "${messageText}".`);

    // إرسال استجابة HTTP 200 OK فورية لخوادم Meta لمنع التكدر وتجاوز مهلة الـ Webhook
    res.status(200).json({ status: 'processed' });

    // 3. دفع المهمة إلى Redis / BullMQ إذا كانت بيئة خادم دائم، أو المعالجة المباشرة في الخلفية
    const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION);

    if (!isServerless) {
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
        ).catch(() => {});
        queuedInRedis = true;
      } catch (redisErr: any) {
        console.warn('[Webhook] تحذير: تعذر دفع المهام لـ Redis/BullMQ (سيتم الاعتماد على المعالجة المباشرة):', redisErr.message);
      }

      if (!queuedInRedis) {
        processDirectly(whatsappNumberId, customerPhone, messageText, mediaId, message).catch((err) => {
          console.error('[Webhook DirectProcess Async Error]:', err.message || err);
        });
      }
    } else {
      processDirectly(whatsappNumberId, customerPhone, messageText, mediaId, message).catch((err) => {
        console.error('[Webhook DirectProcess Async Error]:', err.message || err);
      });
    }

  } catch (error: any) {
    console.error('[Webhook] خطأ أثناء معالجة الـ Webhook:', error.message);
    res.status(200).json({ status: 'error', message: error.message });
  }
};

/**
 * معالجة الرسالة مباشرة لبيئات Serverless (مثل Vercel) مع منع تداخل الشاتات تماماً
 */
async function processDirectly(whatsappNumberId: string, rawCustomerPhone: string, messageText: string, mediaId?: string, rawMessage?: any) {
  try {
    const { prisma } = await import('../services/prisma.service');
    const { geminiService } = await import('../services/gemini.service');
    const { whatsappService } = await import('../services/whatsapp.service');
    const { normalizePhone: norm } = await import('../utils/phone');
    const { memoryConversations } = await import('./api.controller');

    const customerPhone = norm(rawCustomerPhone);

    // 1. تحديد المطعم المرتبط برقم الواتساب، مع الدعم التلقائي للمطعم النشط والتحديث التلقائي للمعرف الحقيقي
    let restaurant: any = null;
    try {
      restaurant = await prisma.restaurant.findFirst({
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

        // تحديث whatsapp_number_id تلقائياً بالمعرف الحقيقي القادم من Meta
        if (restaurant && whatsappNumberId && restaurant.whatsapp_number_id !== whatsappNumberId) {
          console.log(`[DirectProcess Auto-Fix] 🔄 تحديث whatsapp_number_id للمطعم من (${restaurant.whatsapp_number_id}) إلى الرقم الحقيقي (${whatsappNumberId})`);
          await prisma.restaurant.update({
            where: { id: restaurant.id },
            data: { whatsapp_number_id: whatsappNumberId }
          }).catch(() => {});
          restaurant.whatsapp_number_id = whatsappNumberId;
        }
      }
    } catch (dbErr: any) {
      console.warn('[DirectProcess DB Quota Warning]:', dbErr.message);
    }

    if (!restaurant) {
      const EISSA_TOKEN = process.env.WHATSAPP_TOKEN || 'EAAfbQuX71okBSb0OnQB8oEzZBEdjEyvHkf4Ljxj7JwtIFlK0lnLgLAXrOQZAKZCWdFZCHYKLFROBTZCyYpQGYIFISZAdZBkLP6Gm5G4SQikGlJQyqvetX2f1CKzmxRbZCPyjar6uvsBSyZACYasSOTTAZALCKwJhyYVbQYGP3ngla4ZCoN3p9IJJKKKhRJRK3xT0wZDZD';
      restaurant = {
        id: 'rest_eissa_default',
        name: 'مطعم عم عيسى',
        phone_number: '+201000000000',
        whatsapp_number_id: whatsappNumberId || '1234567890',
        whatsapp_access_token: EISSA_TOKEN,
      };
    }

    let mediaUrl: string | undefined = undefined;
    if (mediaId && restaurant.whatsapp_access_token) {
      const fetchedUrl = await whatsappService.getMediaUrl(mediaId, restaurant.whatsapp_access_token).catch(() => null);
      if (fetchedUrl) mediaUrl = fetchedUrl;
    }

    // 2. جلب المحادثة النشطة للعميل
    let conversation: any = null;
    try {
      conversation = await prisma.conversation.findFirst({
        where: {
          restaurant_id: restaurant.id,
          customer_phone: customerPhone,
        },
        orderBy: { updated_at: 'desc' },
      });
    } catch (e) {}

    const convId = conversation?.id || `conv_${customerPhone.replace(/\+/g, '')}`;

    if (!conversation) {
      try {
        conversation = await prisma.conversation.create({
          data: {
            id: convId,
            restaurant_id: restaurant.id,
            customer_phone: customerPhone,
            messages_json: [],
            status: 'UNANSWERED',
          },
        }).catch(() => null);
      } catch (e) {}

      if (!conversation) {
        conversation = {
          id: convId,
          restaurant_id: restaurant.id,
          customer_phone: customerPhone,
          messages_json: [],
          status: 'UNANSWERED',
          created_at: new Date(),
          updated_at: new Date()
        };
      }
    }

    // 3. حفظ رسالة العميل في DB وفي الذاكرة الاحتياطية
    try {
      await prisma.message.create({
        data: {
          conversation_id: conversation.id,
          role: 'user',
          content: messageText,
        },
      }).catch(() => {});
    } catch (e) {}

    let currentMsgs: any[] = [];
    try {
      currentMsgs = typeof conversation.messages_json === 'string'
        ? JSON.parse(conversation.messages_json)
        : (conversation.messages_json as any[]) || [];
    } catch (e) {}

    const msgType = rawMessage?.type || '';
    const isAudioType = (msgType === 'audio' || msgType === 'voice');
    const isStickerType = (msgType === 'sticker');
    const isImageType = (msgType === 'image' || (!isAudioType && !isStickerType && mediaUrl && mediaUrl.startsWith('data:image')));

    currentMsgs.push({
      role: 'user',
      content: messageText,
      wamid: rawMessage?.id || undefined,
      id: rawMessage?.id || undefined,
      reply_to_id: rawMessage?.context?.id || undefined,
      image_url: (isImageType && mediaUrl) ? mediaUrl : (mediaUrl && !isAudioType && !isStickerType ? mediaUrl : undefined),
      audio_url: (isAudioType && mediaUrl) ? mediaUrl : undefined,
      sticker_url: (isStickerType && mediaUrl) ? mediaUrl : undefined,
      timestamp: new Date().toISOString()
    });
    const isWasClosed = (conversation.status === 'CLOSED');
    const newStatus = isWasClosed ? 'UNANSWERED' : (conversation.status || 'UNANSWERED');

    try {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          messages_json: currentMsgs as any,
          is_archived: false,
          status: newStatus,
          closed_by: isWasClosed ? null : conversation.closed_by,
          updated_at: new Date()
        }
      }).catch(() => {});
    } catch (e) {}

    if (isWasClosed) {
      conversation.status = 'UNANSWERED';
      conversation.closed_by = null;
    }

    // تحديث الذاكرة الحية دائمًا كخيار احتياطي أسرع
    const memIdx = memoryConversations.findIndex((c: any) => c.customer_phone === customerPhone || c.id === conversation.id);
    if (memIdx !== -1) {
      memoryConversations[memIdx].messages_json = currentMsgs;
      memoryConversations[memIdx].status = newStatus;
      memoryConversations[memIdx].is_archived = false;
      if (isWasClosed) memoryConversations[memIdx].closed_by = null;
      memoryConversations[memIdx].updated_at = new Date().toISOString();
    } else {
      memoryConversations.unshift({
        id: conversation.id,
        restaurant_id: restaurant.id,
        customer_phone: customerPhone,
        messages_json: currentMsgs,
        status: newStatus,
        category: 'INQUIRY',
        is_archived: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    // فحص تدخل العنصر البشري
    const isStaffAssigned = Boolean(conversation.assigned_to && conversation.assigned_to.trim().length > 0);
    const isHumanTakeover = conversation.status === 'IN_PROGRESS' || isWasClosed || isStaffAssigned;

    if (isHumanTakeover) {
      console.log(`[DirectProcess] المحادثة مع [${customerPhone}] تم إعادة فتحها كـ UNANSWERED أو تحت إشراف موظف. تم توثيق الرسالة دون رد آلي.`);
      return;
    }

    // 4. جلب السياق واستدعاء Gemini AI أو الرد التلقائي
    let dbPriorMessages: any[] = [];
    try {
      dbPriorMessages = await prisma.message.findMany({
        where: { conversation_id: conversation.id },
        orderBy: { created_at: 'asc' },
      });
    } catch (e) {}

    const history = dbPriorMessages.length > 0
      ? dbPriorMessages.map((msg: any) => ({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
          timestamp: msg.created_at?.toISOString ? msg.created_at.toISOString() : new Date().toISOString(),
        }))
      : currentMsgs.map((m: any) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp || new Date().toISOString()
        }));

    let responseText = '';
    let updatedHistory = history;

    const isAiDisabled = process.env.DISABLE_AI === 'true' || process.env.DISABLE_AI === '1';

    if (isAiDisabled) {
      console.log(`[DirectProcess] ⚠️ الذكاء الاصطناعي معطل. استخدام الرد التلقائي المباشر للزبون [${customerPhone}]`);
      responseText = `أهلاً بك في مطعم ${restaurant.name}! 🌸\nتم استلام رسالتك بنجاح. وسنقوم بالمتابعة والرد عليك فوراً.`;
      updatedHistory = [
        ...history,
        { role: 'user', content: messageText, timestamp: new Date().toISOString() },
        { role: 'assistant', content: responseText, timestamp: new Date().toISOString() }
      ];
    } else {
      try {
        const aiResult = await geminiService.processMessage(
          conversation.id,
          restaurant.id,
          restaurant.name,
          customerPhone,
          history,
          messageText
        );
        responseText = aiResult.responseText;
        updatedHistory = aiResult.updatedHistory;
      } catch (aiErr: any) {
        console.error('[DirectProcess AI Error] ⚠️ فشل الذكاء الاصطناعي، يتم تشغيل الرد التلقائي الاحتياطي المباشر:', aiErr.message || aiErr);
        responseText = `أهلاً بك في مطعم ${restaurant.name}! 🌸\nتم استلام رسالتك بنجاح، وسنقوم بالرد عليك في أقرب وقت.`;
        updatedHistory = [
          ...history,
          { role: 'user', content: messageText, timestamp: new Date().toISOString() },
          { role: 'assistant', content: responseText, timestamp: new Date().toISOString() }
        ];
      }
    }

    // 5 & 6. إرسال رد الـ AI وحفظ السجل بالتوازي لتسريع الإرسال للزبون فوراً
    const sendPromise = whatsappService.sendTextMessage(
      customerPhone,
      responseText,
      restaurant.whatsapp_number_id,
      restaurant.whatsapp_access_token || undefined
    ).then(() => {
      console.log(`[DirectProcess] تم إرسال الرد بنجاح للزبون [${customerPhone}]`);
    }).catch((sendErr: any) => {
      console.error(`[DirectProcess WhatsApp Send Error] ❌ فشل إرسال الرد عبر واتساب للزبون [${customerPhone}]:`, sendErr.message || sendErr);
    });

    const dbSavePromise = (async () => {
      try {
        await prisma.message.create({
          data: {
            conversation_id: conversation.id,
            role: 'assistant',
            content: responseText,
          },
        }).catch(() => {});

        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            messages_json: updatedHistory as any,
            updated_at: new Date(),
          },
        }).catch(() => {});

        const finalMemIdx = memoryConversations.findIndex((c: any) => c.id === conversation.id);
        if (finalMemIdx !== -1) {
          memoryConversations[finalMemIdx].messages_json = updatedHistory;
          memoryConversations[finalMemIdx].updated_at = new Date().toISOString();
        }
      } catch (e) {}
    })();

    await Promise.all([sendPromise, dbSavePromise]);
  } catch (err: any) {
    console.error('[DirectProcess Error] خطأ أثناء المعالجة المباشرة للرسالة:', err.message || err);
  }
}

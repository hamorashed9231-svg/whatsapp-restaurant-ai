import { Worker, Job } from 'bullmq';
import { redisConnectionOptions, redisClient } from '../services/redis.service';
import { WHATSAPP_QUEUE_NAME, WhatsAppMessageJob } from '../queues/whatsapp.queue';
import { prisma } from '../services/prisma.service';
import { geminiService } from '../services/gemini.service';
import { whatsappService } from '../services/whatsapp.service';
import { ChatMessage } from '../models/types';
import { normalizePhone } from '../utils/phone';

export const whatsappWorker = new Worker<WhatsAppMessageJob, any, string>(
  WHATSAPP_QUEUE_NAME,
  async (job: Job<WhatsAppMessageJob>) => {
    try {
      const { whatsappNumberId, customerPhone: rawCustomerPhone, messageText: defaultMessageText } = job.data;
      const customerPhone = normalizePhone(rawCustomerPhone) || (rawCustomerPhone ? String(rawCustomerPhone).trim() : 'unknown_user');
      console.log(`[BullMQ Worker] بدء معالجة المهمة #${job.id} للزبون [${customerPhone}] متجهة للمطعم [${whatsappNumberId}]`);

      // 1. سحب كافة الرسائل المجمعة في القائمة المؤقتة المعزولة برقم المطعم والزبون من Redis
      const targetWhatsappNumberId = whatsappNumberId;
      const pendingKey = `pending_messages:${targetWhatsappNumberId}:${customerPhone}`;
      const rawPendingMessages = await redisClient.lrange(pendingKey, 0, -1);
      await redisClient.del(pendingKey);

      const pendingList: Array<{ whatsappNumberId?: string; customerPhone?: string; messageText: string; mediaId?: string; messageType?: string; timestamp?: string }> = (rawPendingMessages || []).map((item) => {
        try {
          return JSON.parse(item);
        } catch (e) {
          return { messageText: item };
        }
      });

      // تجميع كافة نصوص الرسائل في نص واحد مفصول بأسطر جديدة
      let combinedMessageText = '';
      if (pendingList.length > 0) {
        combinedMessageText = pendingList.map(p => p.messageText).filter(Boolean).join('\n');
      } else if (defaultMessageText && defaultMessageText.trim()) {
        combinedMessageText = defaultMessageText.trim();
      }

      if (!combinedMessageText || !combinedMessageText.trim()) {
        console.log(`[BullMQ Worker] تم مسح/تخطي المهمة للزبون [${customerPhone}] بسبب عدم وجود رسائل معلقة.`);
        return;
      }

      console.log(`[BullMQ Worker] تم تجميع ${pendingList.length || 1} رسائل متتالية للزبون [${customerPhone}] في سياق واحد: "${combinedMessageText.replace(/\n/g, ' ')}"`);

      // 2. تحديد المطعم المرتبط برقم الواتساب المستلم مع fallback للمطعم النشط
      let restaurant = await prisma.restaurant.findFirst({
        where: {
          OR: [
            { whatsapp_number_id: targetWhatsappNumberId },
            { whatsapp_number_id: targetWhatsappNumberId.trim() }
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
          const EISSA_TOKEN = 'EAAfbQuX71okBSb0OnQB8oEzZBEdjEyvHkf4Ljxj7JwtIFlK0lnLgLAXrOQZAKZCWdFZCHYKLFROBTZCyYpQGYIFISZAdZBkLP6Gm5G4SQikGlJQyqvetX2f1CKzmxRbZCPyjar6uvsBSyZACYasSOTTAZALCKwJhyYVbQYGP3ngla4ZCoN3p9IJJKKKhRJRK3xT0wZDZD';
          restaurant = await prisma.restaurant.create({
            data: {
              name: 'مطعم عم عيسى',
              phone_number: '+201000000000',
              whatsapp_number_id: targetWhatsappNumberId || '1234567890',
              whatsapp_access_token: EISSA_TOKEN,
              subscription_tier: 'PREMIUM',
              subscription_status: 'ACTIVE',
              subscription_expires_at: oneYearFromNow,
            }
          });
        } else if (targetWhatsappNumberId) {
          try {
            await prisma.restaurant.update({
              where: { id: restaurant.id },
              data: { whatsapp_number_id: targetWhatsappNumberId }
            });
          } catch (e) {}
        }
      }

      if (!restaurant) {
        console.warn(`[BullMQ Worker] تحذير: لم يتم العثور على مطعم للرقم: ${targetWhatsappNumberId}`);
        await whatsappService.sendTextMessage(
          customerPhone,
          'عذراً، هذا الرقم غير مرتبط بأي مطعم مسجل لدينا حالياً.',
          targetWhatsappNumberId
        );
        return;
      }

      // 3. التحقق من صلاحية وحالة اشتراك المطعم
      if (restaurant.subscription_status !== 'ACTIVE' || new Date(restaurant.subscription_expires_at) < new Date()) {
        console.log(`[BullMQ Worker] اشتراك المطعم "${restaurant.name}" غير نشط أو منتهي الصلاحية.`);
        await whatsappService.sendTextMessage(
          customerPhone,
          `عذراً، خدمة المساعد الذكي لمطعم "${restaurant.name}" معطلة مؤقتاً لانتهاء فترة الاشتراك.`,
          targetWhatsappNumberId
        );
        return;
      }

      // 4. جلب المحادثة النشطة أو الأخيرة للعميل مع المطعم
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
        console.log(`[BullMQ Worker] تم إنشاء سجل محادثة جديد للزبون [${customerPhone}] في مطعم [${restaurant.name}]`);
      }

      // 5. بناء كائنات الرسائل المدعومة بالوسائط (مع استرجاع روابط الصور والتسجيلات من Meta API)
      const mediaToken = restaurant?.whatsapp_access_token || process.env.WHATSAPP_TOKEN;
      const userMessageEntries: ChatMessage[] = [];

      if (pendingList.length > 0) {
        for (const pMsg of pendingList) {
          if (pMsg.messageText && pMsg.messageText.trim()) {
            let mediaUrl: string | undefined = undefined;
            if (pMsg.mediaId && mediaToken) {
              const fetched = await whatsappService.getMediaUrl(pMsg.mediaId, mediaToken).catch(() => null);
              if (fetched) mediaUrl = fetched;
            }
            const msgType = pMsg.messageType || '';
            const isAudioType = (msgType === 'audio' || msgType === 'voice');
            const isStickerType = (msgType === 'sticker');
            const isImageType = (msgType === 'image' || (!isAudioType && !isStickerType && mediaUrl && mediaUrl.startsWith('data:image')));

            userMessageEntries.push({
              role: 'user',
              content: pMsg.messageText.trim(),
              image_url: (isImageType && mediaUrl) ? mediaUrl : (mediaUrl && !isAudioType && !isStickerType ? mediaUrl : undefined),
              audio_url: (isAudioType && mediaUrl) ? mediaUrl : undefined,
              sticker_url: (isStickerType && mediaUrl) ? mediaUrl : undefined,
              timestamp: pMsg.timestamp || new Date().toISOString()
            });
          }
        }
      } else if (combinedMessageText) {
        let mediaUrl: string | undefined = undefined;
        if (job.data.mediaId && mediaToken) {
          const fetched = await whatsappService.getMediaUrl(job.data.mediaId, mediaToken).catch(() => null);
          if (fetched) mediaUrl = fetched;
        }
        const msgType = job.data.messageType || '';
        const isAudioType = (msgType === 'audio' || msgType === 'voice');
        const isStickerType = (msgType === 'sticker');
        const isImageType = (msgType === 'image' || (!isAudioType && !isStickerType && mediaUrl && mediaUrl.startsWith('data:image')));

        userMessageEntries.push({
          role: 'user',
          content: combinedMessageText,
          image_url: (isImageType && mediaUrl) ? mediaUrl : (mediaUrl && !isAudioType && !isStickerType ? mediaUrl : undefined),
          audio_url: (isAudioType && mediaUrl) ? mediaUrl : undefined,
          sticker_url: (isStickerType && mediaUrl) ? mediaUrl : undefined,
          timestamp: job.data.timestamp || new Date().toISOString()
        });
      }

      // 6. فحص شرط التدخل البشري (Human-in-the-Loop / Staff Takeover)
      const isStaffAssigned = Boolean(conversation.assigned_to && conversation.assigned_to.trim().length > 0);
      const isHumanTakeover =
        conversation.status === 'IN_PROGRESS' ||
        conversation.status === 'CLOSED' ||
        isStaffAssigned;

      if (isHumanTakeover) {
        console.log(`[BullMQ Worker 🛑] المحادثة مع الزبون [${customerPhone}] تحت إشراف موظف الكول سنتر (${conversation.assigned_to || conversation.status}). تم إيقاف رد الذكاء الاصطناعي وتوثيق الرسائل فقط.`);

        for (const entry of userMessageEntries) {
          await prisma.message.create({
            data: {
              conversation_id: conversation.id,
              role: 'user',
              content: entry.content,
            },
          }).catch(() => {});
        }

        const currentMessagesJson: ChatMessage[] = Array.isArray(conversation.messages_json)
          ? (conversation.messages_json as any)
          : [];
        
        const updatedMessagesJson = [...currentMessagesJson, ...userMessageEntries];

        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            messages_json: updatedMessagesJson as any,
            is_archived: false,
            updated_at: new Date(),
            // إذا كانت المحادثة مغلقة واستلمت رسالة جديدة، نعيد فتحها كـ UNANSWERED لتنبيه موظفي الكول سنتر
            ...(conversation.status === 'CLOSED' ? { status: 'UNANSWERED', closed_by: null } : {}),
          },
        });

        return;
      }

      // 7. في حال كانت المحادثة آليّة (تأخذ الوضع الافتراضي للذكاء الاصطناعي)
      // جلب سياق المحادثة السابق من DB
      const dbPriorMessages = await prisma.message.findMany({
        where: { conversation_id: conversation.id },
        orderBy: { created_at: 'asc' },
      });

      const history: ChatMessage[] = dbPriorMessages.map((msg) => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
        timestamp: msg.created_at.toISOString(),
      }));

      // حفظ الرسائل الفردية للزبون في جدول Message مع كتم التكرار
      const recentWorkerMsg = await prisma.message.findFirst({
        where: { conversation_id: conversation.id },
        orderBy: { created_at: 'desc' }
      });

      const isWorkerDuplicate = Boolean(
        recentWorkerMsg &&
        recentWorkerMsg.role === 'user' &&
        recentWorkerMsg.content &&
        recentWorkerMsg.content.trim() === combinedMessageText.trim() &&
        (Date.now() - new Date(recentWorkerMsg.created_at).getTime() < 10000)
      );

      if (!isWorkerDuplicate) {
        for (const entry of userMessageEntries) {
          await prisma.message.create({
            data: {
              conversation_id: conversation.id,
              role: 'user',
              content: entry.content,
            },
          }).catch(() => {});
        }
      }

      // 8. استدعاء خدمة الذكاء الاصطناعي Gemini API أو الرد التلقائي
      let responseText = '';
      const isAiDisabled = process.env.DISABLE_AI === 'true' || process.env.DISABLE_AI === '1';

      if (isAiDisabled) {
        console.log(`[BullMQ Worker] ⚠️ الذكاء الاصطناعي معطل. استخدام الرد التلقائي المباشر للزبون [${customerPhone}]`);
        responseText = `أهلاً بك في مطعم ${restaurant.name}! 🌸\nتم استلام رسالتك بنجاح وسنتابع معك فوراً.`;
      } else {
        try {
          const aiResult = await geminiService.processMessage(
            conversation.id,
            restaurant.id,
            restaurant.name,
            customerPhone,
            history,
            combinedMessageText
          );
          responseText = aiResult.responseText;
        } catch (aiErr: any) {
          console.error('[BullMQ Worker AI Error] ⚠️ تعذر استدعاء الذكاء الاصطناعي، يتم استخدام الرد التلقائي المباشر:', aiErr.message || aiErr);
          responseText = `أهلاً بك في مطعم ${restaurant.name}! 🌸\nتم استلام رسالتك بنجاح وسنتابع معك فوراً.`;
        }
      }

      // 9 & 10. إرسال رد الـ AI وحفظ السجل بالتوازي مع الحفاظ على الوسائط والروابط والصور
      const sendPromise = whatsappService.sendTextMessage(
        customerPhone,
        responseText,
        restaurant.whatsapp_number_id,
        restaurant.whatsapp_access_token || undefined
      ).then(() => {
        console.log(`[BullMQ Worker] اكتملت معالجة المهمة #${job.id} وإرسال الرد الموحد للزبون [${customerPhone}] بنجاح.`);
      }).catch((sendErr: any) => {
        console.error(`[BullMQ Worker WhatsApp Send Error] ❌ فشل إرسال الرسالة عبر واتساب للزبون [${customerPhone}]:`, sendErr.message || sendErr);
      });

      const dbSavePromise = (async () => {
        try {
          await prisma.message.create({
            data: {
              conversation_id: conversation.id,
              role: 'assistant',
              content: responseText,
            },
          });

          const currentMessagesJson: ChatMessage[] = Array.isArray(conversation.messages_json)
            ? (conversation.messages_json as any)
            : [];

          const finalMessagesJson = [
            ...currentMessagesJson,
            ...userMessageEntries,
            { role: 'assistant', content: responseText, timestamp: new Date().toISOString() }
          ];

          await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              messages_json: finalMessagesJson as any,
              updated_at: new Date(),
            },
          });
        } catch (dbErr: any) {
          console.error('[BullMQ Worker DB Save Error]:', dbErr.message || dbErr);
        }
      })();

      await Promise.all([sendPromise, dbSavePromise]);
    } catch (workerErr: any) {
      console.error(`[BullMQ Worker ❌] خطأ غير متوقع أثناء معالجة المهمة #${job?.id}:`, workerErr.message || workerErr);
      throw workerErr;
    }
  },
  {
    connection: redisConnectionOptions,
    concurrency: 10,
  }
);

whatsappWorker.on('completed', (job) => {
  console.log(`[BullMQ Worker] المهمة #${job.id} اكتملت بنجاح.`);
});

whatsappWorker.on('failed', (job, err) => {
  console.error(`[BullMQ Worker] فشلت المهمة #${job?.id} بسبب:`, err.message);
});

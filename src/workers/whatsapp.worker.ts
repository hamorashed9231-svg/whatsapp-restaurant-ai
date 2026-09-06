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

      const pendingList: Array<{ whatsappNumberId?: string; messageText: string; timestamp?: string }> = (rawPendingMessages || []).map((item) => {
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

      // 5. فحص شرط التدخل البشري (Human-in-the-Loop / Staff Takeover)
      const isStaffAssigned = Boolean(conversation.assigned_to && conversation.assigned_to.trim().length > 0);
      const isHumanTakeover =
        conversation.status === 'IN_PROGRESS' ||
        conversation.status === 'CLOSED' ||
        isStaffAssigned;

      if (isHumanTakeover) {
        console.log(`[BullMQ Worker 🛑] المحادثة مع الزبون [${customerPhone}] تحت إشراف موظف الكول سنتر (${conversation.assigned_to || conversation.status}). تم إيقاف رد الذكاء الاصطناعي وتوثيق الرسائل فقط.`);

        // حفظ رسائل العميل المجمعة في جدول Message وفي messages_json لإظهارها بلوحة التحكم فوراً
        const userMessageEntries: ChatMessage[] = [];
        if (pendingList.length > 0) {
          for (const pMsg of pendingList) {
            if (pMsg.messageText && pMsg.messageText.trim()) {
              await prisma.message.create({
                data: {
                  conversation_id: conversation.id,
                  role: 'user',
                  content: pMsg.messageText.trim(),
                },
              });
              userMessageEntries.push({
                role: 'user',
                content: pMsg.messageText.trim(),
                timestamp: new Date().toISOString(),
              });
            }
          }
        } else {
          await prisma.message.create({
            data: {
              conversation_id: conversation.id,
              role: 'user',
              content: combinedMessageText,
            },
          });
          userMessageEntries.push({
            role: 'user',
            content: combinedMessageText,
            timestamp: new Date().toISOString(),
          });
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

        // التوقف الفوري دون استدعاء الذكاء الاصطناعي ودون إرسال رد آلي عبر واتساب
        return;
      }

      // 6. في حال كانت المحادثة آليّة (تأخذ الوضع الافتراضي للذكاء الاصطناعي)
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
        if (pendingList.length > 0) {
          for (const pMsg of pendingList) {
            if (pMsg.messageText && pMsg.messageText.trim()) {
              await prisma.message.create({
                data: {
                  conversation_id: conversation.id,
                  role: 'user',
                  content: pMsg.messageText.trim(),
                },
              });
            }
          }
        } else {
          await prisma.message.create({
            data: {
              conversation_id: conversation.id,
              role: 'user',
              content: combinedMessageText,
            },
          });
        }
      }

      // 7. استدعاء خدمة الذكاء الاصطناعي Gemini API أو الرد التلقائي
      let responseText = '';
      let updatedHistory = history;

      const isAiDisabled = process.env.DISABLE_AI === 'true' || process.env.DISABLE_AI === '1';

      if (isAiDisabled) {
        console.log(`[BullMQ Worker] ⚠️ الذكاء الاصطناعي معطل. استخدام الرد التلقائي المباشر للزبون [${customerPhone}]`);
        responseText = `أهلاً بك في مطعم ${restaurant.name}! 🌸\nتم استلام رسالتك بنجاح وسنتابع معك فوراً.`;
        updatedHistory = [
          ...history,
          { role: 'user', content: combinedMessageText, timestamp: new Date().toISOString() },
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
            combinedMessageText
          );
          responseText = aiResult.responseText;
          updatedHistory = aiResult.updatedHistory;
        } catch (aiErr: any) {
          console.error('[BullMQ Worker AI Error] ⚠️ تعذر استدعاء الذكاء الاصطناعي، يتم استخدام الرد التلقائي المباشر:', aiErr.message || aiErr);
          responseText = `أهلاً بك في مطعم ${restaurant.name}! 🌸\nتم استلام رسالتك بنجاح وسنتابع معك فوراً.`;
          updatedHistory = [
            ...history,
            { role: 'user', content: combinedMessageText, timestamp: new Date().toISOString() },
            { role: 'assistant', content: responseText, timestamp: new Date().toISOString() }
          ];
        }
      }

      // 8 & 9. إرسال رد الـ AI وحفظ السجل بالتوازي لتسريع وصول الرسالة للزبون فوراً
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

          await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              messages_json: updatedHistory as any,
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

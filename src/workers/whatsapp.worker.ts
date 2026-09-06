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
      const customerPhone = normalizePhone(rawCustomerPhone);
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

      // 2. تحديد المطعم المرتبط برقم الواتساب المستلم
      const restaurant = await prisma.restaurant.findFirst({
        where: {
          OR: [
            { whatsapp_number_id: targetWhatsappNumberId },
            { whatsapp_number_id: targetWhatsappNumberId.trim() }
          ]
        },
      });

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

      // حفظ الرسائل الفردية للزبون في جدول Message
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

      // 7. استدعاء خدمة الذكاء الاصطناعي Gemini API
      const { responseText, updatedHistory } = await geminiService.processMessage(
        conversation.id,
        restaurant.id,
        restaurant.name,
        customerPhone,
        history,
        combinedMessageText
      );

      // 8. حفظ رد الـ AI في جدول Message وتحديث messages_json للتوافق مع واجهة الأدمن
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

      // 9. إرسال رد الـ AI للزبون عبر واتساب
      await whatsappService.sendTextMessage(
        customerPhone,
        responseText,
        restaurant.whatsapp_number_id,
        restaurant.whatsapp_access_token || undefined
      );

      console.log(`[BullMQ Worker] اكتملت معالجة المهمة #${job.id} وإرسال الرد الموحد للزبون [${customerPhone}] بنجاح.`);
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

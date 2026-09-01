import { Worker, Job } from 'bullmq';
import { redisConnectionOptions } from '../services/redis.service';
import { WHATSAPP_QUEUE_NAME, WhatsAppMessageJob } from '../queues/whatsapp.queue';
import { prisma } from '../services/prisma.service';
import { geminiService } from '../services/gemini.service';
import { whatsappService } from '../services/whatsapp.service';
import { ChatMessage } from '../models/types';

export const whatsappWorker = new Worker<WhatsAppMessageJob, any, string>(
  WHATSAPP_QUEUE_NAME,
  async (job: Job<WhatsAppMessageJob>) => {
    const { whatsappNumberId, customerPhone, messageText } = job.data;
    console.log(`[BullMQ Worker] بدء معالجة المهمة #${job.id} للزبون [${customerPhone}] متجهة للمطعم [${whatsappNumberId}]`);

    // 1. تحديد المطعم المرتبط برقم الواتساب المستلم
    const restaurant = await prisma.restaurant.findUnique({
      where: { whatsapp_number_id: whatsappNumberId },
    });

    if (!restaurant) {
      console.warn(`[BullMQ Worker] تحذير: لم يتم العثور على مطعم للرقم: ${whatsappNumberId}`);
      await whatsappService.sendTextMessage(
        customerPhone,
        'عذراً، هذا الرقم غير مرتبط بأي مطعم مسجل لدينا حالياً.',
        whatsappNumberId
      );
      return;
    }

    // 2. التحقق من صلاحية وحالة اشتراك المطعم
    if (restaurant.subscription_status !== 'ACTIVE' || new Date(restaurant.subscription_expires_at) < new Date()) {
      console.log(`[BullMQ Worker] اشتراك المطعم "${restaurant.name}" غير نشط أو منتهي الصلاحية.`);
      await whatsappService.sendTextMessage(
        customerPhone,
        `عذراً، خدمة المساعد الذكي لمطعم "${restaurant.name}" معطلة مؤقتاً لانتهاء فترة الاشتراك.`,
        whatsappNumberId
      );
      return;
    }

    // 3. جلب المحادثة النشطة للعميل أو إنشاء واحدة جديدة
    let conversation = await prisma.conversation.findFirst({
      where: {
        restaurant_id: restaurant.id,
        customer_phone: customerPhone,
        status: 'ACTIVE',
      },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          restaurant_id: restaurant.id,
          customer_phone: customerPhone,
          messages_json: [],
          status: 'ACTIVE',
        },
      });
      console.log(`[BullMQ Worker] تم إنشاء سجل محادثة جديد للزبون [${customerPhone}] في مطعم [${restaurant.name}]`);
    }

    // 4. حفظ رسالة المستخدم في جدول Message المستقل لتجنب تعارض القراءة والكتابة
    await prisma.message.create({
      data: {
        conversation_id: conversation.id,
        role: 'user',
        content: messageText,
      },
    });

    // 5. جلب كامل تاريخ الرسائل السابقة للمحادثة من جدول Message لضمان الترابط الدقيق
    const dbMessages = await prisma.message.findMany({
      where: { conversation_id: conversation.id },
      orderBy: { created_at: 'asc' },
    });

    const history: ChatMessage[] = dbMessages.map((msg) => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
      timestamp: msg.created_at.toISOString(),
    }));

    // 6. استدعاء خدمة الذكاء الاصطناعي مع معالجة إعادة المحاولات
    const { responseText, updatedHistory } = await geminiService.processMessage(
      conversation.id,
      restaurant.id,
      restaurant.name,
      customerPhone,
      history,
      messageText
    );

    // 7. حفظ رد الـ AI في جدول Message وتحديث messages_json للتوافق مع واجهة الأدمن
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

    // 8. إرسال رد الـ AI للزبون عبر واتساب
    await whatsappService.sendTextMessage(
      customerPhone,
      responseText,
      restaurant.whatsapp_number_id,
      restaurant.whatsapp_access_token || undefined
    );

    console.log(`[BullMQ Worker] اكتملت معالجة المهمة #${job.id} وإرسال الرد للزبون [${customerPhone}] بنجاح.`);
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

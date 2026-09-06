import { Request, Response } from 'express';
import { whatsappQueue } from '../queues/whatsapp.queue';
import { redisClient } from '../services/redis.service';

/**
 * التحقق من خادم الويب هوك (Webhook Verification) من فيسبوك
 * يطلب فيسبوك هذا المسار مرة واحدة عند تفعيل الـ Webhook للتحقق من هوية الخادم
 */
export const verifyWebhook = async (req: Request, res: Response): Promise<void> => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'my_secure_verify_token_123';

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
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

/**
 * استقبال أحداث ورسائل واتساب وإضافتها لمؤقت التجميع (Debouncing) عبر Redis و BullMQ
 */
export const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  // إرجاع حالة 200 لـ WhatsApp فوراً لمنع تكرار الإرسال وتفادي انتهاء المهلة (Timeout)
  res.status(200).json({ status: 'received' });

  const body = req.body;

  // التحقق من أن هذا حدث واتساب صالح
  if (!body.object || body.object !== 'whatsapp_business_account') {
    return;
  }

  try {
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) {
      return;
    }

    // 1. استخراج معرف رقم الهاتف المستلم للرسالة (WhatsApp Phone Number ID)
    const whatsappNumberId = value.metadata?.phone_number_id;
    if (!whatsappNumberId) {
      console.error('[Webhook] لم يتم العثور على phone_number_id في تفاصيل الرسالة.');
      return;
    }

    // 2. استخراج رقم هاتف الزبون ومحتوى الرسالة
    const customerPhone = message.from;
    let messageText = '';

    if (message.type === 'text') {
      messageText = message.text?.body || '';
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
      console.log(`[Webhook] تم استلام رسالة غير نصية أو فارغة من النوع (${message.type}). تم تخطي المعالجة.`);
      return;
    }

    console.log(`[Webhook] تم استلام رسالة جديدة من [${customerPhone}]: "${messageText}". جاري التجميع بـ Redis (Debouncing)...`);

    // 3. تخزين الرسالة مؤقتاً في Redis تحت قائمة (List) بـ TTL قصير
    const pendingKey = `pending_messages:${customerPhone}`;
    const payload = JSON.stringify({
      whatsappNumberId,
      customerPhone,
      messageText,
      messageType: message.type,
      timestamp: new Date().toISOString(),
    });

    await redisClient.rpush(pendingKey, payload);
    await redisClient.expire(pendingKey, 120); // وقت انتهاء الصلاحية 120 ثانية

    // 4. آلية Debouncing في BullMQ باستخدام jobId ثابت لتجميع الرسائل المتتالية
    const jobId = `chat_${customerPhone}`;
    try {
      const existingJob = await whatsappQueue.getJob(jobId);
      if (existingJob) {
        await existingJob.remove();
        console.log(`[Webhook] تم إلغاء الوظيفة المؤجلة السابقة للرقم [${customerPhone}] وتجديد النافذة الزمنية (Debouncing).`);
      }
    } catch (removeErr: any) {
      // إغفال الخطأ إن كانت الوظيفة قيد التنفيذ أو غير موجودة
    }

    // إضافة الوظيفة بتأخير زمني قدره 2500ms (2.5 ثانية)
    await whatsappQueue.add(
      'process-whatsapp-message',
      {
        whatsappNumberId,
        customerPhone,
        messageText: '', // سيتم سحب كامل الرسائل المجمعة من Redis داخل الـ Worker
        timestamp: new Date().toISOString(),
      },
      {
        jobId,
        delay: 2500,
      }
    );
  } catch (error: any) {
    console.error('[Webhook] خطأ أثناء معالجة الـ Webhook والدفع إلى Redis/BullMQ:', error.message);
  }
};

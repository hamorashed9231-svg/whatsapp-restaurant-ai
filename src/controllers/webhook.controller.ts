import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';
import { anthropicService } from '../services/anthropic.service';
import { whatsappService } from '../services/whatsapp.service';
import { ChatMessage } from '../models/types';

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
 * استقبال أحداث ورسائل واتساب ومعالجتها بالكامل
 */
export const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  // يرجى دائماً إرجاع الحالة 200 لـ WhatsApp فوراً لمنع تكرار إرسال الرسالة نفسها في حال بطء المعالجة
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

    // التأكد من وجود رسالة جديدة مرسلة
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

    // دعم أنواع الرسائل المختلفة (نصية، تفاعلية مثل أزرار أو قوائم)
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

    console.log(`[Webhook] تم استقبال رسالة من [${customerPhone}] متجهة للمطعم ذو المعرف [${whatsappNumberId}]: "${messageText}"`);

    // 3. تحديد المطعم المرتبط برقم الواتساب المستلم
    const restaurant = await prisma.restaurant.findUnique({
      where: { whatsapp_number_id: whatsappNumberId }
    });

    if (!restaurant) {
      console.warn(`[Webhook] تحذير: لم يتم العثور على مطعم مسجل في قاعدة البيانات للرقم الفريد: ${whatsappNumberId}`);
      // إرسال رد تلقائي افتراضي عبر واتساب مباشرة لإرشاد المرسل
      await whatsappService.sendTextMessage(
        customerPhone,
        'عذراً، هذا الرقم غير مرتبط بأي مطعم مسجل لدينا حالياً.',
        whatsappNumberId
      );
      return;
    }

    // 4. التحقق من صلاحية وحالة اشتراك المطعم
    if (restaurant.subscription_status !== 'ACTIVE' || new Date(restaurant.subscription_expires_at) < new Date()) {
      console.log(`[Webhook] اشتراك المطعم "${restaurant.name}" غير نشط أو منتهي الصلاحية.`);
      await whatsappService.sendTextMessage(
        customerPhone,
        `عذراً، خدمة المساعد الذكي لمطعم "${restaurant.name}" معطلة مؤقتاً لانتهاء فترة الاشتراك.`,
        whatsappNumberId
      );
      return;
    }

    // 5. جلب المحادثة النشطة للعميل أو إنشاء واحدة جديدة
    let conversation = await prisma.conversation.findFirst({
      where: {
        restaurant_id: restaurant.id,
        customer_phone: customerPhone,
        status: 'ACTIVE'
      }
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          restaurant_id: restaurant.id,
          customer_phone: customerPhone,
          messages_json: [],
          status: 'ACTIVE'
        }
      });
      console.log(`[Webhook] تم إنشاء سجل محادثة جديد للزبون [${customerPhone}] في مطعم [${restaurant.name}]`);
    }

    // قراءة السجل الحالي للرسائل
    const history = (conversation.messages_json as any) as ChatMessage[];

    // 6. تمرير المحادثة والرسالة لخدمة الذكاء الاصطناعي لمعالجتها وتفعيل الأدوات (Tool Calling)
    const { responseText, updatedHistory } = await anthropicService.processMessage(
      restaurant.id,
      restaurant.name,
      customerPhone,
      history,
      messageText
    );

    // 7. تحديث سجل المحادثة بقاعدة البيانات بالرسالة الجديدة والرد
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        messages_json: updatedHistory as any,
        updated_at: new Date()
      }
    });

    // 8. إرسال رد الـ AI للزبون على الواتساب
    await whatsappService.sendTextMessage(
      customerPhone,
      responseText,
      restaurant.whatsapp_number_id,
      restaurant.whatsapp_access_token || undefined
    );

    console.log(`[Webhook] تم إرسال الرد وتحديث السجل للزبون [${customerPhone}] بنجاح.`);

  } catch (error: any) {
    console.error('[Webhook] خطأ غير متوقع أثناء معالجة رسالة واتساب:', error);
  }
};

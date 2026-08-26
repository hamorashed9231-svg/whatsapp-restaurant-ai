import axios from 'axios';

class WhatsAppService {
  private token: string;
  private defaultPhoneNumberId: string;

  constructor() {
    this.token = process.env.WHATSAPP_TOKEN || '';
    this.defaultPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  }

  /**
   * إرسال رسالة نصية بسيطة للعميل عبر WhatsApp Cloud API
   * @param to رقم هاتف العميل المستلم (بالصيغة الدولية بدون + أو أصفار في البداية)
   * @param text نص الرسالة المراد إرسالها
   * @param customPhoneNumberId معرف الهاتف الخاص بالمطعم (إذا لم يتوفر، سيتم استخدام المعرف الافتراضي)
   */
  public async sendTextMessage(to: string, text: string, customPhoneNumberId?: string, customToken?: string): Promise<any> {
    const phoneNumberId = customPhoneNumberId || this.defaultPhoneNumberId;
    const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
    const token = customToken || this.token;

    if (!token) {
      console.warn('تنبيه: لم يتم ضبط WHATSAPP_TOKEN في متغيرات البيئة أو في إعدادات المطعم. سيتم تسجيل الرسالة في الكونسول فقط.');
      console.log(`[إرسال واتساب تجريبي] إلى ${to}: ${text}`);
      return { mock: true, success: true };
    }

    try {
      const response = await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to,
          type: 'text',
          text: {
            preview_url: false,
            body: text,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }
      );

      console.log(`تم إرسال الرسالة بنجاح للرقم ${to}. معرف الرسالة:`, response.data.messages?.[0]?.id);
      return response.data;
    } catch (error: any) {
      console.error('خطأ أثناء إرسال رسالة عبر واتساب:', error.response?.data || error.message);
      throw new Error(`فشل إرسال رسالة واتساب: ${JSON.stringify(error.response?.data || error.message)}`);
    }
  }
}

export const whatsappService = new WhatsAppService();

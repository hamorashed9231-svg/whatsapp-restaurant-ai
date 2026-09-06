import axios from 'axios';

export interface ListSectionRow {
  id: string;
  title: string;
  description?: string;
}

export interface ListSection {
  title: string;
  rows: ListSectionRow[];
}

class WhatsAppService {
  private token: string;
  private defaultPhoneNumberId: string;

  constructor() {
    this.token = process.env.WHATSAPP_TOKEN || '';
    this.defaultPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  }

  private getHeaders(customToken?: string) {
    const token = customToken || this.token;
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  private getUrl(customPhoneNumberId?: string) {
    const phoneNumberId = customPhoneNumberId || this.defaultPhoneNumberId;
    return `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  }

  /**
   * 1. إرسال رسالة نصية بسيطة
   */
  public async sendTextMessage(
    to: string,
    text: string,
    customPhoneNumberId?: string,
    customToken?: string
  ): Promise<any> {
    const token = customToken || this.token;
    if (!token || token.includes('ضع_توكين') || token === 'mock-token' || token.startsWith('EAAG...')) {
      console.log('-----------------------------------------------------------');
      console.log(`💬 [WhatsApp Mock Sent] إلى: ${to}`);
      console.log(`📝 [الرسالة]:\n${text}`);
      console.log('-----------------------------------------------------------');
      return { mock: true, success: true };
    }

    try {
      const response = await axios.post(
        this.getUrl(customPhoneNumberId),
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
        { headers: this.getHeaders(customToken) }
      );

      console.log(`[WhatsApp] تم إرسال رسالة نصية للرقم ${to}`);
      return response.data;
    } catch (error: any) {
      console.error('[WhatsApp Error] فشل إرسال النص:', error.response?.data || error.message);
      throw new Error(`فشل إرسال رسالة واتساب: ${JSON.stringify(error.response?.data || error.message)}`);
    }
  }

  /**
   * 2. إرسال صورة مع شرح نصي (Image with Caption)
   * تدعم الصور الخارجية عبر روابط HTTPS أو رفع الصور المحلية المباشرة (Base64) عبر Meta Media API
   */
  public async uploadMedia(
    dataUrl: string,
    customPhoneNumberId?: string,
    customToken?: string
  ): Promise<string> {
    const phoneNumberId = customPhoneNumberId || this.defaultPhoneNumberId;
    const token = customToken || this.token;

    const matches = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!matches) {
      throw new Error('صيغة الصورة Data URL غير صالحة.');
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');
    const extension = mimeType.split('/')[1] || 'jpg';
    const filename = `image_${Date.now()}.${extension}`;

    const blob = new Blob([buffer], { type: mimeType });
    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('file', blob, filename);
    formData.append('type', mimeType);

    const response = await axios.post(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/media`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return response.data.id;
  }

  public async sendImageMessage(
    to: string,
    imageUrl: string,
    caption?: string,
    customPhoneNumberId?: string,
    customToken?: string
  ): Promise<any> {
    const token = customToken || this.token;
    if (!token || token.includes('ضع_توكين') || token === 'mock-token' || token.startsWith('EAAG...')) {
      console.log(`[WhatsApp Mock Image] إلى ${to}: صورة [${imageUrl.slice(0, 40)}...] - الشرح: ${caption}`);
      return { mock: true, success: true };
    }

    try {
      let imagePayload: any = {};

      if (imageUrl.startsWith('data:image/')) {
        try {
          const mediaId = await this.uploadMedia(imageUrl, customPhoneNumberId, customToken);
          imagePayload = { id: mediaId, caption: caption || '' };
          console.log(`[WhatsApp Media] تم رفع الصورة المباشرة لـ Meta Media API بنجاح (Media ID: ${mediaId})`);
        } catch (uploadErr: any) {
          console.warn('[WhatsApp Media Upload Warn] تعذر الرفع لـ Meta Media API، يتم الاعتماد على رابط الصورة:', uploadErr.message);
          imagePayload = { link: imageUrl, caption: caption || '' };
        }
      } else {
        imagePayload = { link: imageUrl, caption: caption || '' };
      }

      const response = await axios.post(
        this.getUrl(customPhoneNumberId),
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to,
          type: 'image',
          image: imagePayload,
        },
        { headers: this.getHeaders(customToken) }
      );

      console.log(`[WhatsApp] تم إرسال الصورة للرقم ${to}`);
      return response.data;
    } catch (error: any) {
      console.error('[WhatsApp Error] فشل إرسال الصورة:', error.response?.data || error.message);
      throw new Error(`فشل إرسال صورة واتساب: ${JSON.stringify(error.response?.data || error.message)}`);
    }
  }

  /**
   * 3. إرسال قائمة تفاعلية بالأقسام والأصناف (Interactive Section List Menu)
   */
  public async sendInteractiveListMessage(
    to: string,
    title: string,
    bodyText: string,
    buttonText: string,
    sections: ListSection[],
    customPhoneNumberId?: string,
    customToken?: string
  ): Promise<any> {
    const token = customToken || this.token;
    if (!token) {
      console.log(`[WhatsApp Mock List] إلى ${to}: قائمة تفاعلية [${title}] بها ${sections.length} أقسام.`);
      return { mock: true, success: true };
    }

    try {
      const response = await axios.post(
        this.getUrl(customPhoneNumberId),
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to,
          type: 'interactive',
          interactive: {
            type: 'list',
            header: {
              type: 'text',
              text: title,
            },
            body: {
              text: bodyText,
            },
            footer: {
              text: 'اختر الصنف المطلوب بالضغط على الزر أدناه 🍕',
            },
            action: {
              button: buttonText,
              sections: sections,
            },
          },
        },
        { headers: this.getHeaders(customToken) }
      );

      console.log(`[WhatsApp] تم إرسال قائمة تفاعلية للرقم ${to}`);
      return response.data;
    } catch (error: any) {
      console.error('[WhatsApp Error] فشل إرسال القائمة التفاعلية:', error.response?.data || error.message);
      throw new Error(`فشل إرسال القائمة التفاعلية: ${JSON.stringify(error.response?.data || error.message)}`);
    }
  }

  /**
   * 4. إرسال كتالوج منتجات رسمية (Meta Multi-Product / Catalog Message)
   */
  public async sendCatalogMessage(
    to: string,
    bodyText: string,
    catalogId: string,
    sections: Array<{ title: string; product_items: Array<{ product_retailer_id: string }> }>,
    customPhoneNumberId?: string,
    customToken?: string
  ): Promise<any> {
    const token = customToken || this.token;
    if (!token) {
      console.log(`[WhatsApp Mock Catalog] إلى ${to}: كتالوج [Catalog ID: ${catalogId}]`);
      return { mock: true, success: true };
    }

    try {
      const response = await axios.post(
        this.getUrl(customPhoneNumberId),
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to,
          type: 'interactive',
          interactive: {
            type: 'product_list',
            header: {
              type: 'text',
              text: '🛒 كتالوج المطعم الرسمي',
            },
            body: {
              text: bodyText,
            },
            footer: {
              text: 'تصفح الأصناف وأضف لسلتك مباشرة 🍔',
            },
            action: {
              catalog_id: catalogId,
              sections: sections,
            },
          },
        },
        { headers: this.getHeaders(customToken) }
      );

      console.log(`[WhatsApp] تم إرسال كتالوج المنتجات للرقم ${to}`);
      return response.data;
    } catch (error: any) {
      console.error('[WhatsApp Error] فشل إرسال الكتالوج:', error.response?.data || error.message);
      throw new Error(`فشل إرسال الكتالوج: ${JSON.stringify(error.response?.data || error.message)}`);
    }
  }

  /**
   * 5. إرسال قالب رسمي معتمد من Meta (Official WhatsApp Template Message)
   * يُستخدم لإعادة فتح المحادثة بعد انتهاء نافذة الـ 24 ساعة (24-Hour Session Window Expiry)
   */
  public async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string = 'ar',
    components?: any[],
    customPhoneNumberId?: string,
    customToken?: string
  ): Promise<any> {
    const token = customToken || this.token;
    if (!token || token.includes('ضع_توكين') || token === 'mock-token' || token.startsWith('EAAG...')) {
      console.log('-----------------------------------------------------------');
      console.log(`📋 [WhatsApp Mock Template] إلى: ${to}`);
      console.log(`🏷️ [اسم القالب]: ${templateName} | اللغة: ${languageCode}`);
      console.log('-----------------------------------------------------------');
      return { mock: true, success: true };
    }

    try {
      const response = await axios.post(
        this.getUrl(customPhoneNumberId),
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to,
          type: 'template',
          template: {
            name: templateName,
            language: {
              code: languageCode,
            },
            ...(components && components.length > 0 ? { components } : {}),
          },
        },
        { headers: this.getHeaders(customToken) }
      );

      console.log(`[WhatsApp] تم إرسال القالب الرسمي (${templateName}) للرقم ${to}`);
      return response.data;
    } catch (error: any) {
      console.error('[WhatsApp Error] فشل إرسال القالب الرسمي:', error.response?.data || error.message);
      throw new Error(`فشل إرسال قالب واتساب الرسمي: ${JSON.stringify(error.response?.data || error.message)}`);
    }
  }
}

export const whatsappService = new WhatsAppService();

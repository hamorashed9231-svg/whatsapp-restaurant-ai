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
   */
  public async sendImageMessage(
    to: string,
    imageUrl: string,
    caption?: string,
    customPhoneNumberId?: string,
    customToken?: string
  ): Promise<any> {
    const token = customToken || this.token;
    if (!token) {
      console.log(`[WhatsApp Mock Image] إلى ${to}: صورة [${imageUrl}] - الشرح: ${caption}`);
      return { mock: true, success: true };
    }

    try {
      const response = await axios.post(
        this.getUrl(customPhoneNumberId),
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to,
          type: 'image',
          image: {
            link: imageUrl,
            caption: caption || '',
          },
        },
        { headers: this.getHeaders(customToken) }
      );

      console.log(`[WhatsApp] تم إرسال صورة للرقم ${to}`);
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
}

export const whatsappService = new WhatsAppService();

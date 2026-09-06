import axios from 'axios';
import FormData from 'form-data';

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
   * 1. إرسال رسالة نصية بسيطة (مع دعم الاقتباس contextMessageId)
   */
  public async sendTextMessage(
    to: string,
    text: string,
    contextMessageId?: string,
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
      const payload: any = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'text',
        text: {
          preview_url: false,
          body: text,
        },
      };

      if (contextMessageId) {
        payload.context = { message_id: contextMessageId };
      }

      const response = await axios.post(
        this.getUrl(customPhoneNumberId),
        payload,
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
   * 2. رفع وسائط لـ Meta Media API (صور أو فويس نوت أو مستندات)
   */
  public async uploadMedia(
    dataUrl: string,
    customPhoneNumberId?: string,
    customToken?: string
  ): Promise<string> {
    const phoneNumberId = customPhoneNumberId || this.defaultPhoneNumberId;
    const token = customToken || this.token;

    let mimeType = 'image/jpeg';
    let rawBase64 = '';

    const base64Index = dataUrl.indexOf(';base64,');
    if (base64Index !== -1) {
      mimeType = dataUrl.substring(5, base64Index);
      rawBase64 = dataUrl.substring(base64Index + 8);
    } else {
      const matches = dataUrl.match(/^data:([a-zA-Z0-9\+\-\.\/]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        rawBase64 = matches[2];
      } else {
        throw new Error('صيغة الوسائط Data URL غير صالحة.');
      }
    }

    const cleanBase64 = rawBase64.trim().replace(/\s/g, '').replace(/ /g, '+');
    const buffer = Buffer.from(cleanBase64, 'base64');
    let extension = mimeType.split('/')[1] || 'jpg';
    if (extension === 'jpeg') extension = 'jpg';
    const filename = `image_${Date.now()}.${extension}`;

    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('file', buffer, { filename, contentType: mimeType });
    formData.append('type', mimeType);

    try {
      const response = await axios.post(
        `https://graph.facebook.com/v20.0/${phoneNumberId}/media`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return response.data.id;
    } catch (uploadErr: any) {
      console.error('[WhatsApp Media Upload Error]:', uploadErr.response?.data || uploadErr.message);
      const metaErrMsg = uploadErr.response?.data?.error?.message || uploadErr.message;
      throw new Error(`فشل رفع الصورة لـ Meta Media API: ${metaErrMsg}`);
    }
  }

  public async sendImageMessage(
    to: string,
    imageUrl: string,
    caption?: string,
    customPhoneNumberId?: string,
    customToken?: string
  ): Promise<any> {
    const token = customToken || this.token;
    if (!token || token.includes('ضع_توكين') || token === 'mock-token' || token === 'EAAG...') {
      console.log(`[WhatsApp Mock Image] إلى ${to}: صورة [${imageUrl.slice(0, 40)}...] - الشرح: ${caption}`);
      return { mock: true, success: true };
    }

    try {
      let imagePayload: any = {};

      if (imageUrl.startsWith('data:image/')) {
        const mediaId = await this.uploadMedia(imageUrl, customPhoneNumberId, customToken);
        imagePayload = { id: mediaId, caption: caption || '' };
        console.log(`[WhatsApp Media] تم رفع الصورة المباشرة لـ Meta Media API بنجاح (Media ID: ${mediaId})`);
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
      const metaErrMsg = error.response?.data?.error?.message || error.message;
      throw new Error(`فشل إرسال صورة واتساب: ${metaErrMsg}`);
    }
  }

  /**
   * 2.5. إرسال تسجيل صوتي / فويس نوت (Audio / Voice Note)
   */
  public async sendAudioMessage(
    to: string,
    audioUrlOrDataUrl: string,
    contextMessageId?: string,
    customPhoneNumberId?: string,
    customToken?: string
  ): Promise<any> {
    const token = customToken || this.token;
    if (!token || token.includes('ضع_توكين') || token === 'mock-token' || token.startsWith('EAAG...')) {
      console.log(`[WhatsApp Mock Audio] إلى ${to}: تسجيل صوتي [${audioUrlOrDataUrl.slice(0, 40)}...]`);
      return { mock: true, success: true };
    }

    try {
      let audioPayload: any = {};
      if (audioUrlOrDataUrl.startsWith('data:audio/') || audioUrlOrDataUrl.startsWith('data:video/webm')) {
        const mediaId = await this.uploadMedia(audioUrlOrDataUrl, customPhoneNumberId, customToken);
        audioPayload = { id: mediaId };
      } else {
        audioPayload = { link: audioUrlOrDataUrl };
      }

      const payload: any = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'audio',
        audio: audioPayload,
      };

      if (contextMessageId) {
        payload.context = { message_id: contextMessageId };
      }

      const response = await axios.post(
        this.getUrl(customPhoneNumberId),
        payload,
        { headers: this.getHeaders(customToken) }
      );

      console.log(`[WhatsApp] تم إرسال التسجيل الصوتي للرقم ${to}`);
      return response.data;
    } catch (error: any) {
      console.error('[WhatsApp Error] فشل إرسال التسجيل الصوتي:', error.response?.data || error.message);
      const metaErrMsg = error.response?.data?.error?.message || error.message;
      throw new Error(`فشل إرسال التسجيل الصوتي عبر الواتساب: ${metaErrMsg}`);
    }
  }

  /**
   * 2.6. إرسال ملصق (Sticker)
   */
  public async sendStickerMessage(
    to: string,
    stickerUrlOrDataUrl: string,
    contextMessageId?: string,
    customPhoneNumberId?: string,
    customToken?: string
  ): Promise<any> {
    const token = customToken || this.token;
    if (!token || token.includes('ضع_توكين') || token === 'mock-token' || token.startsWith('EAAG...')) {
      console.log(`[WhatsApp Mock Sticker] إلى ${to}: ملصق [${stickerUrlOrDataUrl.slice(0, 40)}...]`);
      return { mock: true, success: true };
    }

    try {
      let stickerPayload: any = {};
      if (stickerUrlOrDataUrl.startsWith('data:')) {
        const mediaId = await this.uploadMedia(stickerUrlOrDataUrl, customPhoneNumberId, customToken);
        stickerPayload = { id: mediaId };
      } else {
        stickerPayload = { link: stickerUrlOrDataUrl };
      }

      const payload: any = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'sticker',
        sticker: stickerPayload,
      };

      if (contextMessageId) {
        payload.context = { message_id: contextMessageId };
      }

      const response = await axios.post(
        this.getUrl(customPhoneNumberId),
        payload,
        { headers: this.getHeaders(customToken) }
      );

      console.log(`[WhatsApp] تم إرسال الملصق للرقم ${to}`);
      return response.data;
    } catch (error: any) {
      console.error('[WhatsApp Error] فشل إرسال الملصق:', error.response?.data || error.message);
      const metaErrMsg = error.response?.data?.error?.message || error.message;
      throw new Error(`فشل إرسال الملصق عبر الواتساب: ${metaErrMsg}`);
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
      const metaErr = error.response?.data?.error;
      if (metaErr?.code === 131009 || metaErr?.error_data?.details?.includes('catalog')) {
        throw new Error('لم يتم ربط الكتالوج بحساب الواتساب التجاري في مدير أعمال Meta (Meta Business Manager). يرجى فتح إعدادات الواتساب (WhatsApp Accounts -> Commerce Settings) وربط الكتالوج.');
      }
      throw new Error(`فشل إرسال الكتالوج: ${metaErr?.message || error.message}`);
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

  /**
   * إرسال رسالة الكتالوج الرسمي المباشرة من Meta (Native WhatsApp Catalog Message)
   */
  public async sendNativeCatalogMessage(
    to: string,
    bodyText: string = 'تفضل بتصفح قائمة الأصناف الكاملة واختيار وجبتك مباشرة 🌯',
    thumbnailItemId?: string,
    customPhoneNumberId?: string,
    customToken?: string
  ): Promise<any> {
    const token = customToken || this.token;
    if (!token || token.includes('ضع_توكين') || token === 'mock-token') {
      console.log(`[WhatsApp Mock Catalog] إلى ${to}: إرسال رسالة الكتالوج المباشرة.`);
      return { mock: true, success: true };
    }

    try {
      const payload: any = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'interactive',
        interactive: {
          type: 'catalog_message',
          body: {
            text: bodyText
          },
          action: {
            name: 'catalog_message',
            ...(thumbnailItemId ? { parameters: { thumbnail_product_retailer_id: thumbnailItemId } } : {})
          }
        }
      };

      const response = await axios.post(
        this.getUrl(customPhoneNumberId),
        payload,
        { headers: this.getHeaders(customToken) }
      );

      console.log(`[WhatsApp] تم إرسال رسالة الكتالوج المباشرة للرقم ${to}`);
      return response.data;
    } catch (error: any) {
      console.error('[WhatsApp Error] فشل إرسال رسالة الكتالوج المباشرة:', error.response?.data || error.message);
      const metaErr = error.response?.data?.error;
      if (metaErr?.code === 131009 || metaErr?.error_data?.details?.includes('catalog')) {
        throw new Error('لم يتم ربط الكتالوج بحساب الواتساب التجاري في مدير أعمال Meta (Meta Business Manager). يرجى فتح إعدادات الواتساب (WhatsApp Accounts -> Commerce Settings) وربط الكتالوج.');
      }
      throw new Error(`فشل إرسال رسالة الكتالوج المباشرة: ${metaErr?.message || error.message}`);
    }
  }

  /**
   * جلب وتحويل رابط/بيانات الوسائط الواردة من واتساب Meta Media API
   */
  public async getMediaUrl(mediaId: string, customToken?: string): Promise<string | null> {
    const token = customToken || this.token;
    if (!token || token.includes('ضع_توكين') || token === 'mock-token') return null;

    try {
      const metaRes = await axios.get(`https://graph.facebook.com/v18.0/${mediaId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const mediaDirectUrl = metaRes.data?.url;
      if (!mediaDirectUrl) return null;

      const binaryRes = await axios.get(mediaDirectUrl, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'arraybuffer'
      });
      const mimeType = metaRes.data?.mime_type || 'image/jpeg';
      const base64Data = Buffer.from(binaryRes.data, 'binary').toString('base64');
      return `data:${mimeType};base64,${base64Data}`;
    } catch (err: any) {
      console.error('[WhatsApp Media Fetch Error]:', err.response?.data || err.message);
      return null;
    }
  }
}

export const whatsappService = new WhatsAppService();

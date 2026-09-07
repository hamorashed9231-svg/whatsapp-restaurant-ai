// تعريف واجهات البيانات والأنواع المستخدمة في التطبيق

// هيكلية الرسالة المخزنة في سجل المحادثة
export interface ChatMessage {
  id?: string;
  wamid?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sender_name?: string;
  image_url?: string;
  media_id?: string;
  audio_url?: string;
  sticker_url?: string;
  document_url?: string;
  reply_to_id?: string;
  reaction?: string;
  is_edited?: boolean;
  edited_at?: string;
  timestamp: string; // صيغة ISO 8601
}

// هيكلية عنصر الطلب المخزن في حقل items_json
export interface OrderItem {
  name: string;
  quantity: number;
  price: number; // السعر وقت الطلب
}

// معلومات الزبون أو سياق المحادثة المستلم من واتساب
export interface WhatsAppMessageMetadata {
  from: string;          // رقم هاتف المرسل (الزبون)
  messageId: string;     // معرف الرسالة الفريد من واتساب
  text: string;          // نص الرسالة المستلمة
  timestamp: string;     // وقت الاستلام
}

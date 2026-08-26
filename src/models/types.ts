// تعريف واجهات البيانات والأنواع المستخدمة في التطبيق

// هيكلية الرسالة المخزنة في سجل المحادثة
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
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

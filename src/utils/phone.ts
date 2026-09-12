/**
 * توحيد صيغة رقم الهاتف ومعرف العملاء لمنع تكرار المحادثات واختلاط الشاتات نهائياً
 * يدعم أيضاً المعرفات النصية (Usernames / Meta IDs) للمستخدمين الذين لا يملكون رقم هاتف رقمي
 */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const trimmed = String(phone).trim();
  if (!trimmed) return '';

  // إذا كان المعرف يبدأ بـ wa_user_ أو anon_user_ أو demo- فهو معرف عاطفي/نظامي مجهز مسبقاً ويجب إرجاعه كما هو
  if (trimmed.startsWith('wa_user_') || trimmed.startsWith('anon_user_') || trimmed.startsWith('demo-')) {
    return trimmed;
  }

  let cleanedDigits = trimmed.replace(/[^\d]/g, '');
  if (cleanedDigits.startsWith('00')) {
    cleanedDigits = cleanedDigits.substring(2);
  }

  // إذا كان الإدخال يحتوي على أرقام هواتف رقمية صريحة (مثل +2010... أو 002010... أو أرقام فقط)
  // بشرط ألا يكون نصاً مختلطاً يحتوي على حروف واسم مستخدم
  const hasLetters = /[a-zA-Z]/.test(trimmed);
  if (cleanedDigits.length > 0 && !hasLetters) {
    return cleanedDigits;
  }

  // إذا كان المعرف نصياً (مثل اسم مستخدم @Haggag أو ID نصي)، يعاد تنظيفه بشكل ثابت
  const sanitized = trimmed.replace(/[^a-zA-Z0-9_+\-@.]/g, '');
  return sanitized || 'unknown_user';
}

/**
 * الدالة الموحدة لاستخراج معرف العميل الثابت 100% من الرسالة
 * تُستخدم في webhook.controller, processDirectly, و whatsapp.worker
 */
export function resolveCustomerIdentifier(
  rawFrom: string | null | undefined,
  waId?: string | null | undefined,
  fallbackMessageId?: string | null | undefined
): string {
  const candidate = (rawFrom && String(rawFrom).trim()) || (waId && String(waId).trim()) || '';

  if (candidate && candidate !== 'unknown_user') {
    const normalized = normalizePhone(candidate);
    if (normalized && normalized !== 'unknown_user') {
      return normalized;
    }
  }

  if (candidate) {
    const cleanCand = candidate.replace(/[^a-zA-Z0-9_+\-@.]/g, '');
    if (cleanCand) return cleanCand;
  }

  return `anon_user_${fallbackMessageId || 'unknown'}`;
}



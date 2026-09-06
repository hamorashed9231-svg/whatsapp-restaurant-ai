/**
 * توحيد صيغة رقم الهاتف لمنع تكرار المحادثات واختلاط الشاتات نهائياً
 * يدعم أيضاً المعرفات النصية (Usernames) للمستخدمين الذين لا يملكون رقم هاتف رقمي
 */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const trimmed = String(phone).trim();
  if (!trimmed) return '';

  let cleanedDigits = trimmed.replace(/[^\d]/g, '');
  if (cleanedDigits.startsWith('00')) {
    cleanedDigits = cleanedDigits.substring(2);
  }

  // إذا كان المعرف يحتوي على أرقام هواتف رقمية، تعاد الأرقام الموحدة
  if (cleanedDigits.length > 0) {
    return cleanedDigits;
  }

  // إذا كان المعرف نصياً بالكامل (مثل اسم مستخدم أو ID بدون أرقام)، يعاد تنظيفه بدون إرجاع نص فارغ
  return trimmed.replace(/[^a-zA-Z0-9_+\-@.]/g, '') || 'unknown_user';
}


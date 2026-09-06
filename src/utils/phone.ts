/**
 * توحيد صيغة رقم الهاتف لمنع تكرار المحادثات واختلاط الشاتات نهائياً
 */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  let cleaned = phone.replace(/[^\d]/g, '');
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2);
  }
  return cleaned;
}

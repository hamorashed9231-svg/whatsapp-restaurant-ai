/**
 * دالة مركزية لتحديد رابط API الصحيح حسب البيئة:
 * - إذا كان VITE_API_URL معرّفاً في بيئة العمل، يُستخدم فوراً.
 * - إذا كانت الصفحات تعمل على دومين حقيقي في الإنتاج (ليس localhost)، يتم استخدام الرابط النسبي /api لتوجيه الطلبات تلقائياً لنفس الدومين.
 * - إذا كان التشغيل محلياً على جهاز التطوير، يتم استخدام http://localhost:3000/api كخيار افتراضي.
 */
export const getApiUrl = (): string => {
  if (import.meta.env.VITE_API_URL && import.meta.env.VITE_API_URL !== 'http://localhost:3000/api') {
    return import.meta.env.VITE_API_URL;
  }
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return '/api';
  }
  return 'http://localhost:3000/api';
};

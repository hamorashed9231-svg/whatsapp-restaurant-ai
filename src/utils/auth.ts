import crypto from 'crypto';

/**
 * تشفير كلمة المرور باستخدام SHA-256
 * @param password كلمة المرور النصية
 */
export const hashPassword = (password: string): string => {
  const cleanPassword = String(password || '').trim();
  return crypto.createHash('sha256').update(cleanPassword).digest('hex');
};

/**
 * مقارنة كلمة مرور نصية بكلمة مرور مشفرة
 * @param password كلمة المرور المدخلة
 * @param hash كلمة المرور المشفرة المخزنة في قاعدة البيانات
 */
export const comparePassword = (password: string, hash: string): boolean => {
  if (!hash) return false;
  return hashPassword(password) === hash;
};

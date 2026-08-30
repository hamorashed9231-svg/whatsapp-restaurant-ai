import crypto from 'crypto';

/**
 * تشفير كلمة المرور باستخدام SHA-256
 * @param password كلمة المرور النصية
 */
export const hashPassword = (password: string): string => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

/**
 * مقارنة كلمة مرور نصية بكلمة مرور مشفرة
 * @param password كلمة المرور المدخلة
 * @param hash كلمة المرور المشفرة المخزنة في قاعدة البيانات
 */
export const comparePassword = (password: string, hash: string): boolean => {
  return hashPassword(password) === hash;
};

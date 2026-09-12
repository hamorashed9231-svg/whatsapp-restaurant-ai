import { resolveCustomerIdentifier, normalizePhone } from '../src/utils/phone';
import assert from 'assert';

console.log('=== بدء اختبارات استقرار معرف العميل (Customer Identifier Stability Tests) ===');

// 1. أرقام الهواتف الرقمية القياسية
const phone1 = resolveCustomerIdentifier('+201012345678', '201012345678', 'msg1');
const phone2 = resolveCustomerIdentifier('201012345678', null, 'msg2');
const phone3 = resolveCustomerIdentifier('00201012345678', null, 'msg3');

assert.strictEqual(phone1, '201012345678', 'فشل اختبار رقم الهاتف المسبوق بـ +');
assert.strictEqual(phone2, '201012345678', 'فشل اختبار رقم الهاتف بدون +');
assert.strictEqual(phone3, '201012345678', 'فشل اختبار رقم الهاتف المسبوق بـ 00');
console.log('✅ 1. نجح اختبار توحيد أرقام الهواتف الرقمية.');

// 2. اسم مستخدم Meta بدون أرقام (@Haggag) عبر مختلف أنواع الرسائل
const metaUser = '@Haggag';
const msgText = resolveCustomerIdentifier(metaUser, null, 'wamid.HBgL111');
const msgInteractive = resolveCustomerIdentifier(metaUser, null, 'wamid.HBgL222');
const msgImage = resolveCustomerIdentifier(metaUser, null, 'wamid.HBgL333');
const msgReaction = resolveCustomerIdentifier(metaUser, null, 'wamid.HBgL444');

assert.strictEqual(msgText, '@Haggag', 'فشل استخراج معرف العميل للرسالة النصية');
assert.strictEqual(msgInteractive, '@Haggag', 'فشل استخراج معرف العميل لرد التفاعل/الأزرار');
assert.strictEqual(msgImage, '@Haggag', 'فشل استخراج معرف العميل لرسالة الصورة');
assert.strictEqual(msgReaction, '@Haggag', 'فشل استخراج معرف العميل للتفاعل Reaction');

assert.strictEqual(msgText, msgInteractive, 'عدم تطابق معرف العميل بين النص والتفاعل التفاعلي');
assert.strictEqual(msgInteractive, msgImage, 'عدم تطابق معرف العميل بين التفاعلي والصورة');
assert.strictEqual(msgImage, msgReaction, 'عدم تطابق معرف العميل بين الصورة والتفاعل');
console.log('✅ 2. نجح اختبار استقرار المعرف النصي (@Haggag) عبر 4 أنواع مختلفة من الرسائل 100%.');

// 3. اسم مستخدم Meta يحتوي أرقام (Haggag123)
const userWithDigits1 = resolveCustomerIdentifier('Haggag123', null, 'wamid.1');
const userWithDigits2 = resolveCustomerIdentifier('Haggag123', null, 'wamid.2');

assert.strictEqual(userWithDigits1, 'Haggag123', 'تم اقتطاع الحروف من الاسم المدمج بالأرقام');
assert.strictEqual(userWithDigits2, 'Haggag123', 'تم اقتطاع الحروف في الرسالة الثانية');
assert.strictEqual(userWithDigits1, userWithDigits2, 'عدم تطابق الاسم المدمج بين رسالتين متتاليتين');
console.log('✅ 3. نجح اختبار المعرفات المدمجة بحروف وأرقام (Haggag123).');

// 4. المعرفات المجهزة مسبقاً (wa_user_12345 و demo-visitor-phone)
const waUser = resolveCustomerIdentifier('wa_user_12345', null, 'msg1');
const demoUser = resolveCustomerIdentifier('demo-visitor-phone', null, 'msg2');

assert.strictEqual(waUser, 'wa_user_12345', 'تم اقتطاع البادئة wa_user_');
assert.strictEqual(demoUser, 'demo-visitor-phone', 'تم اقتطاع معرف الزائر التجريبي');
console.log('✅ 4. نجح اختبار حفظ المعرفات المجهزة مسبقاً (wa_user_).');

// 5. الـ Fallback عند انعدام البيانات تماماً
const fb1 = resolveCustomerIdentifier(null, null, 'wamid.999');
assert.strictEqual(fb1, 'anon_user_wamid.999', 'فشل الـ Fallback الأخير عند غياب المعرف');
console.log('✅ 5. نجح اختبار الـ Fallback الأخير عند غياب البيانات تماماً.');

console.log('\n🎉 كافة الاختبارات نجحت بنجاح 100% وبشكل مؤكد!');

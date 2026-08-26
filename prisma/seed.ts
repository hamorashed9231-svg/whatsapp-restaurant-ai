import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('جاري بدء عملية تهيئة البيانات (Seeding)...');

  // 1. تنظيف قاعدة البيانات القديمة (اختياري)
  await prisma.reservation.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.conversation.deleteMany({});
  await prisma.menuItem.deleteMany({});
  await prisma.restaurant.deleteMany({});

  // 2. إنشاء مطعم افتراضي
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  const restaurant = await prisma.restaurant.create({
    data: {
      name: 'مطعم ومطبخ البركة شاورما',
      phone_number: '+966500000000',
      whatsapp_number_id: '1234567890', // معرف الواتساب بيزنس
      subscription_tier: 'PREMIUM',
      subscription_status: 'ACTIVE',
      subscription_expires_at: oneYearFromNow,
    },
  });

  console.log(`تم إنشاء المطعم: ${restaurant.name} (معرف: ${restaurant.id})`);

  // 3. إنشاء عناصر قائمة الطعام (Menu Items)
  const menuItems = [
    {
      restaurant_id: restaurant.id,
      name: 'شاورما دجاج جامبو',
      description: 'شاورما دجاج بخبز الصاج المميز مع الثوم والبطاطس والخلطة الخاصة',
      price: 15.00,
      category: 'وجبات رئيسية',
      is_available: true,
    },
    {
      restaurant_id: restaurant.id,
      name: 'بيتزا مارغريتا وسط',
      description: 'عجينة بيتزا هشة مع صلصة الطماطم الإيطالية وجبنة الموزاريلا الفاخرة والأوريغانو',
      price: 25.00,
      category: 'وجبات رئيسية',
      is_available: true,
    },
    {
      restaurant_id: restaurant.id,
      name: 'بطاطس مقلية مع الجبنة',
      description: 'أصابع بطاطس مقرمشة مغطاة بصلصة الجبن الغنية',
      price: 10.00,
      category: 'مقبلات',
      is_available: true,
    },
    {
      restaurant_id: restaurant.id,
      name: 'عصير برتقال طازج',
      description: 'عصير برتقال طبيعي 100% معصور طازجاً بدون إضافة سكر',
      price: 8.00,
      category: 'مشروبات',
      is_available: true,
    },
    {
      restaurant_id: restaurant.id,
      name: 'كولا بارد',
      description: 'علبة كولا مثلجة 330 مل',
      price: 5.00,
      category: 'مشروبات',
      is_available: true,
    },
  ];

  for (const item of menuItems) {
    const createdItem = await prisma.menuItem.create({
      data: item,
    });
    console.log(`تم إضافة صنف للمنيو: ${createdItem.name} (${createdItem.price} ريال)`);
  }

  console.log('✅ اكتملت عملية تهيئة البيانات بنجاح!');
}

main()
  .catch((e) => {
    console.error('خطأ أثناء عملية التهيئة (Seed Error):', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('جاري بدء عملية تهيئة البيانات (Seeding)...');

  // 1. تنظيف قاعدة البيانات القديمة
  await prisma.reservation.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.conversation.deleteMany({});
  await prisma.menuItem.deleteMany({});
  await prisma.restaurant.deleteMany({});

  // 2. إنشاء مطعم عم عيسى
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  const restaurant = await prisma.restaurant.create({
    data: {
      name: 'مطعم عم عيسى',
      phone_number: '+201000000000',
      whatsapp_number_id: '1234567890',
      subscription_tier: 'PREMIUM',
      subscription_status: 'ACTIVE',
      subscription_expires_at: oneYearFromNow,
    },
  });

  console.log(`تم إنشاء المطعم: ${restaurant.name} (معرف: ${restaurant.id})`);
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


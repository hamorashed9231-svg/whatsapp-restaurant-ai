import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

const hashPassword = (password: string): string => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

async function main() {
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  const existingRestaurant = await prisma.restaurant.findFirst({
    where: { name: 'مطعم عم عيسى' }
  });

  let restaurant = existingRestaurant;
  if (!restaurant) {
    restaurant = await prisma.restaurant.create({
      data: {
        name: 'مطعم عم عيسى',
        phone_number: '+201012345678',
        whatsapp_number_id: '100020003000',
        subscription_tier: 'PREMIUM',
        subscription_status: 'ACTIVE',
        subscription_expires_at: oneYearFromNow,
      }
    });
    console.log('✅ تم إنشاء مطعم عم عيسى بنجاح!');
  } else {
    console.log('ℹ️ مطعم عم عيسى موجود بالفعل.');
  }

  const hashedPassword = hashPassword('20002000');
  
  const existingUser = await prisma.user.findUnique({
    where: { username: 'houda' }
  });

  if (existingUser) {
    await prisma.user.update({
      where: { username: 'houda' },
      data: { password: hashedPassword, role: 'admin' }
    });
    console.log('✅ تم تحديث كلمة المرور لحساب houda بنجاح!');
  } else {
    await prisma.user.create({
      data: {
        username: 'houda',
        password: hashedPassword,
        role: 'admin'
      }
    });
    console.log('✅ تم إنشاء حساب houda بنجاح!');
  }
}

main()
  .catch(e => {
    console.error('خطأ:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

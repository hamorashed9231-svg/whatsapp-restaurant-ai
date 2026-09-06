import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

const hashPassword = (password: string): string => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

async function main() {
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  const eissaToken = 'EAAfbQuX71okBSb0OnQB8oEzZBEdjEyvHkf4Ljxj7JwtIFlK0lnLgLAXrOQZAKZCWdFZCHYKLFROBTZCyYpQGYIFISZAdZBkLP6Gm5G4SQikGlJQyqvetX2f1CKzmxRbZCPyjar6uvsBSyZACYasSOTTAZALCKwJhyYVbQYGP3ngla4ZCoN3p9IJJKKKhRJRK3xT0wZDZD';

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
        whatsapp_access_token: eissaToken,
        subscription_tier: 'PREMIUM',
        subscription_status: 'ACTIVE',
        subscription_expires_at: oneYearFromNow,
      }
    });
    console.log('✅ تم إنشاء مطعم عم عيسى وتعيين الـ Token بنجاح!');
  } else {
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { whatsapp_access_token: eissaToken }
    });
    console.log('✅ تم تحديث الـ Token المخصص لمطعم عم عيسى بنجاح!');
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

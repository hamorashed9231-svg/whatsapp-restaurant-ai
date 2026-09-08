import { prisma } from '../src/services/prisma.service';

async function cleanExistingUsers() {
  console.log('--- USERS CLEANUP AND RESTAURANT LINKAGE SCRIPT ---');

  const defaultRest = await prisma.restaurant.findFirst({
    where: { subscription_status: 'ACTIVE' }
  }) || await prisma.restaurant.findFirst();

  if (!defaultRest) {
    console.error('❌ Error: No default restaurant found in DB!');
    return;
  }

  console.log(`📌 Target Default Restaurant: ${defaultRest.name} (ID: ${defaultRest.id})`);

  const users = await prisma.user.findMany();
  console.log(`Found ${users.length} users in DB.\n`);

  const updatedUsersList: { id: string; oldUsername: string; newUsername: string; oldRestId: string | null; newRestId: string }[] = [];

  for (const u of users) {
    const trimmedLowerUsername = u.username.trim().toLowerCase();
    const needsUsernameUpdate = u.username !== trimmedLowerUsername;
    const needsRestIdUpdate = !u.restaurant_id;

    if (needsUsernameUpdate || needsRestIdUpdate) {
      const updated = await prisma.user.update({
        where: { id: u.id },
        data: {
          username: trimmedLowerUsername,
          restaurant_id: u.restaurant_id || defaultRest.id
        }
      });

      updatedUsersList.push({
        id: u.id,
        oldUsername: u.username,
        newUsername: updated.username,
        oldRestId: u.restaurant_id,
        newRestId: updated.restaurant_id!
      });
    }
  }

  if (updatedUsersList.length === 0) {
    console.log('✅ All existing users are already clean, lowercased, and linked to default restaurant.');
  } else {
    console.log(`✅ Updated ${updatedUsersList.length} users:`);
    updatedUsersList.forEach(u => {
      console.log(`  - ID: ${u.id}`);
      console.log(`    Username: "${u.oldUsername}" ➔ "${u.newUsername}"`);
      console.log(`    Restaurant ID: ${u.oldRestId || 'null'} ➔ "${u.newRestId}"`);
    });
  }
}

cleanExistingUsers()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

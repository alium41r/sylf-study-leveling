require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { faker } = require('@faker-js/faker');
const bcrypt = require('bcryptjs');

const connectionString = process.env.DATABASE_POOL_URL || process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Create 50 Mock Users
  console.log('👤 Seeding 50 mock users...');
  const users = [];
  const defaultPassword = await bcrypt.hash('password123', 10);
  
  // Add a test user for easy login
  users.push(await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      email: 'test@example.com',
      username: 'TestHunter',
      name: 'Sung Jin-Woo',
      password: defaultPassword,
      hunterRank: 'S',
      level: 50,
      currentXP: 450,
      xpToNextLevel: 1000,
      streakDays: 12,
      totalStudyMinutes: 3000,
    }
  }));

  for (let i = 0; i < 49; i++) {
    const user = await prisma.user.create({
      data: {
        email: faker.internet.email(),
        username: faker.internet.userName() + i,
        name: faker.person.fullName(),
        password: defaultPassword,
        hunterRank: faker.helpers.arrayElement(['E', 'D', 'C', 'B', 'A', 'S']),
        level: faker.number.int({ min: 1, max: 60 }),
        currentXP: faker.number.int({ min: 0, max: 500 }),
        streakDays: faker.number.int({ min: 0, max: 30 }),
        totalStudyMinutes: faker.number.int({ min: 0, max: 10000 }),
        lastActiveDate: faker.date.recent({ days: 10 }).toISOString(),
      }
    });
    users.push(user);
  }

  // 2. Create Goals and Quests
  console.log('📜 Seeding goals and quests...');
  const quests = [];
  for (const user of users) {
    // Each user gets 1-3 goals
    const numGoals = faker.number.int({ min: 1, max: 3 });
    for (let g = 0; g < numGoals; g++) {
      const goal = await prisma.goal.create({
        data: {
          userId: user.id,
          title: faker.lorem.words({ min: 2, max: 5 }),
          description: faker.lorem.sentence(),
          targetWeeks: faker.number.int({ min: 1, max: 12 }),
          effortLevel: faker.helpers.arrayElement(['EASY', 'NORMAL', 'HARD']),
        }
      });

      // Each goal gets 2-5 quests
      const numQuests = faker.number.int({ min: 2, max: 5 });
      for (let q = 0; q < numQuests; q++) {
        const quest = await prisma.quest.create({
          data: {
            userId: user.id,
            goalId: goal.id,
            title: faker.lorem.words({ min: 2, max: 4 }),
            description: faker.lorem.sentence(),
            status: faker.helpers.arrayElement(['PENDING', 'IN_PROGRESS', 'COMPLETED']),
            requiredMinutes: faker.number.int({ min: 15, max: 120 }),
            xpReward: faker.number.int({ min: 50, max: 300 }),
            sylphReward: faker.number.int({ min: 10, max: 100 }),
            scheduledFor: faker.date.recent({ days: 30 }).toISOString().split('T')[0],
          }
        });
        quests.push(quest);
      }
    }
  }

  // 3. Create Study Sessions
  console.log('⏱️ Seeding study sessions...');
  for (let i = 0; i < 100; i++) {
    const randomUser = faker.helpers.arrayElement(users);
    const randomQuest = faker.helpers.arrayElement(quests.filter(q => q.userId === randomUser.id));
    
    await prisma.studySession.create({
      data: {
        userId: randomUser.id,
        questId: randomQuest ? randomQuest.id : null,
        durationMinutes: faker.number.int({ min: 10, max: 120 }),
        startedAt: faker.date.recent({ days: 30 }),
        endedAt: faker.date.recent({ days: 29 }), // roughly after startedAt
      }
    });
  }

  console.log('✅ Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

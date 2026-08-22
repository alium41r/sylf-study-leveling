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
        username: faker.internet.username() + i,
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
          effortLevel: faker.helpers.arrayElement(['RELAXED', 'NORMAL', 'INTENSE', 'EXTREME'] as const),
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

  // 4. Create Acoustic Tracks
  console.log('🎧 Seeding pure acoustic nature, ambient & noise soundscapes...');
  
  // Clean up any old musical entries
  await prisma.acousticTrack.deleteMany({
    where: {
      category: { in: ["LOFI", "PIANO", "BINAURAL", "ELECTRONIC"] }
    }
  });

  const defaultTracks = [
    // ─── NATURE & WEATHER ─────────────────────────────────────
    {
      title: "Forest Wind & Leaves",
      category: "NATURE",
      frequency: "Organic Wind",
      audioUrl: "/audio/ambient/wind.ogg",
      duration: 60,
      defaultVolume: 0.65,
      description: "Gentle woodland breeze rustling through high canopies and forest foliage.",
      tags: ["Forest", "Wind", "Nature", "Calm"],
      isPreset: true,
      orderIndex: 0,
    },
    {
      title: "Ocean Waves & Surf",
      category: "NATURE",
      frequency: "0.1Hz Swell",
      audioUrl: "/audio/ambient/waves.ogg",
      duration: 60,
      defaultVolume: 0.75,
      description: "Deep oceanic swells and gentle foaming surf rolling rhythmically onto shore.",
      tags: ["Ocean", "Waves", "Nature", "Rhythm"],
      isPreset: true,
      orderIndex: 1,
    },
    {
      title: "Running Mountain Stream",
      category: "NATURE",
      frequency: "Flowing Water",
      audioUrl: "/audio/ambient/stream.ogg",
      duration: 60,
      defaultVolume: 0.7,
      description: "Gentle bubbling mountain stream with natural water resonance.",
      tags: ["Stream", "Water", "Nature", "Fresh"],
      isPreset: true,
      orderIndex: 2,
    },
    {
      title: "Summer Night Crickets",
      category: "NATURE",
      frequency: "Nocturnal Field",
      audioUrl: "/audio/ambient/summer-night.ogg",
      duration: 60,
      defaultVolume: 0.65,
      description: "Calm evening breeze and distant meadow crickets for quiet nocturnal study.",
      tags: ["Night", "Summer", "Nature", "Focus"],
      isPreset: true,
      orderIndex: 3,
    },
    {
      title: "Night Campfire Glow",
      category: "NATURE",
      frequency: "Thermal Glow",
      audioUrl: "/audio/ambient/fireplace.ogg",
      duration: 60,
      defaultVolume: 0.7,
      description: "Subtle ember crackles and warm low flame hum for quiet study sessions.",
      tags: ["Campfire", "Night", "Warmth", "Cabin"],
      isPreset: true,
      orderIndex: 4,
    },
    {
      title: "Forest Birds & Foliage",
      category: "NATURE",
      frequency: "Woodland Canopy",
      audioUrl: "/audio/ambient/birds.ogg",
      duration: 60,
      defaultVolume: 0.65,
      description: "Gentle woodland canopy atmosphere with distant birdsong.",
      tags: ["Birds", "Forest", "Morning", "Nature"],
      isPreset: true,
      orderIndex: 5,
    },

    // ─── AMBIENT & WORKSPACE ───────────────────────────────────
    {
      title: "Gentle Rain on Window",
      category: "AMBIENT",
      frequency: "Precipitation Field",
      audioUrl: "/audio/ambient/rain.ogg",
      duration: 60,
      defaultVolume: 0.75,
      description: "Soothing rhythmic rainfall and gentle droplet patter on glass.",
      tags: ["Rain", "Atmosphere", "Calm", "Cozy"],
      isPreset: true,
      orderIndex: 6,
    },
    {
      title: "Distant Thunder & Storm",
      category: "AMBIENT",
      frequency: "Storm Atmosphere",
      audioUrl: "/audio/ambient/storm.ogg",
      duration: 60,
      defaultVolume: 0.75,
      description: "Gentle precipitation accompanied by rolling distant thunder claps.",
      tags: ["Storm", "Thunder", "Atmosphere"],
      isPreset: true,
      orderIndex: 7,
    },
    {
      title: "Quiet Cafe Murmur",
      category: "AMBIENT",
      frequency: "Warm Room Tone",
      audioUrl: "/audio/ambient/coffee-shop.ogg",
      duration: 60,
      defaultVolume: 0.7,
      description: "Subtle cafe murmur, soft ceramic clinks, and warm coffeehouse atmosphere.",
      tags: ["Cafe", "Workspace", "Study", "Murmur"],
      isPreset: true,
      orderIndex: 8,
    },
    {
      title: "Mechanical Typing Room",
      category: "AMBIENT",
      frequency: "Acoustic Keystrokes",
      audioUrl: "/audio/ambient/keyboard.wav",
      duration: 60,
      defaultVolume: 0.6,
      description: "Rhythmic tactile mechanical keystroke ambiance for high-velocity coding.",
      tags: ["Keyboard", "Typing", "Coding", "Workspace"],
      isPreset: true,
      orderIndex: 9,
    },
    {
      title: "City Rain & Ambience",
      category: "AMBIENT",
      frequency: "Urban Rain Field",
      audioUrl: "/audio/ambient/city.ogg",
      duration: 60,
      defaultVolume: 0.65,
      description: "Distant urban rain atmosphere and gentle city background tones.",
      tags: ["City", "Rain", "Urban", "Focus"],
      isPreset: true,
      orderIndex: 10,
    },

    // ─── PURE FOCUS NOISE ──────────────────────────────────────
    {
      title: "Studio White Noise",
      category: "NOISE",
      frequency: "Broadband Spectrum",
      audioUrl: "/audio/ambient/white-noise.ogg",
      duration: 60,
      defaultVolume: 0.65,
      description: "Even broadband acoustic masking for high-noise study environments.",
      tags: ["White Noise", "Masking", "Isolation"],
      isPreset: true,
      orderIndex: 11,
    },
    {
      title: "Pure Pink Noise",
      category: "NOISE",
      frequency: "1/f Equal-Energy",
      audioUrl: "/audio/ambient/pink-noise.ogg",
      duration: 60,
      defaultVolume: 0.7,
      description: "Mellow balanced noise aiding memory retention and deep concentration.",
      tags: ["Pink Noise", "Focus", "Memory"],
      isPreset: true,
      orderIndex: 12,
    },
    {
      title: "Obsidian Brown Noise",
      category: "NOISE",
      frequency: "Sub-bass Brownian",
      audioUrl: "/audio/soundscapes/deep-brown-noise.wav",
      duration: 60,
      defaultVolume: 0.8,
      description: "Deep waterfall rumble filtered for zero ear fatigue and complete distraction masking.",
      tags: ["Brown Noise", "Masking", "Deep Focus"],
      isPreset: true,
      orderIndex: 13,
    },
  ];

  for (const track of defaultTracks) {
    const existing = await prisma.acousticTrack.findFirst({ where: { title: track.title } });
    if (!existing) {
      await prisma.acousticTrack.create({ data: track });
    } else {
      await prisma.acousticTrack.update({
        where: { id: existing.id },
        data: track,
      });
    }
  }

  // 5. Seed 5-Tier RPG Item Catalog
  console.log('⚔️ Seeding 5-Tier RPG Item Catalog...');
  const { CATALOG_ITEMS } = require('../lib/shop-items');
  for (const item of CATALOG_ITEMS) {
    await prisma.item.upsert({
      where: { sku: item.sku },
      update: {
        name: item.name,
        description: item.description,
        category: item.category,
        slot: item.slot,
        rarity: item.rarity,
        rankRequirement: item.rankRequirement,
        costSylph: item.costSylph,
        effectPayload: item.effectPayload || {},
        spriteLayer: item.spriteLayer || null,
        setKey: item.setKey || null,
      },
      create: {
        sku: item.sku,
        name: item.name,
        description: item.description,
        category: item.category,
        slot: item.slot,
        rarity: item.rarity,
        rankRequirement: item.rankRequirement,
        costSylph: item.costSylph,
        effectPayload: item.effectPayload || {},
        spriteLayer: item.spriteLayer || null,
        setKey: item.setKey || null,
      },
    });
  }

  // 6. Seed 8-Class Cognitive Skill Tree (24 nodes)
  console.log('🧠 Seeding 8-Class Cognitive Skill Tree...');
  const { SKILL_NODES } = require('../lib/skill-tree');
  for (const node of SKILL_NODES) {
    await prisma.skillNode.upsert({
      where: { nodeKey: node.nodeKey },
      update: {
        name: node.name,
        description: node.description,
        branch: node.branch,
        tier: node.tier,
        costSp: node.costSp,
        prerequisiteStat: node.prerequisiteStat,
        prerequisiteValue: node.prerequisiteValue,
        prerequisiteNodeKey: node.prerequisiteNodeKey,
        effectPayload: node.effectPayload || {},
      },
      create: {
        nodeKey: node.nodeKey,
        name: node.name,
        description: node.description,
        branch: node.branch,
        tier: node.tier,
        costSp: node.costSp,
        prerequisiteStat: node.prerequisiteStat,
        prerequisiteValue: node.prerequisiteValue,
        prerequisiteNodeKey: node.prerequisiteNodeKey,
        effectPayload: node.effectPayload || {},
      },
    });
  }

  // 7. Seed Academic Concept Forge (4 Cores, 16 Topics)
  console.log('⚛️ Seeding Academic Concept Forge...');
  const { FORGE_CORES } = require('../lib/concept-forge');
  for (const core of FORGE_CORES) {
    const createdCore = await prisma.forgeCore.upsert({
      where: { coreKey: core.coreKey },
      update: {
        name: core.name,
        description: core.description,
        discipline: core.discipline,
        tier: core.tier,
        rewardXp: core.rewardXp,
        rewardSylph: core.rewardSylph,
        rewardSp: core.rewardSp,
        rewardBadgeKey: core.rewardBadgeKey || null,
        rewardPedestalKey: core.rewardPedestalKey || null,
      },
      create: {
        coreKey: core.coreKey,
        name: core.name,
        description: core.description,
        discipline: core.discipline,
        tier: core.tier,
        rewardXp: core.rewardXp,
        rewardSylph: core.rewardSylph,
        rewardSp: core.rewardSp,
        rewardBadgeKey: core.rewardBadgeKey || null,
        rewardPedestalKey: core.rewardPedestalKey || null,
      },
    });

    for (const topic of core.topics) {
      await prisma.forgeTopic.upsert({
        where: { topicKey: topic.topicKey },
        update: {
          forgeCoreId: createdCore.id,
          name: topic.name,
          subjectKey: topic.subjectKey,
          targetProgress: topic.targetProgress,
          structuralWeight: topic.structuralWeight,
        },
        create: {
          forgeCoreId: createdCore.id,
          topicKey: topic.topicKey,
          name: topic.name,
          subjectKey: topic.subjectKey,
          targetProgress: topic.targetProgress,
          structuralWeight: topic.structuralWeight,
        },
      });
    }
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

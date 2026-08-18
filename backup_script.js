const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function backup() {
  const backupDir = path.join(process.cwd(), 'backup_' + new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(backupDir, { recursive: true });

  console.log(`Starting backup to ${backupDir}...`);

  const models = [
    'user',
    'goal',
    'quest',
    'subject',
    'studySession',
    'systemMessage',
    'chatSession',
    'friendship',
    'friendRequest',
    'conversation',
    'conversationParticipant',
    'message',
    'sessionInvite',
    'inventoryItem',
    'sylphLedger',
    'hpLedger',
    'userCosmetic',
    'userAchievement',
    'userPrivacy',
    'connectedAccount'
  ];

  const results = {};

  for (const model of models) {
    console.log(`Backing up ${model}...`);
    try {
      const data = await prisma[model].findMany();
      fs.writeFileSync(
        path.join(backupDir, `${model}.json`),
        JSON.stringify(data, null, 2)
      );
      results[model] = data.length;
      console.log(`Successfully backed up ${data.length} records for ${model}`);
    } catch (e) {
      console.error(`Failed to backup ${model}:`, e);
      results[model] = e.message;
    }
  }

  console.log('Backup results:', results);
  console.log('Backup complete!');
}

backup()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });

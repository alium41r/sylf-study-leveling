import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();

async function backup() {
  const backupDir = path.join(process.cwd(), 'backup_' + new Date().toISOString().replace(/[:.]/g, '-'));
  await fs.mkdir(backupDir, { recursive: true });

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

  for (const model of models) {
    console.log(`Backing up ${model}...`);
    try {
      // @ts-ignore
      const data = await prisma[model].findMany();
      await fs.writeFile(
        path.join(backupDir, `${model}.json`),
        JSON.stringify(data, null, 2)
      );
      console.log(`Successfully backed up ${data.length} records for ${model}`);
    } catch (e) {
      console.error(`Failed to backup ${model}:`, e);
    }
  }

  console.log('Backup complete!');
}

backup()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });

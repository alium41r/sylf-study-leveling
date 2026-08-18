import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import fs from 'fs/promises';
import path from 'path';

export async function GET() {
  try {
    const backupDir = path.join(process.cwd(), 'backup_' + new Date().toISOString().replace(/[:.]/g, '-'));
    await fs.mkdir(backupDir, { recursive: true });

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

    const results: Record<string, number> = {};

    for (const model of models) {
      try {
        // @ts-ignore
        const data = await prisma[model].findMany();
        await fs.writeFile(
          path.join(backupDir, `${model}.json`),
          JSON.stringify(data, null, 2)
        );
        results[model] = data.length;
      } catch (e) {
        console.error(`Failed to backup ${model}:`, e);
        results[model] = -1;
      }
    }

    return NextResponse.json({ success: true, backupDir, results });
  } catch (error: any) {
    try {
      await fs.writeFile(path.join(process.cwd(), 'backup_error.txt'), error.stack || error.message);
    } catch(e) {}
    return NextResponse.json({ success: false, error: error.message, stack: error.stack }, { status: 500 });
  }
}

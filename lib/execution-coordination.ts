import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/** First lock in every execution/capacity/economic mutation transaction. No I/O under this lock. */
export async function coordinateExecution(tx: Prisma.TransactionClient, userId: number): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(73641, ${userId}::int)::text`;
}
export async function executionTransaction<T>(userId: number, run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let retry = 0; ; retry++) {
    try {
      return await prisma.$transaction(async tx => {
        await coordinateExecution(tx, userId);
        return run(tx);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 });
    } catch (error) {
      const e = error as { code?: string; meta?: { code?: string; driverAdapterError?: { cause?: { originalCode?: string } } } };
      if (retry < 2 && (e.code === "P2034" || ["40001", "40P01"].includes(e.meta?.code ?? e.meta?.driverAdapterError?.cause?.originalCode ?? ""))) {
        await new Promise(resolve => setTimeout(resolve, 10 + Math.floor(Math.random() * 20)));
        continue;
      }
      throw error;
    }
  }
}

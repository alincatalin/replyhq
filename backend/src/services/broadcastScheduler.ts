import { prisma } from '../lib/prisma.js';
import { sendBroadcast } from './broadcastSender.js';

let schedulerHandle: NodeJS.Timeout | null = null;
let isRunning = false;

async function runSchedulerTick(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  try {
    const now = new Date();
    const scheduled = await prisma.broadcast.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { lte: now },
      },
      select: { id: true },
    });

    for (const broadcast of scheduled) {
      try {
        await sendBroadcast(broadcast.id);
      } catch (error) {
        console.error('[Broadcast Scheduler] Failed to send broadcast:', broadcast.id, error);
      }
    }
  } finally {
    isRunning = false;
  }
}

export function startBroadcastScheduler(intervalMs: number = 60000): void {
  if (schedulerHandle) return;
  schedulerHandle = setInterval(runSchedulerTick, intervalMs);
  void runSchedulerTick();
  console.log(`[Broadcast Scheduler] Started (interval ${intervalMs}ms)`);
}

export function stopBroadcastScheduler(): void {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
    console.log('[Broadcast Scheduler] Stopped');
  }
}

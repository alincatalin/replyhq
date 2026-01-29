import { prisma } from '../lib/prisma.js';
import { continueExecution } from './workflowEngine.js';

let schedulerHandle: NodeJS.Timeout | null = null;
let isRunning = false;

async function runSchedulerTick(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  try {
    const pendingSteps = await prisma.workflowStep.findMany({
      where: {
        status: 'PENDING',
        action: 'wait',
      },
      include: {
        execution: true,
      },
    });

    const now = Date.now();

    for (const step of pendingSteps) {
      const output = (step.output ?? {}) as Record<string, any>;
      const durationMs = typeof output.durationMs === 'number' ? output.durationMs : 0;
      const startedAt = step.startedAt.getTime();

      if (startedAt + durationMs > now) {
        continue;
      }

      const workflow = await prisma.workflow.findUnique({
        where: { id: step.execution.workflowId },
      });

      if (!workflow) {
        continue;
      }

      const nodes = workflow.nodes as any[];
      const edges = workflow.edges as { from: string; to: string }[];
      const adjacency = new Map<string, string[]>();
      edges.forEach((edge) => {
        const list = adjacency.get(edge.from) ?? [];
        list.push(edge.to);
        adjacency.set(edge.from, list);
      });
      const nextNodeId = adjacency.get(step.nodeId)?.[0] ?? null;

      await prisma.workflowStep.update({
        where: { id: step.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      if (nextNodeId) {
        await continueExecution(step.executionId, nextNodeId);
      } else {
        await prisma.workflowExecution.update({
          where: { id: step.executionId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            currentNodeId: null,
          },
        });
      }
    }
  } finally {
    isRunning = false;
  }
}

export function startWorkflowScheduler(intervalMs: number = 30000): void {
  if (schedulerHandle) return;
  schedulerHandle = setInterval(runSchedulerTick, intervalMs);
  void runSchedulerTick();
  console.log(`[Workflow Scheduler] Started (interval ${intervalMs}ms)`);
}

export function stopWorkflowScheduler(): void {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
    console.log('[Workflow Scheduler] Stopped');
  }
}

import { prisma } from '../lib/prisma.js';
import { executeWorkflow } from './workflowEngine.js';

export type WorkflowEventPayload = {
  appId: string;
  userId: string;
  deviceId?: string | null;
  eventName: string;
  sessionId?: string | null;
  properties?: Record<string, any>;
};

export async function triggerWorkflows(payload: WorkflowEventPayload): Promise<void> {
  const workflows = await prisma.workflow.findMany({
    where: {
      appId: payload.appId,
      status: 'ACTIVE',
    },
  });

  const matching = workflows.filter((workflow) => {
    const trigger = workflow.trigger as { type?: string; event_name?: string } | null;
    if (!trigger) return false;
    return trigger.type === 'event' && trigger.event_name === payload.eventName;
  });

  for (const workflow of matching) {
    try {
      await executeWorkflow(workflow.id, {
        userId: payload.userId,
        deviceId: payload.deviceId ?? payload.sessionId ?? null,
        payload: payload.properties ?? {},
      });
    } catch (error) {
      console.error('[Workflow Trigger] Failed to execute workflow', workflow.id, error);
    }
  }
}

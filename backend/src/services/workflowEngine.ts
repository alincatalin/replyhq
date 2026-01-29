import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma.js';
import { createMessage } from './messageService.js';
import { getOrCreateConversation } from './conversationService.js';
import { buildAdjacency, evaluateCondition, findStartNode, parseDuration, type WorkflowEdge, type WorkflowNode } from './workflowUtils.js';

export type WorkflowTriggerContext = {
  userId: string;
  deviceId?: string | null;
  payload?: Record<string, any>;
};

async function resolveDeviceId(appId: string, userId: string, deviceId?: string | null): Promise<string | null> {
  if (deviceId) return deviceId;

  const device = await prisma.device.findFirst({
    where: { appId, userId },
    orderBy: { updatedAt: 'desc' },
    select: { deviceId: true },
  });

  return device?.deviceId ?? null;
}

async function handleSendMessage(
  appId: string,
  node: WorkflowNode,
  context: Record<string, any>,
  deviceId: string
): Promise<void> {
  const config = node.config ?? {};
  const template = (config.body as string | undefined) ?? '';
  const body = template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = context[key];
    if (value === null || value === undefined) return '';
    return String(value);
  });

  const conversation = await getOrCreateConversation(appId, deviceId, {
    user: context.userId ? { id: context.userId as string } : undefined,
  });

  await createMessage(
    conversation.id,
    {
      local_id: uuidv4(),
      body,
      device_context: undefined,
    },
    appId,
    deviceId,
    'agent'
  );
}

function getNextNodeId(
  node: WorkflowNode,
  edges: WorkflowEdge[],
  context: Record<string, any>
): string | null {
  if (node.type === 'condition') {
    const result = evaluateCondition(node.config ?? {}, context);
    const branchKey = result ? 'true' : 'false';
    const branchTarget = node.branches?.[branchKey];
    if (branchTarget) return branchTarget;
  }

  const adjacency = buildAdjacency(edges);
  const nextList = adjacency.get(node.id) ?? [];
  return nextList[0] ?? null;
}

export async function executeWorkflow(workflowId: string, trigger: WorkflowTriggerContext): Promise<void> {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
  });

  if (!workflow) {
    throw new Error('Workflow not found');
  }

  const nodes = workflow.nodes as unknown as WorkflowNode[];
  const edges = workflow.edges as unknown as WorkflowEdge[];
  const startNode = findStartNode(nodes, edges);

  if (!startNode) {
    throw new Error('Workflow has no start node');
  }

  const context: Record<string, any> = {
    userId: trigger.userId,
    ...trigger.payload,
  };

  const execution = await prisma.workflowExecution.create({
    data: {
      workflowId: workflow.id,
      userId: trigger.userId,
      deviceId: trigger.deviceId ?? undefined,
      status: 'RUNNING',
      currentNodeId: startNode.id,
      context,
    },
  });

  await runNodes(workflow.appId, execution.id, nodes, edges, startNode.id, context, trigger);
}

export async function continueExecution(executionId: string, nextNodeId: string): Promise<void> {
  const execution = await prisma.workflowExecution.findUnique({
    where: { id: executionId },
    include: { workflow: true },
  });

  if (!execution) {
    throw new Error('Execution not found');
  }

  const workflow = execution.workflow;
  const nodes = workflow.nodes as unknown as WorkflowNode[];
  const edges = workflow.edges as unknown as WorkflowEdge[];
  const context = execution.context as Record<string, any>;

  await runNodes(workflow.appId, execution.id, nodes, edges, nextNodeId, context, {
    userId: execution.userId,
    deviceId: execution.deviceId,
  });
}

async function runNodes(
  appId: string,
  executionId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  startNodeId: string,
  context: Record<string, any>,
  trigger: WorkflowTriggerContext
): Promise<void> {
  let currentId: string | null = startNodeId;

  while (currentId) {
    const node = nodes.find((item) => item.id === currentId);
    if (!node) {
      break;
    }

    await prisma.workflowExecution.update({
      where: { id: executionId },
      data: { currentNodeId: node.id },
    });

    const step = await prisma.workflowStep.create({
      data: {
        executionId,
        nodeId: node.id,
        action: node.type,
        status: 'RUNNING',
        input: node.config ?? {},
      },
    });

    if (node.type === 'wait') {
      const durationMs = parseDuration((node.config?.duration as string) ?? '') ?? 0;

      await prisma.workflowStep.update({
        where: { id: step.id },
        data: {
          status: 'PENDING',
          output: { durationMs },
        },
      });

      await prisma.workflowExecution.update({
        where: { id: executionId },
        data: { currentNodeId: node.id },
      });

      return;
    }

    if (node.type === 'send_message') {
      const deviceId = await resolveDeviceId(appId, trigger.userId, trigger.deviceId);
      if (!deviceId) {
        await prisma.workflowStep.update({
          where: { id: step.id },
          data: {
            status: 'FAILED',
            errorMessage: 'No device available for user',
          },
        });
        await prisma.workflowExecution.update({
          where: { id: executionId },
          data: {
            status: 'FAILED',
            errorMessage: 'No device available for user',
          },
        });
        return;
      }

      await handleSendMessage(appId, node, context, deviceId);
    }

    const nextNodeId = getNextNodeId(node, edges, context);

    await prisma.workflowStep.update({
      where: { id: step.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    if (!nextNodeId) {
      await prisma.workflowExecution.update({
        where: { id: executionId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          currentNodeId: null,
        },
      });
      return;
    }

    currentId = nextNodeId;
  }
}

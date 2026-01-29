import express, { Request, Response, NextFunction, type IRouter } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireJWT } from '../middleware/jwt.js';
import { requirePermission, Permission } from '../middleware/permissions.js';

const router: IRouter = express.Router();

function normalizeLimit(value: unknown, fallback = 50): number {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 200);
}

function normalizeOffset(value: unknown): number {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return parsed;
}

router.get('/', requireJWT, requirePermission(Permission.VIEW_WORKFLOWS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { appId } = req.jwtPayload!;
    const status = req.query.status as string | undefined;
    const limit = normalizeLimit(req.query.limit, 50);
    const offset = normalizeOffset(req.query.offset);

    const whereClause: any = { appId };
    if (status) {
      whereClause.status = status.toUpperCase();
    }

    const [workflows, total] = await Promise.all([
      prisma.workflow.findMany({
        where: whereClause,
        orderBy: { updatedAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.workflow.count({ where: whereClause }),
    ]);

    const workflowStats = await Promise.all(
      workflows.map(async (workflow) => {
        const totalExecutions = await prisma.workflowExecution.count({
          where: { workflowId: workflow.id },
        });
        return {
          totalExecutions,
        };
      })
    );

    res.json({
      workflows: workflows.map((workflow, index) => ({
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        status: workflow.status.toLowerCase(),
        trigger: workflow.trigger,
        stats: {
          totalExecutions: workflowStats[index]?.totalExecutions ?? 0,
        },
        createdAt: workflow.createdAt,
      })),
      total,
      hasMore: offset + workflows.length < total,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireJWT, requirePermission(Permission.CREATE_WORKFLOWS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { appId, userId } = req.jwtPayload!;
    const { name, description, trigger, nodes, edges } = req.body;

    if (!name || !trigger || !nodes || !edges) {
      return res.status(400).json({
        error: 'Missing required fields',
        code: 'MISSING_FIELDS',
        message: 'name, trigger, nodes, and edges are required',
      });
    }

    const workflow = await prisma.workflow.create({
      data: {
        appId,
        name,
        description: description ?? undefined,
        trigger,
        nodes,
        edges,
        status: 'DRAFT',
        createdBy: userId,
      },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
      },
    });

    res.status(201).json({
      id: workflow.id,
      name: workflow.name,
      status: workflow.status.toLowerCase(),
      createdAt: workflow.createdAt,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requireJWT, requirePermission(Permission.VIEW_WORKFLOWS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { appId } = req.jwtPayload!;
    const workflow = await prisma.workflow.findFirst({
      where: { id: req.params.id, appId },
    });

    if (!workflow) {
      return res.status(404).json({
        error: 'Workflow not found',
        code: 'WORKFLOW_NOT_FOUND',
      });
    }

    const totalExecutions = await prisma.workflowExecution.count({
      where: { workflowId: workflow.id },
    });
    const completedExecutions = await prisma.workflowExecution.count({
      where: { workflowId: workflow.id, status: 'COMPLETED' },
    });

    const completionRate = totalExecutions > 0 ? completedExecutions / totalExecutions : 0;

    res.json({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      status: workflow.status.toLowerCase(),
      trigger: workflow.trigger,
      nodes: workflow.nodes,
      edges: workflow.edges,
      version: workflow.version,
      stats: {
        totalExecutions,
        completionRate,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requireJWT, requirePermission(Permission.EDIT_WORKFLOWS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { appId } = req.jwtPayload!;
    const { name, description, trigger, nodes, edges } = req.body;

    const existing = await prisma.workflow.findFirst({
      where: { id: req.params.id, appId },
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Workflow not found',
        code: 'WORKFLOW_NOT_FOUND',
      });
    }

    if (existing.status === 'ACTIVE') {
      // Increment version on updates to active workflows
      const updated = await prisma.workflow.update({
        where: { id: existing.id },
        data: {
          name: name ?? undefined,
          description: description ?? undefined,
          trigger: trigger ?? undefined,
          nodes: nodes ?? undefined,
          edges: edges ?? undefined,
          version: existing.version + 1,
        },
        select: { id: true, version: true, updatedAt: true },
      });

      return res.json({
        id: updated.id,
        version: updated.version,
        updatedAt: updated.updatedAt,
      });
    }

    const updated = await prisma.workflow.update({
      where: { id: existing.id },
      data: {
        name: name ?? undefined,
        description: description ?? undefined,
        trigger: trigger ?? undefined,
        nodes: nodes ?? undefined,
        edges: edges ?? undefined,
      },
      select: { id: true, version: true, updatedAt: true },
    });

    res.json({
      id: updated.id,
      version: updated.version,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireJWT, requirePermission(Permission.DELETE_WORKFLOWS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { appId } = req.jwtPayload!;
    const existing = await prisma.workflow.findFirst({
      where: { id: req.params.id, appId },
      select: { id: true, status: true },
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Workflow not found',
        code: 'WORKFLOW_NOT_FOUND',
      });
    }

    if (existing.status !== 'DRAFT') {
      return res.status(400).json({
        error: 'Only draft workflows can be deleted',
        code: 'WORKFLOW_LOCKED',
      });
    }

    await prisma.workflow.delete({ where: { id: existing.id } });

    res.json({ success: true, message: 'Workflow deleted' });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/activate', requireJWT, requirePermission(Permission.MANAGE_WORKFLOWS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { appId } = req.jwtPayload!;
    const workflow = await prisma.workflow.findFirst({
      where: { id: req.params.id, appId },
    });

    if (!workflow) {
      return res.status(404).json({
        error: 'Workflow not found',
        code: 'WORKFLOW_NOT_FOUND',
      });
    }

    const updated = await prisma.workflow.update({
      where: { id: workflow.id },
      data: { status: 'ACTIVE' },
      select: { id: true, status: true },
    });

    res.json({ id: updated.id, status: updated.status.toLowerCase() });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/pause', requireJWT, requirePermission(Permission.MANAGE_WORKFLOWS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { appId } = req.jwtPayload!;
    const workflow = await prisma.workflow.findFirst({
      where: { id: req.params.id, appId },
    });

    if (!workflow) {
      return res.status(404).json({
        error: 'Workflow not found',
        code: 'WORKFLOW_NOT_FOUND',
      });
    }

    const updated = await prisma.workflow.update({
      where: { id: workflow.id },
      data: { status: 'PAUSED' },
      select: { id: true, status: true },
    });

    res.json({ id: updated.id, status: updated.status.toLowerCase() });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/executions', requireJWT, requirePermission(Permission.VIEW_WORKFLOWS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { appId } = req.jwtPayload!;
    const limit = normalizeLimit(req.query.limit, 50);
    const offset = normalizeOffset(req.query.offset);
    const status = req.query.status as string | undefined;

    const workflow = await prisma.workflow.findFirst({
      where: { id: req.params.id, appId },
      select: { id: true },
    });

    if (!workflow) {
      return res.status(404).json({
        error: 'Workflow not found',
        code: 'WORKFLOW_NOT_FOUND',
      });
    }

    const whereClause: any = { workflowId: workflow.id };
    if (status) {
      whereClause.status = status.toUpperCase();
    }

    const [executions, total] = await Promise.all([
      prisma.workflowExecution.findMany({
        where: whereClause,
        orderBy: { startedAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.workflowExecution.count({ where: whereClause }),
    ]);

    res.json({
      executions: executions.map((execution) => {
        const durationMs = execution.completedAt
          ? execution.completedAt.getTime() - execution.startedAt.getTime()
          : null;

        return {
          id: execution.id,
          userId: execution.userId,
          status: execution.status.toLowerCase(),
          currentNodeId: execution.currentNodeId,
          startedAt: execution.startedAt,
          completedAt: execution.completedAt,
          durationMs,
        };
      }),
      total,
      hasMore: offset + executions.length < total,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/analytics', requireJWT, requirePermission(Permission.VIEW_WORKFLOWS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { appId } = req.jwtPayload!;
    const workflow = await prisma.workflow.findFirst({
      where: { id: req.params.id, appId },
      select: { id: true },
    });

    if (!workflow) {
      return res.status(404).json({
        error: 'Workflow not found',
        code: 'WORKFLOW_NOT_FOUND',
      });
    }

    const totalExecutions = await prisma.workflowExecution.count({
      where: { workflowId: workflow.id },
    });
    const completedExecutions = await prisma.workflowExecution.count({
      where: { workflowId: workflow.id, status: 'COMPLETED' },
    });

    const completionRate = totalExecutions > 0 ? completedExecutions / totalExecutions : 0;

    res.json({
      totalExecutions,
      completionRate,
      avgDurationMs: null,
      dropoffByNode: {},
      executionsByDay: [],
    });
  } catch (error) {
    next(error);
  }
});

export default router;

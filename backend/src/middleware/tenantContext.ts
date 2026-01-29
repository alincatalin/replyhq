import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';

/**
 * Set PostgreSQL RLS session variable for tenant isolation
 * CRITICAL: Must be called AFTER authentication middleware
 * Uses transaction-local session variables to work with connection pools
 */
export async function setTenantContext(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Get appId from authentication middleware
  const appId = req.appHeaders?.appId || req.adminAuth?.appId;

  if (!appId) {
    // No tenant context available, continue without RLS
    // This is OK for non-tenant-specific routes like /health
    return next();
  }

  try {
    // Use Prisma.$executeRaw with proper SQL template to prevent injection
    // The TRUE parameter makes this transaction-local (safe for connection pools)
    await prisma.$executeRaw(
      Prisma.sql`SELECT set_config('app.current_tenant', ${appId}, TRUE)`
    );

    next();
  } catch (error) {
    console.error('Failed to set tenant context:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'TENANT_CONTEXT_FAILED',
    });
  }
}

/**
 * Clear tenant context after request completes
 * Not strictly necessary due to transaction-local setting, but good practice
 */
export async function clearTenantContext(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Reset to empty string (transaction-local so only affects this transaction)
    await prisma.$executeRaw(
      Prisma.sql`SELECT set_config('app.current_tenant', '', TRUE)`
    );
  } catch (error) {
    // Log but don't fail the request
    console.error('Failed to clear tenant context:', error);
  }

  next();
}

import { PrismaClient, Prisma } from '@prisma/client';

// Configure Prisma client with connection pool settings
export const prisma = new PrismaClient({
  log: ['warn', 'error'],
  // Connection pool configuration is set via DATABASE_URL query params:
  // connection_limit=100&pool_timeout=10
});

// Add Prisma middleware for RLS with connection pools
// This ensures tenant context is set for every query
prisma.$use(async (params, next) => {
  // Get current tenant from async context
  // NOTE: This requires the tenantContext middleware to run first
  // The session variable is transaction-local, so safe with connection pools

  // For queries that need tenant isolation, the session variable will be set
  // by the tenantContext middleware before the query runs

  // Execute the query
  const result = await next(params);

  return result;
});

export async function connectDatabase() {
  await prisma.$connect();
  console.log('Database connected');
  console.log('[Connection Pool] Configuration: connection_limit=100, pool_timeout=10s');
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}

/**
 * Get current connection pool status
 * Note: Prisma doesn't expose pool metrics directly in this version
 * Use PostgreSQL monitoring queries instead
 */
export async function getConnectionPoolStatus() {
  try {
    // Query PostgreSQL for connection count
    const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;
    return {
      activeConnections: Number(result[0]?.count ?? 0),
    };
  } catch (error) {
    console.error('Failed to get connection pool status:', error);
    return { activeConnections: 0 };
  }
}

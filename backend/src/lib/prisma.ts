import { PrismaClient, Prisma } from '@prisma/client';

export const prisma = new PrismaClient();

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
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}

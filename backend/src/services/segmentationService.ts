import { prisma } from '../lib/prisma.js';
import { Condition, SegmentQuery, ComparisonOp } from '../lib/queryDSL.js';

/**
 * Evaluate a segment query and return matching user IDs
 */
export async function evaluateSegment(
  appId: string,
  query: SegmentQuery
): Promise<string[]> {
  const sql = buildSegmentSQL(appId, query);

  console.log('[Segmentation] Executing SQL:', sql);

  // Execute raw SQL query
  const result = await prisma.$queryRawUnsafe<Array<{ user_id: string }>>(sql);

  return result.map((row) => row.user_id);
}

/**
 * Count users matching a segment
 */
export async function countSegmentUsers(
  appId: string,
  query: SegmentQuery
): Promise<number> {
  const userIds = await evaluateSegment(appId, query);
  return userIds.length;
}

/**
 * Build SQL query from segment DSL
 */
function buildSegmentSQL(appId: string, query: SegmentQuery): string {
  // Start with base query selecting distinct users
  let sql = `SELECT DISTINCT user_id FROM (\n`;

  // Build WHERE clause from conditions
  const whereClause = buildWhereClause(appId, query);

  // Combine with events table
  sql += `  SELECT DISTINCT e.user_id\n`;
  sql += `  FROM events e\n`;
  sql += `  WHERE e.app_id = '${appId}'\n`;
  sql += `  AND (${whereClause})\n`;
  sql += `) AS segment_users`;

  return sql;
}

/**
 * Build WHERE clause from segment query
 */
function buildWhereClause(appId: string, query: SegmentQuery, depth = 0): string {
  const clauses: string[] = [];

  for (const condition of query.conditions) {
    if ('operator' in condition && 'conditions' in condition) {
      // Nested query
      const nestedClause = buildWhereClause(appId, condition as SegmentQuery, depth + 1);
      clauses.push(`(${nestedClause})`);
    } else {
      // Leaf condition
      const cond = condition as Condition;
      clauses.push(buildConditionClause(cond));
    }
  }

  return clauses.join(` ${query.operator} `);
}

/**
 * Build SQL clause for a single condition
 */
function buildConditionClause(cond: Condition): string {
  if (cond.type === 'user_attribute') {
    return buildUserAttributeClause(cond);
  } else if (cond.type === 'event') {
    return buildEventClause(cond);
  }

  throw new Error(`Unknown condition type: ${cond.type}`);
}

/**
 * Build clause for user attribute conditions
 */
function buildUserAttributeClause(cond: Condition): string {
  // For user attributes, we query the properties JSONB field
  const field = `properties->>'${cond.field}'`;
  const value = typeof cond.value === 'string' ? `'${cond.value}'` : cond.value;

  switch (cond.operator) {
    case 'equals':
      return `${field} = ${value}`;
    case 'not_equals':
      return `${field} != ${value}`;
    case 'gt':
      return `(${field})::numeric > ${value}`;
    case 'gte':
      return `(${field})::numeric >= ${value}`;
    case 'lt':
      return `(${field})::numeric < ${value}`;
    case 'lte':
      return `(${field})::numeric <= ${value}`;
    case 'contains':
      return `${field} LIKE '%${cond.value}%'`;
    case 'not_contains':
      return `${field} NOT LIKE '%${cond.value}%'`;
    case 'in':
      const inValues = Array.isArray(cond.value) ? cond.value.map((v) => `'${v}'`).join(', ') : cond.value;
      return `${field} IN (${inValues})`;
    case 'not_in':
      const notInValues = Array.isArray(cond.value) ? cond.value.map((v) => `'${v}'`).join(', ') : cond.value;
      return `${field} NOT IN (${notInValues})`;
    case 'exists':
      return `properties ? '${cond.field}'`;
    case 'not_exists':
      return `NOT (properties ? '${cond.field}')`;
    default:
      throw new Error(`Unknown operator: ${cond.operator}`);
  }
}

/**
 * Build clause for event conditions
 */
function buildEventClause(cond: Condition): string {
  let clause = '';

  // Build timeframe condition
  let timeframeClause = '';
  if (cond.timeframe) {
    if (cond.timeframe.type === 'relative') {
      const interval = `${cond.timeframe.value} ${cond.timeframe.unit}`;
      timeframeClause = `AND event_timestamp >= NOW() - INTERVAL '${interval}'`;
    } else if (cond.timeframe.type === 'absolute' && cond.timeframe.startDate && cond.timeframe.endDate) {
      timeframeClause = `AND event_timestamp BETWEEN '${cond.timeframe.startDate.toISOString()}' AND '${cond.timeframe.endDate.toISOString()}'`;
    }
  }

  // If there's an aggregation, we need a subquery
  if (cond.aggregation) {
    const aggFunction = cond.aggregation.function.toUpperCase();
    let aggField = 'id';

    if (cond.aggregation.field) {
      aggField = `(properties->>'${cond.aggregation.field}')::numeric`;
    }

    clause = `user_id IN (
      SELECT user_id
      FROM events
      WHERE event_name = '${cond.eventName}'
        ${timeframeClause}
      GROUP BY user_id
      HAVING ${aggFunction}(${aggField}) ${buildComparisonOperator(cond.operator)} ${cond.value}
    )`;
  } else {
    // Simple event field condition
    const field = `properties->>'${cond.field}'`;
    const value = typeof cond.value === 'string' ? `'${cond.value}'` : cond.value;

    clause = `user_id IN (
      SELECT DISTINCT user_id
      FROM events
      WHERE event_name = '${cond.eventName}'
        AND ${field} ${buildComparisonOperator(cond.operator)} ${value}
        ${timeframeClause}
    )`;
  }

  return clause;
}

/**
 * Build SQL comparison operator
 */
function buildComparisonOperator(op: ComparisonOp): string {
  switch (op) {
    case 'equals':
      return '=';
    case 'not_equals':
      return '!=';
    case 'gt':
      return '>';
    case 'gte':
      return '>=';
    case 'lt':
      return '<';
    case 'lte':
      return '<=';
    case 'contains':
      return 'LIKE';
    case 'not_contains':
      return 'NOT LIKE';
    case 'in':
      return 'IN';
    case 'not_in':
      return 'NOT IN';
    default:
      return '=';
  }
}

/**
 * Get segment preview (sample users)
 */
export async function getSegmentPreview(
  appId: string,
  query: SegmentQuery,
  limit = 10
): Promise<Array<{ userId: string; eventCount: number }>> {
  const userIds = await evaluateSegment(appId, query);
  const sampleUserIds = userIds.slice(0, limit);

  if (sampleUserIds.length === 0) {
    return [];
  }

  // Get event count for each user
  const result = await prisma.event.groupBy({
    by: ['userId'],
    where: {
      appId,
      userId: { in: sampleUserIds },
    },
    _count: {
      id: true,
    },
  });

  return result.map((row) => ({
    userId: row.userId,
    eventCount: row._count.id,
  }));
}

/**
 * Export segment users to CSV format
 */
export async function exportSegment(
  appId: string,
  query: SegmentQuery
): Promise<string> {
  const userIds = await evaluateSegment(appId, query);

  // Get user details from events
  const users = await prisma.event.findMany({
    where: {
      appId,
      userId: { in: userIds },
    },
    select: {
      userId: true,
      userPlan: true,
      userCountry: true,
      platform: true,
    },
    distinct: ['userId'],
  });

  // Build CSV
  let csv = 'user_id,plan,country,platform\n';
  for (const user of users) {
    csv += `${user.userId},${user.userPlan || ''},${user.userCountry || ''},${user.platform || ''}\n`;
  }

  return csv;
}

export default {
  evaluateSegment,
  countSegmentUsers,
  getSegmentPreview,
  exportSegment,
};

import { prisma } from '../lib/prisma.js';

export interface TrackEventInput {
  userId: string;
  appId: string;
  eventName: string;
  properties?: Record<string, any>;
  userPlan?: string;
  userCountry?: string;
  sessionId?: string;
  platform?: string;
  appVersion?: string;
}

interface EventBatch {
  events: TrackEventInput[];
  timeout: NodeJS.Timeout | null;
}

// In-memory event batching (for performance)
const eventBatches: Map<string, EventBatch> = new Map();
const BATCH_SIZE = 50;
const BATCH_TIMEOUT_MS = 5000; // 5 seconds

/**
 * Track a single event (batched for performance)
 */
export async function trackEvent(input: TrackEventInput): Promise<void> {
  const batchKey = input.appId;

  // Get or create batch for this app
  let batch = eventBatches.get(batchKey);
  if (!batch) {
    batch = {
      events: [],
      timeout: null,
    };
    eventBatches.set(batchKey, batch);
  }

  // Add event to batch
  batch.events.push(input);

  // Clear existing timeout
  if (batch.timeout) {
    clearTimeout(batch.timeout);
  }

  // Flush immediately if batch is full
  if (batch.events.length >= BATCH_SIZE) {
    await flushBatch(batchKey);
  } else {
    // Otherwise, set timeout to flush batch
    batch.timeout = setTimeout(async () => {
      await flushBatch(batchKey);
    }, BATCH_TIMEOUT_MS);
  }
}

/**
 * Flush a batch of events to the database
 */
async function flushBatch(batchKey: string): Promise<void> {
  const batch = eventBatches.get(batchKey);
  if (!batch || batch.events.length === 0) {
    return;
  }

  // Clear timeout
  if (batch.timeout) {
    clearTimeout(batch.timeout);
    batch.timeout = null;
  }

  // Copy events and clear batch
  const eventsToFlush = [...batch.events];
  batch.events = [];

  try {
    await prisma.event.createMany({
      data: eventsToFlush.map((event) => ({
        userId: event.userId,
        appId: event.appId,
        eventName: event.eventName,
        properties: event.properties || {},
        userPlan: event.userPlan,
        userCountry: event.userCountry,
        sessionId: event.sessionId,
        platform: event.platform,
        appVersion: event.appVersion,
        eventTimestamp: new Date(),
      })),
      skipDuplicates: true,
    });

    console.log(`[Analytics] Flushed ${eventsToFlush.length} events for app ${batchKey}`);
  } catch (error) {
    console.error('[Analytics] Error flushing batch:', error);
    // Re-add events to batch for retry
    batch.events.unshift(...eventsToFlush);
  }
}

/**
 * Track multiple events at once
 */
export async function trackEvents(events: TrackEventInput[]): Promise<void> {
  for (const event of events) {
    await trackEvent(event);
  }
}

/**
 * Flush all pending batches (call on server shutdown)
 */
export async function flushAllBatches(): Promise<void> {
  const flushPromises = Array.from(eventBatches.keys()).map((batchKey) =>
    flushBatch(batchKey)
  );
  await Promise.all(flushPromises);
}

/**
 * Get event counts by event name for an app
 */
export async function getEventCounts(
  appId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    eventNames?: string[];
  } = {}
): Promise<Record<string, number>> {
  const { startDate, endDate, eventNames } = options;

  const whereClause: any = { appId };

  if (startDate || endDate) {
    whereClause.eventTimestamp = {};
    if (startDate) whereClause.eventTimestamp.gte = startDate;
    if (endDate) whereClause.eventTimestamp.lte = endDate;
  }

  if (eventNames && eventNames.length > 0) {
    whereClause.eventName = { in: eventNames };
  }

  const events = await prisma.event.groupBy({
    by: ['eventName'],
    where: whereClause,
    _count: {
      id: true,
    },
  });

  const counts: Record<string, number> = {};
  for (const event of events) {
    counts[event.eventName] = event._count.id;
  }

  return counts;
}

/**
 * Get events for a specific user
 */
export async function getUserEvents(
  appId: string,
  userId: string,
  options: {
    limit?: number;
    startDate?: Date;
    endDate?: Date;
    eventNames?: string[];
  } = {}
): Promise<any[]> {
  const { limit = 100, startDate, endDate, eventNames } = options;

  const whereClause: any = { appId, userId };

  if (startDate || endDate) {
    whereClause.eventTimestamp = {};
    if (startDate) whereClause.eventTimestamp.gte = startDate;
    if (endDate) whereClause.eventTimestamp.lte = endDate;
  }

  if (eventNames && eventNames.length > 0) {
    whereClause.eventName = { in: eventNames };
  }

  return prisma.event.findMany({
    where: whereClause,
    orderBy: { eventTimestamp: 'desc' },
    take: limit,
  });
}

/**
 * Get event timeline (events grouped by time period)
 */
export async function getEventTimeline(
  appId: string,
  eventName: string,
  options: {
    startDate: Date;
    endDate: Date;
    interval: 'hour' | 'day' | 'week' | 'month';
  }
): Promise<Array<{ timestamp: Date; count: number }>> {
  const { startDate, endDate, interval } = options;

  // Use raw SQL for date_trunc aggregation
  const intervalMapping = {
    hour: '1 hour',
    day: '1 day',
    week: '1 week',
    month: '1 month',
  };

  const result = await prisma.$queryRaw<Array<{ bucket: Date; count: bigint }>>`
    SELECT
      date_trunc(${interval}, event_timestamp) as bucket,
      COUNT(*)::bigint as count
    FROM events
    WHERE app_id = ${appId}
      AND event_name = ${eventName}
      AND event_timestamp >= ${startDate}
      AND event_timestamp <= ${endDate}
    GROUP BY bucket
    ORDER BY bucket ASC
  `;

  return result.map((row) => ({
    timestamp: row.bucket,
    count: Number(row.count),
  }));
}

/**
 * Get top events by count
 */
export async function getTopEvents(
  appId: string,
  options: {
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  } = {}
): Promise<Array<{ eventName: string; count: number }>> {
  const { limit = 10, startDate, endDate } = options;

  const whereClause: any = { appId };

  if (startDate || endDate) {
    whereClause.eventTimestamp = {};
    if (startDate) whereClause.eventTimestamp.gte = startDate;
    if (endDate) whereClause.eventTimestamp.lte = endDate;
  }

  const events = await prisma.event.groupBy({
    by: ['eventName'],
    where: whereClause,
    _count: {
      id: true,
    },
    orderBy: {
      _count: {
        id: 'desc',
      },
    },
    take: limit,
  });

  return events.map((event) => ({
    eventName: event.eventName,
    count: event._count.id,
  }));
}

/**
 * Delete old events (for cleanup/retention policy)
 */
export async function deleteOldEvents(olderThan: Date): Promise<number> {
  const result = await prisma.event.deleteMany({
    where: {
      eventTimestamp: {
        lt: olderThan,
      },
    },
  });

  return result.count;
}

export default {
  trackEvent,
  trackEvents,
  flushAllBatches,
  getEventCounts,
  getUserEvents,
  getEventTimeline,
  getTopEvents,
  deleteOldEvents,
};

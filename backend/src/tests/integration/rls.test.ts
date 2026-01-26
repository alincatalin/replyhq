import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { Prisma } from '@prisma/client';

/**
 * Integration tests for Row-Level Security (RLS)
 * Validates cross-tenant isolation at the database level
 */
describe('Row-Level Security (RLS)', () => {
  let app1Id: string;
  let app2Id: string;
  let conv1Id: string;
  let conv2Id: string;

  beforeAll(async () => {
    // Create two test apps
    const app1 = await prisma.app.create({
      data: {
        name: 'Test App 1',
        apiKeyHash: 'test:hash1',
      },
    });
    app1Id = app1.id;

    const app2 = await prisma.app.create({
      data: {
        name: 'Test App 2',
        apiKeyHash: 'test:hash2',
      },
    });
    app2Id = app2.id;

    // Create conversations for each app
    const conv1 = await prisma.conversation.create({
      data: {
        id: 'conv-app1-test',
        appId: app1Id,
        visitorId: 'visitor1',
        deviceId: 'device1',
      },
    });
    conv1Id = conv1.id;

    const conv2 = await prisma.conversation.create({
      data: {
        id: 'conv-app2-test',
        appId: app2Id,
        visitorId: 'visitor2',
        deviceId: 'device2',
      },
    });
    conv2Id = conv2.id;

    // Create messages for each conversation
    await prisma.message.create({
      data: {
        id: 'msg-app1-1',
        localId: 'local-app1-1',
        conversationId: conv1Id,
        appId: app1Id,
        body: 'Message from App 1',
        sender: 'user',
      },
    });

    await prisma.message.create({
      data: {
        id: 'msg-app2-1',
        localId: 'local-app2-1',
        conversationId: conv2Id,
        appId: app2Id,
        body: 'Message from App 2',
        sender: 'user',
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.message.deleteMany({
      where: {
        OR: [{ appId: app1Id }, { appId: app2Id }],
      },
    });

    await prisma.conversation.deleteMany({
      where: {
        OR: [{ appId: app1Id }, { appId: app2Id }],
      },
    });

    await prisma.app.deleteMany({
      where: {
        OR: [{ id: app1Id }, { id: app2Id }],
      },
    });
  });

  beforeEach(async () => {
    // Clear tenant context before each test
    await prisma.$executeRaw(
      Prisma.sql`SELECT set_config('app.current_tenant', '', TRUE)`
    );
  });

  describe('Conversation isolation', () => {
    it('should only return conversations for the current tenant', async () => {
      // Set tenant context to app1
      await prisma.$executeRaw(
        Prisma.sql`SELECT set_config('app.current_tenant', ${app1Id}, TRUE)`
      );

      const conversations = await prisma.conversation.findMany();

      expect(conversations.length).toBeGreaterThan(0);
      expect(conversations.every((c) => c.appId === app1Id)).toBe(true);
      expect(conversations.some((c) => c.appId === app2Id)).toBe(false);
    });

    it('should not allow reading conversations from other tenants', async () => {
      // Set tenant context to app2
      await prisma.$executeRaw(
        Prisma.sql`SELECT set_config('app.current_tenant', ${app2Id}, TRUE)`
      );

      // Try to read app1's conversation
      const conversation = await prisma.conversation.findUnique({
        where: { id: conv1Id },
      });

      // RLS should block this - conversation should be null
      expect(conversation).toBeNull();
    });
  });

  describe('Message isolation', () => {
    it('should only return messages for the current tenant', async () => {
      // Set tenant context to app1
      await prisma.$executeRaw(
        Prisma.sql`SELECT set_config('app.current_tenant', ${app1Id}, TRUE)`
      );

      const messages = await prisma.message.findMany();

      expect(messages.length).toBeGreaterThan(0);
      expect(messages.every((m) => m.appId === app1Id)).toBe(true);
      expect(messages.some((m) => m.appId === app2Id)).toBe(false);
    });

    it('should not allow reading messages from other tenants', async () => {
      // Set tenant context to app2
      await prisma.$executeRaw(
        Prisma.sql`SELECT set_config('app.current_tenant', ${app2Id}, TRUE)`
      );

      // Try to read app1's message
      const message = await prisma.message.findUnique({
        where: { id: 'msg-app1-1' },
      });

      // RLS should block this
      expect(message).toBeNull();
    });

    it('should not allow creating messages for other tenants', async () => {
      // Set tenant context to app1
      await prisma.$executeRaw(
        Prisma.sql`SELECT set_config('app.current_tenant', ${app1Id}, TRUE)`
      );

      // Try to create a message for app2's conversation
      await expect(
        prisma.message.create({
          data: {
            id: 'msg-cross-tenant-test',
            localId: 'local-cross-tenant-test',
            conversationId: conv2Id,
            appId: app2Id,
            body: 'Cross-tenant message',
            sender: 'user',
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('Transaction-local tenant context', () => {
    it('should isolate tenant context within transactions', async () => {
      // Set tenant context to app1
      await prisma.$executeRaw(
        Prisma.sql`SELECT set_config('app.current_tenant', ${app1Id}, TRUE)`
      );

      // Run a transaction with different tenant context
      await prisma.$transaction(async (tx) => {
        // Set different tenant context within transaction
        await tx.$executeRaw(
          Prisma.sql`SELECT set_config('app.current_tenant', ${app2Id}, TRUE)`
        );

        const messages = await tx.message.findMany();

        // Within transaction, should only see app2 messages
        expect(messages.every((m) => m.appId === app2Id)).toBe(true);
      });

      // After transaction, original context should be restored
      const messages = await prisma.message.findMany();
      expect(messages.every((m) => m.appId === app1Id)).toBe(true);
    });
  });

  describe('No tenant context (should see all data)', () => {
    it('should see all data when no tenant context is set', async () => {
      // Clear tenant context
      await prisma.$executeRaw(
        Prisma.sql`SELECT set_config('app.current_tenant', '', TRUE)`
      );

      const conversations = await prisma.conversation.findMany({
        where: {
          OR: [{ appId: app1Id }, { appId: app2Id }],
        },
      });

      // Without RLS context, should see all test data
      expect(conversations.some((c) => c.appId === app1Id)).toBe(true);
      expect(conversations.some((c) => c.appId === app2Id)).toBe(true);
    });
  });
});

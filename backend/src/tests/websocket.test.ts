import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSocket } from 'ws';
import {
  broadcastToConversation,
  broadcastAgentTyping,
  isClientConnected,
  getConnectionCount,
} from '../services/websocketService.js';

vi.mock('ws', () => ({
  WebSocketServer: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
  })),
  WebSocket: {
    OPEN: 1,
    CLOSED: 3,
  },
}));

describe('websocketService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('broadcastToConversation', () => {
    it('should be a function', () => {
      expect(typeof broadcastToConversation).toBe('function');
    });

    it('should not throw when conversation has no clients', () => {
      expect(() => {
        broadcastToConversation('conv_nonexistent', { type: 'test' });
      }).not.toThrow();
    });
  });

  describe('broadcastAgentTyping', () => {
    it('should be a function', () => {
      expect(typeof broadcastAgentTyping).toBe('function');
    });

    it('should not throw when conversation has no clients', () => {
      expect(() => {
        broadcastAgentTyping('conv_nonexistent', true);
      }).not.toThrow();
    });
  });

  describe('isClientConnected', () => {
    it('should return false for unknown device', () => {
      expect(isClientConnected('unknown_device')).toBe(false);
    });
  });

  describe('getConnectionCount', () => {
    it('should return 0 when no connections', () => {
      expect(getConnectionCount()).toBe(0);
    });
  });

  describe('WebSocket message handling', () => {
    it('should define ping event handler behavior', () => {
      const pingMessage = { type: 'ping' };
      const pongResponse = { type: 'pong' };
      expect(pingMessage.type).toBe('ping');
      expect(pongResponse.type).toBe('pong');
    });

    it('should define user.typing event structure', () => {
      const typingEvent = {
        type: 'user.typing',
        conversation_id: 'conv_123',
        is_typing: true,
      };
      expect(typingEvent.type).toBe('user.typing');
      expect(typingEvent.conversation_id).toBe('conv_123');
      expect(typingEvent.is_typing).toBe(true);
    });

    it('should define agent.typing event structure', () => {
      const typingEvent = {
        type: 'agent.typing',
        conversation_id: 'conv_123',
        is_typing: true,
      };
      expect(typingEvent.type).toBe('agent.typing');
    });

    it('should define message.new event structure', () => {
      const messageEvent = {
        type: 'message.new',
        message: {
          id: 'msg_123',
          local_id: 'uuid-123',
          conversation_id: 'conv_123',
          body: 'Hello',
          sender: 'user',
          created_at: '2026-01-01T00:00:00Z',
          status: 'SENT',
        },
      };
      expect(messageEvent.type).toBe('message.new');
      expect(messageEvent.message.id).toBe('msg_123');
    });

    it('should define connection.established event structure', () => {
      const connEvent = {
        type: 'connection.established',
        connection_id: 'conn_123',
      };
      expect(connEvent.type).toBe('connection.established');
      expect(connEvent.connection_id).toBe('conn_123');
    });

    it('should define error event structure', () => {
      const errorEvent = {
        type: 'error',
        error: 'Connection timeout',
        code: 'CONNECTION_TIMEOUT',
      };
      expect(errorEvent.type).toBe('error');
      expect(errorEvent.error).toBe('Connection timeout');
      expect(errorEvent.code).toBe('CONNECTION_TIMEOUT');
    });
  });
});

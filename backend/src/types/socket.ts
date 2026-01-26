import { Socket, DefaultEventsMap } from 'socket.io';

/**
 * Client socket data - populated during authentication
 */
export interface ClientSocketData {
  appId: string;
  deviceId: string;
  connectionId: string;
  conversationId?: string;
}

/**
 * Admin socket data - populated during authentication
 */
export interface AdminSocketData {
  appId: string;
  connectionId: string;
  subscribedConversations: Set<string>;
}

/**
 * Client Socket type (extends Socket.IO Socket with our data)
 */
export type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, ClientSocketData>;

/**
 * Admin Socket type (extends Socket.IO Socket with our data)
 */
export type AdminSocket = Socket<AdminToServerEvents, ServerToAdminEvents, DefaultEventsMap, AdminSocketData>;

/**
 * Events sent FROM client TO server
 */
export interface ClientToServerEvents {
  'conversation:join': (conversationId: string, callback: (response: ConversationJoinResponse) => void) => void;
  'conversation:leave': (conversationId: string) => void;
  'typing:start': (conversationId: string) => void;
  'typing:stop': (conversationId: string) => void;
  'ping': () => void;
}

/**
 * Events sent FROM server TO client
 */
export interface ServerToClientEvents {
  'connected': (data: { connection_id: string; server_time: string }) => void;
  'message:new': (data: Message) => void;
  'agent:typing': (data: { conversation_id: string; is_typing: boolean }) => void;
  'conversation:joined': (data: { conversation_id: string; last_message_id?: string }) => void;
  'server:shutdown': (data: { message: string; reconnect_delay_ms: number }) => void;
  'user:typing': (data: { conversation_id: string; device_id: string; is_typing: boolean }) => void;
  'pong': () => void;
  'error': (data: { code: string; message?: string }) => void;
}

/**
 * Events sent FROM admin TO server
 */
export interface AdminToServerEvents {
  'app:subscribe': () => void;
  'conversation:join': (conversationId: string, callback: (response: ConversationJoinResponse) => void) => void;
  'conversation:leave': (conversationId: string) => void;
  'message:send': (data: AdminMessageSendRequest, callback: (response: AdminMessageSendResponse) => void) => void;
  'sessions:list': (callback: (response: SessionsListResponse) => void) => void;
  'typing:start': (conversationId: string) => void;
  'typing:stop': (conversationId: string) => void;
  'ping': () => void;
}

/**
 * Events sent FROM server TO admin
 */
export interface ServerToAdminEvents {
  'connected': (data: { connection_id: string; server_time: string }) => void;
  'message:new': (data: Message) => void;
  'agent:typing': (data: { conversation_id: string; is_typing: boolean }) => void;
  'conversation:joined': (data: { conversation_id: string; last_message_id?: string }) => void;
  'server:shutdown': (data: { message: string; reconnect_delay_ms: number }) => void;
  'error': (data: { code: string; message?: string }) => void;
  'session:connect': (data: { connection_id: string; device_id: string; app_id: string; connected_at: string }) => void;
  'session:disconnect': (data: { connection_id: string; device_id: string; reason: string }) => void;
  'presence:change': (data: { app_id: string; device_id: string; is_online: boolean }) => void;
  'user:typing': (data: { conversation_id: string; device_id: string; is_typing: boolean }) => void;
  'pong': () => void;
}

/**
 * Conversation join response data
 */
export interface ConversationJoinResponse {
  success: boolean;
  last_message_id?: string;
  error?: string;
}

/**
 * Admin message send request
 */
export interface AdminMessageSendRequest {
  conversation_id: string;
  body: string;
  local_id: string;
}

/**
 * Admin message send response
 */
export interface AdminMessageSendResponse {
  success: boolean;
  message?: Message;
  error?: string;
}

/**
 * Sessions list response
 */
export interface SessionsListResponse {
  sessions: SessionData[];
}

/**
 * Session data returned in sessions:list
 */
export interface SessionData {
  connectionId: string;
  deviceId: string;
  appId: string;
  connectedAt: string;
}

/**
 * Message data structure (from database)
 */
export interface Message {
  id: string;
  local_id?: string;
  conversation_id: string;
  body: string;
  sender: 'user' | 'agent' | 'system';
  created_at: string;
  status: 'QUEUED' | 'SENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
}

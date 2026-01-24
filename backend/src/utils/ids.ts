import { v4 as uuidv4 } from 'uuid';

export function generateConversationId(): string {
  return `conv_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
}

export function generateVisitorId(): string {
  return `vis_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
}

export function generateMessageId(): string {
  return `msg_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
}

export function generateConnectionId(): string {
  return `conn_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
}

Backend Requirements (v1)

1) Base & Headers

- Base URL: https://api.replyhq.dev/v1
- WebSocket URL: wss://api.replyhq.dev/v1/realtime
- Required headers on all REST requests:
    - X-App-Id (string, required)
    - X-Device-Id (string, required, generated client‑side once and persisted)
    - X-SDK-Version (string, currently 1.0.0)
    - Content-Type: application/json

2) REST Endpoints

POST /conversations
Create or fetch conversation for current device/user.

- Request:

{
"user": {
"id": "user_123",
"name": "Jane Doe",
"email": "jane@example.com",
"attributes": { "plan": "pro" }
},
"device_context": {
"platform": "android|ios",
"os_version": "Android 14 (API 34)",
"app_version": "1.2.3",
"device_model": "Pixel 7",
"locale": "en_US",
"timezone": "America/New_York",
"sdk_version": "1.0.0"
}
}

- Response:

{
"conversation": {
"id": "conv_xxx",
"visitor_id": "vis_xxx",
"status": "open|resolved",
"created_at": "2026-01-21T12:34:56Z",
"updated_at": "2026-01-21T12:34:56Z",
"metadata": {}
}
}

POST /conversations/:id/messages
Send a message (idempotent via local_id).

- Request:

{
"local_id": "uuid-v4",
"body": "Hello",
"device_context": { ... }  // optional
}

- Response:

{
"message": {
"id": "msg_xxx",
"local_id": "uuid-v4",
"conversation_id": "conv_xxx",
"body": "Hello",
"sender": "user|agent|system",
"created_at": "2026-01-21T12:35:10Z",
"status": "QUEUED|SENDING|SENT|DELIVERED|READ|FAILED"
}
}

GET /conversations/:id/messages?after=<epoch_ms>&limit=<n>
Fetch messages after a timestamp.

- Query params:
    - after: epoch milliseconds (Long). Optional.
    - limit: integer, default 50.
- Response:

{
"messages": [ ...Message... ],
"has_more": false
}

POST /push-token
Register device push token.

- Request:

{
"token": "push_token",
"platform": "android|ios",
"device_id": "device_xxx"
}

- Response:

{ "success": true }

3) WebSocket Contract

- Connect: wss://api.replyhq.dev/v1/realtime?app_id=<appId>&device_id=<deviceId>
- Server → client events (JSON with type discriminator):
    - message.new
    - agent.typing
    - connection.established
    - pong
    - error
- Shapes:

{ "type": "message.new", "message": { ...Message... } }
{ "type": "agent.typing", "conversation_id": "conv_xxx", "is_typing": true }
{ "type": "connection.established", "connection_id": "conn_xxx" }
{ "type": "pong" }
{ "type": "error", "error": "string", "code": "string?" }

- Client → server events:

{ "type": "user.typing", "conversation_id": "conv_xxx", "is_typing": true }
{ "type": "ping" }

- Heartbeat: client sends ping every 30s.

4) Error Model & Status Codes

- Error response shape:

{ "error": "string", "code": "string?", "message": "string?" }

- Expected behavior from PRD:
    - 401 → “token expired” scenario; SDK clears state and re‑creates device/conversation.
    - 403 → invalid app_id, SDK disables itself gracefully.
- Any non‑2xx should return the above error shape (SDK attempts to parse it).

5) Message/Conversation Rules

- Idempotency: local_id is authoritative. If the same local_id is sent again, backend must return the existing message (no duplicates).
- Ordering: server timestamp is source of truth (created_at).
- Length limit: enforce 5000 char max (SDK expects client‑side validation but backend must enforce too).
- Rate limit: 5 messages/sec per device/user; queueing is on the client, but backend should guard.

6) State & Sync Expectations

- Client persists queued messages and retries up to 3 times.
- On reconnect, client calls GET /messages?after=<lastSyncEpochMs>; backend must return all messages after that timestamp (including agent/system messages).
- WebSocket message.new should include local_id for user messages so client can reconcile pending messages.

7) Push Notifications

- Register and update push tokens idempotently per device_id.
- Backend must be able to deliver pushes for new agent messages when device is offline.
- Token changes can happen at any time; backend should overwrite existing token for the device.

8) Data Types / Formats

- Timestamps: ISO‑8601 strings for created_at / updated_at in REST + WS payloads (SDK expects parseable Instant).
- after is epoch milliseconds in query param (Long).

9) Versioning / Compatibility

- SDK ignores unknown fields; backend can add new fields without breaking clients.
- Keep current fields and naming intact (snake_case where specified by @SerialName).
# ReplyHQ Backend — Reference Guide

This is the formal backend reference for ReplyHQ. It covers architecture, data model, API specs, realtime protocol, deployment, and operational runbooks.

---

## 1) Architecture

**Components**
- **Express REST API** under `/v1`
- **Socket.IO** at `/v1/socket.io` with `/client` and `/admin` namespaces
- **Legacy WebSocket** at `/v1/realtime` and `/admin/realtime` (deprecated)
- **Postgres** via Prisma
- **Redis** for presence + pub/sub (optional in dev, required in prod)

**Startup sequence**
1. Connect DB
2. Connect Redis (non‑fatal if missing)
3. Init Firebase (if configured)
4. Create HTTP server + attach Express
5. Init Socket.IO
6. Init admin WebSocket handler
7. Listen on `PORT`

---

## 2) Data Model

**App**
- `id`, `name`, `apiKey`, `settings`, timestamps

**Conversation**
- `id`, `visitorId`, `status`, `metadata`, `appId`, `deviceId`, `userId`, timestamps

**Message**
- `id`, `localId`, `body`, `sender`, `status`, `sequence`, timestamps, `conversationId`

**Device**
- `deviceId`, `userId`, `pushToken`, `platform`, timestamps, `appId`

---

## 3) REST API

### Headers (required for `/v1`)
- `X-App-Id`
- `X-Device-Id`
- `X-Api-Key`
- `X-SDK-Version` (optional)

### 3.1 Create/Get Conversation
`POST /v1/conversations`

**Body**
```json
{
  "user": { "id": "user_123", "name": "Jane" },
  "device_context": {
    "platform": "android",
    "os_version": "14",
    "app_version": "1.0.0",
    "device_model": "Pixel 7",
    "locale": "en-US",
    "timezone": "UTC",
    "sdk_version": "1.0.0"
  }
}
```

**Response**
```json
{ "conversation": { "id": "conv_...", "status": "open", ... } }
```

### 3.2 Send Message
`POST /v1/conversations/:id/messages`

**Body**
```json
{
  "local_id": "uuid",
  "body": "Hello",
  "device_context": { "platform": "android" }
}
```

**Response**
```json
{ "message": { "id": "msg_...", "status": "SENT", ... } }
```

### 3.3 List Messages
`GET /v1/conversations/:id/messages?after=timestamp&limit=50`

**Response**
```json
{ "messages": [ ... ], "has_more": false }
```

### 3.4 Update Message Status
`POST /v1/conversations/:id/messages/status`

```json
{ "message_id": "msg_...", "status": "READ" }
```

### 3.5 Delivered/Read
- `POST /v1/conversations/:id/messages/delivered`
- `POST /v1/conversations/:id/messages/read`

---

## 4) Socket.IO Protocol

**Endpoint**
`ws(s)://host/v1/socket.io/?EIO=4&transport=websocket`

**Namespaces**
- `/client`
- `/admin`

**Auth payload**
```json
{
  "app_id": "...",
  "device_id": "...",
  "api_key": "..."
}
```

### 4.1 Client events

**Client → Server**
- `conversation:join` (payload: `{ conversation_id }`, ack)
- `conversation:leave` (payload: `{ conversation_id }`)
- `typing:start` / `typing:stop` (payload: `{ conversation_id }`)
- `ping`

**Server → Client**
- `connected`
- `conversation:joined`
- `message:new`
- `agent:typing`
- `user:typing`
- `pong`
- `error`

### 4.2 Admin events

**Admin → Server**
- `app:subscribe`
- `conversation:join`
- `conversation:leave`
- `message:send`
- `sessions:list`
- `typing:start` / `typing:stop`

**Server → Admin**
- `session:connect`
- `session:disconnect`
- `presence:change`

---

## 5) Presence

- Redis = source of truth across nodes.
- Without Redis = in‑memory only (single node).

---

## 6) Deployment

**Build**
```bash
pnpm -C backend install
pnpm -C backend build
```

**Run**
```bash
DATABASE_URL=... PORT=3000 node dist/index.js
```

**Migrations**
```bash
pnpm -C backend prisma migrate deploy
```

---

## 7) Operations / Runbooks

### A) Port already in use
```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
kill <PID>
```

### B) User shows offline
- Ensure Redis is running if multi‑node.
- In dev without Redis: presence only works in‑memory.

### C) Socket.IO connect issues
- Verify URL: `/v1/socket.io/?EIO=4&transport=websocket`
- Confirm auth payload
- Check server logs for `connection_error`

---

## 8) Known Limits

- Redis optional → no multi‑node presence.
- Legacy ws still present.
- Shared API key for admin + client.
- Limited rate limiting.
- No structured logging or tracing.

---

## 9) Production Checklist

- Redis required + Socket.IO adapter enabled
- Remove legacy ws after migration
- Admin auth + RBAC
- Observability (logs, metrics, tracing)
- Load testing + autoscaling
- DB backups + retention policies


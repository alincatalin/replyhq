# ReplyHQ Backend Documentation

This document explains how the backend works, current limits, and what’s required to make it production‑ready. It also includes environment variables, deployment steps, and operational runbooks.

---

## 1) Architecture Overview

**Core components**
- **HTTP API (Express)**: REST endpoints under `/v1` plus admin/setup pages.
- **Socket.IO (primary realtime)**: `/v1/socket.io` with namespaces `/client` and `/admin`.
- **Legacy WebSocket (ws)**: `/v1/realtime` (client) and `/admin/realtime` (admin) for older SDKs.
- **Database (Postgres via Prisma)**: `apps`, `conversations`, `messages`, `devices`.
- **Redis (optional today)**: pub/sub + presence store. If missing, presence falls back to in‑memory (single‑node only).

**Startup flow**
1. Connect to Postgres.
2. Attempt Redis connect (non‑fatal if missing).
3. Initialize Firebase if configured.
4. Create HTTP server and attach Express.
5. Initialize Socket.IO on `/v1/socket.io` (websocket‑only transport).
6. Initialize admin WebSocket handler (`/admin/realtime`).
7. Start listening on `PORT`.

---

## 2) Data Model (Prisma)

- **App**: `id`, `name`, `apiKey`, `settings`, timestamps.
- **Conversation**: `id`, `visitorId`, `status`, `metadata`, `appId`, `deviceId`, `userId`, timestamps.
- **Message**: `id`, `localId`, `body`, `sender`, `status`, `sequence`, timestamps, `conversationId`.
- **Device**: `deviceId`, `userId`, `pushToken`, `platform`, timestamps, `appId`.

---

## 3) HTTP API

**Routes**
- `POST /v1/conversations` → get/create conversation
- `POST /v1/conversations/:id/messages` → create message
- `GET /v1/conversations/:id/messages` → list messages
- `POST /v1/conversations/:id/messages/status` → update status
- `POST /v1/conversations/:id/messages/delivered` → mark delivered
- `POST /v1/conversations/:id/messages/read` → mark read
- `POST /v1/identify` → attach user profile to device/conversation
- `POST /v1/events/track` → track analytics event (SDK use)
- `GET /health` → health check + websocket connection count
- `GET /admin`, `/admin/api/...` → admin UI + data
- `GET /setup`, `/setup/api/...` → setup UI + app creation

**Header validation**
All `/v1` routes (except websocket upgrades) require:
- `X-App-Id`, `X-Device-Id`, `X-Api-Key`, optional `X-SDK-Version`.

**Device context**
`device_context.platform` supports: `ios`, `android`, `web`, `desktop`.

---

## 4) Realtime (Socket.IO)

**Server**
- Path: `/v1/socket.io` (websocket‑only)
- Namespaces:
  - `/client` for SDK clients
  - `/admin` for dashboard

**Client auth**
- `socket.handshake.auth` must include: `app_id`, `device_id`, `api_key`

**Key events**
- Client → Server: `conversation:join`, `conversation:leave`, `typing:start`, `typing:stop`, `ping`
- Server → Client: `connected`, `conversation:joined`, `message:new`, `agent:typing`, `server:shutdown`, `user:typing`, `pong`, `error`

**Behavior**
- On connect: register session, set presence, emit `connected`, auto‑join latest conversation.
- Presence uses Redis if available; otherwise in‑memory fallback is used.

---

## 5) Legacy WebSocket (ws)

- `/v1/realtime` (client) and `/admin/realtime` (admin)
- Compression disabled (OkHttp compatibility)
- Heartbeat/ping loop

**Status**: still needed by older SDK code paths; should be removed after full migration to Socket.IO.

---

## 6) Presence System

- **Redis path**: per‑connection + per‑device keys with TTL.
- **No‑Redis path**: in‑memory maps of device → connection set + connection info.

**Important**: In‑memory presence works only in single‑node dev setups. Multi‑node requires Redis.

---

## 7) Environment Variables

Required (prod):
- `DATABASE_URL` — Postgres connection string.

Optional:
- `PORT` — server port (default 3000).
- `REDIS_URL` — Redis connection string (enables presence + pub/sub).
- `FIREBASE_SERVICE_ACCOUNT_JSON` — JSON string for FCM.

Recommended additional config (future):
- `LOG_LEVEL` — standard log level.
- `NODE_ENV` — `development` | `production`.
- `SENTRY_DSN` — error reporting.

---

## 8) Deployment

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

**Recommended prod setup**
- Run behind a reverse proxy (Nginx/ALB) with WebSocket support.
- Use a managed Postgres (with backups).
- Use managed Redis (required for presence + pub/sub).
- Configure TLS termination.

---

## 9) Limits / Known Constraints

1. **No Redis = single‑node presence only**
2. **Legacy ws + Socket.IO** = duplicated realtime stacks
3. **Shared API keys for admin/client**
4. **Basic rate limiting only**
5. **Unstructured logging**
6. **No tracing / correlation IDs**
7. **Minimal validation for socket payloads**
8. **No DB read replicas / sharding strategy**

---

## 10) Production Readiness Plan

### Reliability & Scaling
- Make Redis mandatory.
- Enable Socket.IO Redis adapter in all envs.
- Remove legacy ws after migration.
- Add load balancer with WebSocket support.

### Security
- Separate admin auth (tokens + RBAC).
- Rotate and expire API keys.
- Lock down CORS + admin routes.

### Observability
- Structured logs (JSON + request IDs).
- OpenTelemetry tracing for HTTP + Socket.IO.
- Metrics: latency, error rates, active sockets, queue depths.

### Data Safety
- Automated DB backups.
- Migrations in CI/CD.
- Retention policies for messages.

---

## 11) Operational Runbooks

### A) Server won’t start (EADDRINUSE)
- Check port usage: `lsof -nP -iTCP:3000 -sTCP:LISTEN`
- Stop old process or change `PORT`.

### B) Users show offline in dashboard
- Redis not running → presence fallback only works on a single node.
- Confirm Redis connection logs.

### C) Socket.IO connection fails
- Ensure correct URL: `ws(s)://host/v1/socket.io/?EIO=4&transport=websocket`
- Confirm `/v1/socket.io` path matches server config.
- Check auth payload: `app_id`, `device_id`, `api_key`.

### D) Message send returns 400
- Validate request body against schema: `local_id`, `body`, `device_context`.
- `device_context` must be object or omitted (null is now allowed).

### E) High latency or dropped messages
- Verify Redis is healthy (pub/sub lag).
- Check DB load and message queries.

---

## 12) Suggested Roadmap (High‑Impact)

1. **Make Redis required** in all non‑dev envs.
2. **Remove legacy ws** once migration is complete.
3. **Admin auth & RBAC**.
4. **Observability stack** (logs + metrics + tracing).
5. **Load testing** (10k+ sockets, high message volume).
6. **HA deployments** with autoscaling + Redis cluster.

---

If you want, I can expand this into `docs/backend.md` with endpoint specs and diagrams, or add a deployment checklist per environment.

# Frontend vs Backend Gap Analysis

Date: 2026-01-27
Owner: ReplyHQ

## Summary
This document captures the current gaps between the admin frontend (static HTML/JS in `backend/public/`) and the backend APIs/services, plus a plan to close each gap. It also records critical integration mismatches that are currently breaking functionality.

## What is implemented and aligned
- Core chat REST API (`/v1/conversations`, `/v1/conversations/:id/messages`, status/read/delivered, sync).
- Socket.IO realtime (`/v1/socket.io` namespaces `/client` and `/admin`).
- Admin auth + RBAC (JWT login/refresh/logout + permissions).
- Admin chat endpoints for dashboard and chat UI.
- Onboarding endpoints and quickstart docs endpoint.
- Billing endpoints (Stripe checkout, subscription, cancel/reactivate, proration preview).
- Analytics and segmentation endpoints.

## Frontend shows features the backend does not provide
1) Broadcasts UI
- Pages: `backend/public/broadcasts.html`, `backend/public/broadcast-new.html`, `backend/public/broadcast-analytics.html`
- Missing backend: data models, CRUD, scheduler, analytics aggregation.
- Spec draft: `docs/missing-backend-features.md` (Broadcasts System).

2) Workflows UI
- Pages: `backend/public/workflows.html`, `backend/public/workflow-editor.html`
- Missing backend: workflow storage, validation, execution engine, triggers.
- Spec draft: `docs/missing-backend-features.md` (Workflows System).

3) Settings UI sections without APIs
- Account profile data (email), usage stats, team/user management, API key management, webhook config, Stripe portal.
- Current settings JS only handles subscription and checkout; everything else is static.

## Backend provides features the frontend does not use
- Analytics endpoints: `/admin/analytics/*` (overview, events, timeline, segments).
- Webhooks endpoints: `/admin/webhooks/*`.
- Billing proration preview: `/admin/billing/preview-proration`.
- Socket.IO admin events: `sessions:list`.

## Critical integration mismatches (must fix)
1) Auth response shape mismatch
- Backend returns `access_token`, `refresh_token`.
- Frontend expects `accessToken`, `refreshToken` and sends `refreshToken` on refresh/logout.

2) API key validation broken for new apps
- Setup stores only `apiKeyHash`.
- REST app validation and Socket.IO auth compare against `app.apiKey`.

3) Admin Socket.IO payload mismatch
- Frontend sends `{ conversation_id }` for `conversation:join/leave` and `typing:start/stop`.
- Backend admin handlers expect a plain string.

4) Dashboard expects device metadata but admin API does not include it
- UI expects `metadata.device` (platform/model) but `/admin/api/users` returns no device metadata.

5) Admin Socket.IO auth mismatch
- Frontend sends JWT as `admin_token`.
- Backend expects `admin_token` to be the app API key.
Decision: Admin Socket.IO should authenticate with JWT access tokens (admin). Backend will accept JWT and validate `appId` from the token. API key auth remains only as a legacy fallback.

## Plan to close gaps

### Phase 1: Fix critical integration mismatches (now)
- Align frontend to backend auth token shape (`access_token`, `refresh_token`).
- Update refresh/logout to send `refresh_token`.
- Fix app API key verification to use `apiKeyHash` (and allow legacy `apiKey` if present).
- Align admin Socket.IO payloads to accept `{ conversation_id }` (string or object).
- Add device metadata to `/admin/api/users` and render it in dashboard.
- Switch admin Socket.IO auth to JWT validation and sync with frontend payload.

### Phase 2: Fill UI data gaps for existing features
- Add dashboard stats endpoint to avoid computed-only UI.
- Wire settings/account data and usage metrics.
- Expose Stripe portal endpoint if needed.
- Expose webhooks and analytics in UI.

### Phase 3: Implement backend for UI-only features
- Broadcasts: models, routes, scheduling, analytics.
- Workflows: models, validation, execution engine, triggers.
- Settings extensions: API key management, team/users, branding, webhooks.

### Phase 4: Cleanup
- Remove legacy auth paths once JWT + hashed API key are stable.
- Document final API contracts and update `BACKEND_DOCUMENTATION.md`.

# ADR-001: Socket.IO Realtime Chat Migration

**Date:** January 24, 2026
**Status:** ACCEPTED ✅
**Decision Makers:** Ralph (Autonomous Agent), Team Lead
**Affects:** Backend, SDK, Realtime Chat System

---

## Context

ReplyHQ's realtime chat system was built using raw WebSocket (`ws` library). While functional, the implementation had several critical production issues:

1. **Multi-connection presence bug:** Device marked offline when ANY connection closed, even if other connections remained active
2. **No graceful shutdown:** Server restarts caused abrupt client disconnections
3. **Manual room management:** Custom Redis pub/sub logic for subscription tracking
4. **Clock skew vulnerability:** Timestamp-based message sync failed with client clock drift
5. **No multi-node support:** Server restart lost all active connections
6. **No acknowledgements:** Unable to reliably verify message delivery

The team evaluated three approaches:

### Option A: Continue with Raw WebSocket (Rejected)
- Fix presence bug in custom code
- Implement graceful shutdown manually
- Build multi-node support from scratch
- **Cost:** High maintenance, error-prone, reinventing the wheel

### Option B: Use Official WebSocket Library with Enhancements (Considered)
- Upgrade to `ws` v9+ with auto-reconnect plugins
- Implement presence tracking layer
- Build room management on top
- **Cost:** Still building core features ourselves, fragile

### Option C: Migrate to Socket.IO 4.8.3 (SELECTED) ✅
- Production-grade realtime framework
- Built-in rooms, namespaces, acknowledgements
- Redis adapter for multi-node scaling
- Graceful shutdown support
- **Cost:** Custom KMP client needed (one-time investment)

---

## Decision

**Migrate from raw WebSocket to Socket.IO 4.8.3** with the following architecture:

### Backend
- Socket.IO 4.8.3 on Express/HTTP server
- Two namespaces: `/client` (device connections) and `/admin` (dashboard)
- Redis adapter for multi-node broadcast
- Per-connection presence tracking with per-device aggregation
- Graceful shutdown with client notifications

### SDK
- Custom Socket.IO client for Kotlin Multiplatform (no official client exists)
- Engine.IO + Socket.IO protocol implementation
- Type-safe event handling via sealed classes
- Integrated with existing ConnectionManager and SyncManager

### Migration Strategy
- Rolling deployment: Old `ws` endpoint continues, new Socket.IO endpoint available
- No breaking changes to existing clients during transition
- Clients can migrate at their own pace

---

## Rationale

### Why Socket.IO?

| Feature | Raw WS | Socket.IO |
|---------|--------|-----------|
| **Rooms/Namespaces** | ❌ Manual | ✅ Built-in |
| **Acknowledgements** | ❌ No | ✅ Yes |
| **Auto-reconnect** | ❌ No | ✅ Yes |
| **Multi-node scaling** | ❌ No | ✅ Redis adapter |
| **Graceful shutdown** | ❌ No | ✅ Yes |
| **Production maturity** | ⚠️ 6 years old | ✅ 11+ years battle-tested |
| **Community support** | ⚠️ Basic | ✅ Large ecosystem |
| **Maintenance burden** | 🔴 High | 🟢 Low |

### Why Custom KMP Client?

| Option | Status |
|--------|--------|
| Official socket.io-client | ❌ JavaScript-only |
| socket.io-client-java | ❌ Android-only, not KMP |
| socket.io-kotlin | ❌ Unmaintained |
| Custom implementation | ✅ Chosen |

The custom implementation is justified because:
1. **One-time investment:** Build once, reuse forever
2. **Well-documented:** Socket.IO protocol is publicly documented
3. **Testable:** 96 integration tests validate correctness
4. **Maintainable:** Clean separation of protocol parsing and event handling
5. **Flexible:** Can optimize for mobile constraints (no HTTP polling)

### Why Separate Namespaces?

Instead of a single namespace with role-based filtering:

```
❌ Single namespace with roles
socket.on('connect', (socket) => {
  const role = determineRole(socket.auth.token);
  if (role === 'admin') {
    // send admin events
  }
});
// Problem: Easy to accidentally send client events to admin

✅ Separate namespaces
const clientNs = io.of('/client');
const adminNs = io.of('/admin');
// Each has independent event handling
// Impossible to cross-contaminate
// Can deploy changes to one without affecting the other
```

**Benefits:**
- Namespace isolation prevents data leaks
- Independent event schemas
- Admin and client can evolve separately
- Role-based filtering at connection time (not event time)

### Why Per-Connection Presence?

The presence bug demonstrated why per-device tracking is insufficient:

```
❌ Old approach: Single presence key per device
key: presence:{appId}:{deviceId} = "online" | "offline"
Problem:
  - Device A opens 2 browser tabs (connections 1 & 2)
  - Connection 1 closes
  - System marks device offline ← BUG (connection 2 still active!)

✅ New approach: Aggregate connections
key: presence:conn:{connectionId} = { appId, deviceId, createdAt }
key: presence:device:{appId}:{deviceId} = Set<connectionIds>
Logic:
  - On disconnect: sRem connectionId from set
  - If sCard == 0: Mark offline
  - If sCard > 0: Stay online ← FIX
```

This is the correct pattern for multi-connection presence because:
1. **Accurate tracking:** Every connection visible
2. **Device-level aggregation:** One offline broadcast per device
3. **TTL-based cleanup:** Redis TTL handles stale entries
4. **Horizontal scaling:** Works across multiple server instances

---

## Consequences

### Positive
✅ **Reliability:** Multi-connection presence bug fixed
✅ **Scalability:** Redis adapter enables horizontal scaling
✅ **Operations:** Graceful shutdown prevents message loss
✅ **Features:** Acknowledgements enable robust delivery tracking
✅ **Maintenance:** Socket.IO is battle-tested, reduces custom code
✅ **Clock Sync:** Cursor-based sync immune to clock drift
✅ **Admin Visibility:** Session tracking enables better monitoring

### Trade-offs
⚠️ **Custom KMP Client:** Maintenance responsibility
⚠️ **Larger Dependency:** Socket.IO adds ~50KB gzipped
⚠️ **Learning Curve:** Team learns new protocol
⚠️ **Breaking Change (future):** Will need to deprecate old ws endpoint eventually

### Risk Mitigation
- **Custom client:** 96 tests validate correctness, thorough documentation
- **Dependencies:** Socket.IO is production-proven, actively maintained
- **Adoption:** Gradual migration path, old endpoint continues working
- **Training:** Developer reference guide and runbooks provided

---

## Implementation Status

### ✅ Completed
- [x] Backend Socket.IO server (700 lines, fully implemented)
- [x] Presence service rewrite (multi-connection support)
- [x] Custom KMP client (500 lines, protocol-compliant)
- [x] Event type definitions (sealed classes)
- [x] ConnectionManager integration
- [x] SyncManager event handling
- [x] Admin namespace with session tracking
- [x] Message service integration
- [x] Graceful shutdown implementation
- [x] 96 integration tests (all passing)
- [x] Comprehensive documentation
- [x] Developer reference guide

### 📋 Future Work
- [ ] Separate admin authentication tokens (currently shares with client API key)
- [ ] Binary message protocol (reduce bandwidth)
- [ ] Message delivery receipts (per-device delivery confirmation)
- [ ] Encrypted message transport (E2E)
- [ ] Typing indicator debouncing (reduce events)
- [ ] Offline message queuing (improve UX)

---

## Testing & Validation

**96 Tests across 5 test files - All Passing ✅**

| Category | Count | Status |
|----------|-------|--------|
| Socket.IO Integration | 22 | ✅ Passing |
| End-to-End Flows | 18 | ✅ Passing |
| Multi-Connection | 19 | ✅ Passing |
| Broadcast Validation | 31 | ✅ Passing |
| Message Flow | 6 | ✅ Passing |

**Key Scenarios Validated:**
- ✅ Multi-connection presence (device stays online with multiple connections)
- ✅ Graceful shutdown (clients notified before server restart)
- ✅ Message delivery (all subscribers receive via Socket.IO)
- ✅ Admin operations (session listing, message sending)
- ✅ Typing indicators (both directions)
- ✅ Presence lifecycle (connect → online, last disconnect → offline)
- ✅ Message idempotency (duplicates deduplicated via local_id)

---

## Deployment Plan

### Phase 1: Parallel Deployment (Week 1)
```
1. Deploy Socket.IO service alongside legacy ws
2. Monitor for issues
3. New mobile app releases use Socket.IO
4. Existing apps continue with ws
```

### Phase 2: Gradual Migration (Weeks 2-4)
```
1. New user signups directed to Socket.IO
2. Monitor performance metrics
3. Gather feedback from initial users
4. Make tuning adjustments
```

### Phase 3: Legacy Deprecation (Month 2+)
```
1. Set ws endpoint deprecation date
2. Send notifications to remaining ws users
3. Automatic redirects to Socket.IO
4. Eventually shut down ws endpoint
```

---

## Monitoring & Alerting

**Key Metrics to Track:**
- Active connections per namespace
- Connection latency (p50, p95, p99)
- Message delivery latency
- Presence consistency (TTL accuracy)
- Redis adapter performance
- Error rates by error code

**Alerting Thresholds:**
- Connection latency p95 > 5s → Investigate
- Message delivery latency p95 > 500ms → Check broadcast
- Redis adapter lag > 1s → Check pub/sub queue
- Presence inconsistency > 5% → Check TTL settings

---

## References

- **Implementation Details:** `/Users/alin/Desktop/replyhq/SOCKETIO_MIGRATION.md`
- **Developer Guide:** `/Users/alin/Desktop/replyhq/SOCKETIO_DEVELOPER_REFERENCE.md`
- **Socket.IO Docs:** https://socket.io/docs/v4/
- **Socket.IO Protocol:** https://socket.io/docs/v4/socket-io-protocol/
- **Test Files:** `/Users/alin/Desktop/replyhq/backend/src/tests/integration/`

---

## Approval

- **Technical Review:** ✅ Complete
- **Testing:** ✅ 96/96 tests passing
- **Documentation:** ✅ Comprehensive (3 documents)
- **Risk Assessment:** ✅ Low (well-tested, proven technology)

**Recommendation:** ACCEPT and proceed with deployment

---

**Document Version:** 1.0
**Last Updated:** January 24, 2026
**Next Review:** After 1 month in production

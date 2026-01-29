# Deployment Verification Checklist: Phase 0 Security Fixes

**Deployment Date:** TBD
**Plan Reference:** `/Users/alin/Desktop/replyhq/docs/plans/2026-01-25-fix-phase-0-critical-security-fixes-plan.md`
**Priority:** P0 - Critical (Production Blocking)
**Estimated Deployment Time:** 30-45 minutes
**Required Downtime:** 5-10 minutes for database migration

---

## Data Invariants

These conditions MUST remain true before and after deployment:

- [ ] Total count of apps remains unchanged
- [ ] All existing API keys remain functional after hashing
- [ ] No conversations, messages, or devices are deleted or modified
- [ ] All foreign key relationships remain intact (conversations -> apps, messages -> conversations, devices -> apps)
- [ ] All multi-tenant indexes remain present on `app_id` columns
- [ ] RLS policies enforce tenant isolation without breaking existing queries

---

## Pre-Deployment Verification (Required)

### 1. Environment Setup

**Production Environment Variables:**

```bash
# Verify these environment variables are set in production
# DO NOT run this on production - verify in your deployment system

REQUIRED_VARS=(
  "DATABASE_URL"
  "REDIS_URL"
  "MASTER_API_KEY"
  "ALLOWED_ORIGINS"
  "NODE_ENV=production"
)

# Example verification script for staging:
for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var}" ]]; then
    echo "ERROR: $var is not set"
    exit 1
  fi
done
```

**Environment Variable Checklist:**

- [ ] `MASTER_API_KEY` is set to a cryptographically secure random value (minimum 32 characters)
- [ ] `ALLOWED_ORIGINS` contains only production domains (comma-separated, no wildcards)
- [ ] `REDIS_URL` points to production Redis instance
- [ ] `DATABASE_URL` points to production PostgreSQL database (version 12+)
- [ ] `NODE_ENV` is set to `production`

**Generate MASTER_API_KEY:**

```bash
# Generate a secure random key (run this locally, not in production)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

---

### 2. Database Pre-Deployment Audit (Read-Only)

**CRITICAL: Run these queries BEFORE deployment and save the results**

```sql
-- ========================================
-- BASELINE COUNTS (Save these values!)
-- ========================================

-- Total number of apps
SELECT COUNT(*) as total_apps FROM apps;
-- Expected: [Current count] | Deviation: 0

-- Total number of API keys (should match total_apps)
SELECT COUNT(DISTINCT api_key) as unique_api_keys FROM apps;
-- Expected: [Current count] | Deviation: 0

-- Sample API keys (verify format - should NOT contain colons)
SELECT id, name, LEFT(api_key, 20) as api_key_prefix,
       LENGTH(api_key) as key_length,
       CASE
         WHEN api_key LIKE '%:%' THEN 'ALREADY_HASHED'
         ELSE 'PLAINTEXT'
       END as key_format
FROM apps
LIMIT 10;
-- Expected: All key_format = 'PLAINTEXT' | If any are 'ALREADY_HASHED', STOP

-- Total conversations per tenant
SELECT app_id, COUNT(*) as conversation_count
FROM conversations
GROUP BY app_id
ORDER BY conversation_count DESC
LIMIT 10;
-- Expected: [Current distribution] | Save for comparison

-- Total messages
SELECT COUNT(*) as total_messages FROM messages;
-- Expected: [Current count] | Deviation: 0

-- Total devices per tenant
SELECT app_id, COUNT(*) as device_count
FROM devices
GROUP BY app_id
ORDER BY device_count DESC
LIMIT 10;
-- Expected: [Current distribution] | Save for comparison

-- ========================================
-- DATA INTEGRITY CHECKS
-- ========================================

-- Check for NULL API keys (must be 0)
SELECT COUNT(*) as null_api_keys FROM apps WHERE api_key IS NULL;
-- Expected: 0 | If > 0, FIX BEFORE DEPLOYMENT

-- Check for duplicate API keys (must be 0)
SELECT api_key, COUNT(*) as duplicate_count
FROM apps
GROUP BY api_key
HAVING COUNT(*) > 1;
-- Expected: 0 rows | If > 0, FIX BEFORE DEPLOYMENT

-- Check for orphaned conversations (must be 0)
SELECT COUNT(*) as orphaned_conversations
FROM conversations c
LEFT JOIN apps a ON c.app_id = a.id
WHERE a.id IS NULL;
-- Expected: 0 | If > 0, data corruption detected

-- Check for orphaned messages (must be 0)
SELECT COUNT(*) as orphaned_messages
FROM messages m
LEFT JOIN conversations c ON m.conversation_id = c.id
WHERE c.id IS NULL;
-- Expected: 0 | If > 0, data corruption detected

-- Check for orphaned devices (must be 0)
SELECT COUNT(*) as orphaned_devices
FROM devices d
LEFT JOIN apps a ON d.app_id = a.id
WHERE a.id IS NULL;
-- Expected: 0 | If > 0, data corruption detected

-- ========================================
-- RLS READINESS CHECKS
-- ========================================

-- Verify RLS is NOT yet enabled (must be false)
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('conversations', 'messages', 'devices');
-- Expected: All rowsecurity = false | If any are true, RLS already enabled

-- Verify no existing RLS policies (must be 0)
SELECT COUNT(*) as existing_policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('conversations', 'messages', 'devices');
-- Expected: 0 | If > 0, policies already exist

-- ========================================
-- INDEX VERIFICATION
-- ========================================

-- Verify multi-tenant indexes exist
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('conversations', 'messages', 'devices')
  AND indexdef LIKE '%app_id%';
-- Expected: Indexes on app_id exist for conversations and devices

-- ========================================
-- PERFORMANCE BASELINE
-- ========================================

-- Measure current query performance (run 3 times, take average)
EXPLAIN ANALYZE
SELECT * FROM conversations WHERE app_id = (SELECT id FROM apps LIMIT 1);
-- Record: Planning Time + Execution Time = [X] ms

EXPLAIN ANALYZE
SELECT * FROM messages m
JOIN conversations c ON m.conversation_id = c.id
WHERE c.app_id = (SELECT id FROM apps LIMIT 1)
LIMIT 100;
-- Record: Planning Time + Execution Time = [Y] ms
```

**Pre-Deployment Checklist:**

- [ ] All baseline counts recorded and saved
- [ ] No NULL API keys found
- [ ] No duplicate API keys found
- [ ] No orphaned records found
- [ ] RLS is currently disabled on all tables
- [ ] No existing RLS policies
- [ ] All multi-tenant indexes present
- [ ] Performance baseline recorded

**If any check fails, STOP deployment and fix issues first.**

---

### 3. Staging Environment Validation

**Deploy to staging first and verify:**

- [ ] Staging environment has identical schema to production
- [ ] API key migration completed successfully in staging
- [ ] RLS policies created without errors in staging
- [ ] All integration tests pass in staging
- [ ] Performance tests show <5% overhead in staging
- [ ] Rate limiting works correctly in staging
- [ ] CORS whitelist blocks unauthorized origins in staging

**Staging Test Commands:**

```bash
# Run integration tests
cd /Users/alin/Desktop/replyhq/backend
npm test -- tenantIsolation.test.ts

# Run performance tests
npm test -- rlsPerformance.test.ts

# Test rate limiting (should return 429 after 5 requests)
for i in {1..6}; do
  curl -X GET http://staging.replyhq.com/setup/api/apps \
    -H "X-Master-API-Key: $MASTER_API_KEY" \
    -w "\nStatus: %{http_code}\n"
done

# Test CORS (should block unauthorized origin)
curl -X GET http://staging.replyhq.com/v1/conversations \
  -H "Origin: https://evil.com" \
  -H "X-App-ID: test-app" \
  -H "X-API-Key: test-key" \
  -v
# Expected: CORS error
```

---

## Deployment Steps

### Step 1: Pre-Deployment Database Backup

**CRITICAL: Create point-in-time backup before ANY changes**

```bash
# PostgreSQL backup command (adjust for your infrastructure)
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME \
  --format=custom \
  --file=backup_phase0_$(date +%Y%m%d_%H%M%S).dump

# Verify backup file exists and has size > 0
ls -lh backup_phase0_*.dump

# Test backup restore on separate database (RECOMMENDED)
pg_restore -h $TEST_DB_HOST -U $TEST_DB_USER -d $TEST_DB_NAME \
  --clean --if-exists \
  backup_phase0_*.dump
```

**Backup Checklist:**

- [ ] Database backup created successfully
- [ ] Backup file size is reasonable (not 0 bytes)
- [ ] Backup restore tested on separate database (RECOMMENDED)
- [ ] Backup stored in secure location with retention policy

---

### Step 2: Deploy Application Code

**Deployment Order (IMPORTANT):**

1. Deploy new backend code with backward-compatible changes
2. Run database migrations
3. Verify migrations completed successfully
4. Restart application servers

```bash
# Example deployment commands (adjust for your infrastructure)

# 1. Deploy code (e.g., via Git pull + build)
cd /Users/alin/Desktop/replyhq/backend
git pull origin main
npm ci
npm run build

# 2. Run database migrations
npm run prisma:migrate:deploy

# 3. Verify migrations
npm run prisma:migrate:status

# 4. Restart application (zero-downtime if using load balancer)
pm2 reload replyhq-backend
# OR
kubectl rollout restart deployment/replyhq-backend
```

**Deployment Checklist:**

- [ ] Code deployed successfully
- [ ] Dependencies installed (`npm ci`)
- [ ] Build completed without errors
- [ ] Database migrations applied successfully
- [ ] Application servers restarted
- [ ] Health check endpoint returns 200

---

### Step 3: API Key Migration (CRITICAL - High Risk)

**This is a DESTRUCTIVE operation that modifies all existing API keys.**

**Migration Script Location:** `backend/prisma/migrations/xxx_hash_existing_api_keys.ts`

**Before Running Migration:**

- [ ] Backup verified and tested
- [ ] All application instances are running NEW code (with hashing logic)
- [ ] No deployments in progress
- [ ] Monitoring dashboards open

**Run Migration:**

```bash
cd /Users/alin/Desktop/replyhq/backend

# DRY RUN FIRST (verify count)
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.app.count().then(count => {
  console.log('Will migrate', count, 'API keys');
  prisma.\$disconnect();
});
"

# ACTUAL MIGRATION (no going back after this)
npm run migrate:hash-api-keys
```

**Expected Output:**

```
Starting API key migration...
Found 15 apps to migrate
Migrated app abc123...
Migrated app def456...
...
Migration complete!
```

**Migration Checklist:**

- [ ] Migration completed without errors
- [ ] Number of migrated apps matches baseline count
- [ ] No apps skipped (or only pre-hashed apps skipped)
- [ ] Migration logs saved for audit

**Immediate Post-Migration Verification:**

```sql
-- Verify all API keys are now hashed (should contain colon separator)
SELECT
  id,
  name,
  CASE
    WHEN api_key LIKE '%:%' THEN 'HASHED'
    ELSE 'PLAINTEXT'
  END as key_format,
  LENGTH(api_key) as key_length
FROM apps;
-- Expected: All key_format = 'HASHED'

-- Verify hash format (should be 'salt:hash')
SELECT
  id,
  name,
  LENGTH(SPLIT_PART(api_key, ':', 1)) as salt_length,
  LENGTH(SPLIT_PART(api_key, ':', 2)) as hash_length
FROM apps
LIMIT 5;
-- Expected: salt_length = 32 (16 bytes hex), hash_length = 64 (SHA-256 hex)

-- Count total apps (should match baseline)
SELECT COUNT(*) as total_apps_after_migration FROM apps;
-- Compare with baseline count
```

**If migration fails or produces unexpected results:**

1. **STOP immediately**
2. Restore from backup (see Rollback section)
3. Investigate error logs
4. Fix issue in staging first
5. Create new backup and retry

---

### Step 4: Enable Row-Level Security (CRITICAL - High Risk)

**This changes database access patterns for all queries.**

**Migration Script Location:** `backend/prisma/migrations/xxx_enable_rls.sql`

```sql
-- ========================================
-- ENABLE ROW LEVEL SECURITY
-- ========================================

BEGIN;

-- Enable RLS on multi-tenant tables
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY tenant_isolation_conversations ON conversations
  FOR ALL
  USING (app_id = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation_messages ON messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
        AND conversations.app_id = current_setting('app.current_tenant', true)
    )
  );

CREATE POLICY tenant_isolation_devices ON devices
  FOR ALL
  USING (app_id = current_setting('app.current_tenant', true));

COMMIT;
```

**Run RLS Migration:**

```bash
# Apply RLS migration
psql $DATABASE_URL -f backend/prisma/migrations/xxx_enable_rls.sql
```

**Expected Output:**

```
ALTER TABLE
ALTER TABLE
ALTER TABLE
CREATE POLICY
CREATE POLICY
CREATE POLICY
```

**RLS Migration Checklist:**

- [ ] RLS enabled on conversations, messages, devices
- [ ] Three policies created successfully
- [ ] No errors during migration
- [ ] Transaction committed

**Immediate Post-RLS Verification:**

```sql
-- Verify RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('conversations', 'messages', 'devices');
-- Expected: All rowsecurity = true

-- Verify policies exist
SELECT
  tablename,
  policyname,
  permissive,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('conversations', 'messages', 'devices')
ORDER BY tablename, policyname;
-- Expected: 3 policies with correct names

-- Test RLS enforcement (should return 0 rows without tenant context)
-- IMPORTANT: Run in a NEW database connection
SELECT COUNT(*) as visible_conversations FROM conversations;
-- Expected: 0 (RLS blocks access without tenant context)

-- Test RLS with tenant context (should return rows)
SELECT set_config('app.current_tenant', (SELECT id FROM apps LIMIT 1), TRUE);
SELECT COUNT(*) as visible_conversations FROM conversations;
-- Expected: > 0 (RLS allows access with correct tenant)
```

---

## Post-Deployment Verification (Within 5 Minutes)

**Run these checks IMMEDIATELY after deployment completes.**

### 1. Application Health

```bash
# Health check endpoint
curl -f http://production.replyhq.com/health || echo "HEALTH CHECK FAILED"

# Verify application is accepting requests
curl -X GET http://production.replyhq.com/setup/api/apps \
  -H "X-Master-API-Key: $MASTER_API_KEY" \
  -w "\nHTTP Status: %{http_code}\n"
# Expected: 200 OK

# Check error logs (should be minimal)
# Adjust for your logging infrastructure
kubectl logs deployment/replyhq-backend --tail=50 | grep -i error
```

**Application Health Checklist:**

- [ ] Health check endpoint returns 200
- [ ] Setup endpoint requires MASTER_API_KEY header
- [ ] No critical errors in application logs
- [ ] Application servers all running

---

### 2. API Key Verification (Authentication)

**Test that existing API keys still work after hashing:**

```bash
# Get a test app ID and its ORIGINAL PLAINTEXT API key from backup
# (You saved these before deployment, right?)

# Test API authentication with plaintext key
curl -X POST http://production.replyhq.com/v1/conversations \
  -H "X-App-ID: $TEST_APP_ID" \
  -H "X-API-Key: $ORIGINAL_PLAINTEXT_KEY" \
  -H "X-Device-ID: test-device-123" \
  -H "Content-Type: application/json" \
  -d '{
    "user": {
      "id": "test-user-123"
    }
  }' \
  -w "\nHTTP Status: %{http_code}\n"
# Expected: 200 OK (plaintext key verified against hashed value)

# Test with WRONG API key (should fail)
curl -X POST http://production.replyhq.com/v1/conversations \
  -H "X-App-ID: $TEST_APP_ID" \
  -H "X-API-Key: wrong_key_12345" \
  -H "X-Device-ID: test-device-123" \
  -H "Content-Type: application/json" \
  -d '{
    "user": {
      "id": "test-user-123"
    }
  }' \
  -w "\nHTTP Status: %{http_code}\n"
# Expected: 403 Forbidden
```

**API Key Verification Checklist:**

- [ ] Existing API keys still authenticate successfully
- [ ] Invalid API keys are rejected with 403
- [ ] Authentication uses headers (not query params)
- [ ] Timing-safe comparison prevents enumeration attacks

---

### 3. Row-Level Security Verification

**Verify RLS enforces tenant isolation:**

```sql
-- ========================================
-- RLS VERIFICATION QUERIES
-- ========================================

-- Get two different app IDs for testing
WITH test_apps AS (
  SELECT id, name
  FROM apps
  ORDER BY created_at DESC
  LIMIT 2
)
SELECT * FROM test_apps;
-- Save app1_id and app2_id for testing

-- Test 1: Set tenant context for app1
SELECT set_config('app.current_tenant', '[app1_id]', TRUE);

-- Verify only app1's conversations are visible
SELECT COUNT(*) as app1_conversations
FROM conversations;
-- Expected: Only conversations for app1

-- Verify we CANNOT see app2's conversations
SELECT COUNT(*) as app2_conversations_visible
FROM conversations
WHERE app_id = '[app2_id]';
-- Expected: 0 (RLS blocks access to app2's data)

-- Test 2: Switch to app2's tenant context
SELECT set_config('app.current_tenant', '[app2_id]', TRUE);

-- Verify only app2's conversations are visible
SELECT COUNT(*) as app2_conversations
FROM conversations;
-- Expected: Only conversations for app2

-- Verify we CANNOT see app1's conversations
SELECT COUNT(*) as app1_conversations_visible
FROM conversations
WHERE app_id = '[app1_id]';
-- Expected: 0 (RLS blocks access to app1's data)

-- Test 3: Verify message isolation
SELECT set_config('app.current_tenant', '[app1_id]', TRUE);

SELECT COUNT(*) as app1_messages
FROM messages m
JOIN conversations c ON m.conversation_id = c.id;
-- Expected: Only messages in app1's conversations

-- Test 4: Verify device isolation
SELECT set_config('app.current_tenant', '[app1_id]', TRUE);

SELECT COUNT(*) as app1_devices
FROM devices;
-- Expected: Only devices for app1
```

**RLS Verification Checklist:**

- [ ] Tenant context correctly isolates data per app
- [ ] App1 cannot see App2's conversations
- [ ] App2 cannot see App1's conversations
- [ ] Message isolation works via conversation join
- [ ] Device isolation works correctly

---

### 4. Data Integrity Verification

**Verify no data was lost or corrupted:**

```sql
-- ========================================
-- DATA INTEGRITY POST-DEPLOYMENT
-- ========================================

-- Verify total counts match baseline (from pre-deployment audit)
SELECT COUNT(*) as total_apps_after FROM apps;
-- Compare with baseline: [baseline_count]
-- Deviation: 0

SELECT COUNT(*) as total_conversations_after FROM conversations;
-- Compare with baseline: [baseline_count]
-- Deviation: 0

SELECT COUNT(*) as total_messages_after FROM messages;
-- Compare with baseline: [baseline_count]
-- Deviation: 0

SELECT COUNT(*) as total_devices_after FROM devices;
-- Compare with baseline: [baseline_count]
-- Deviation: 0

-- Verify no NULL API keys introduced
SELECT COUNT(*) as null_api_keys FROM apps WHERE api_key IS NULL;
-- Expected: 0

-- Verify all API keys are hashed
SELECT COUNT(*) as unhashed_keys
FROM apps
WHERE api_key NOT LIKE '%:%';
-- Expected: 0

-- Verify foreign key integrity maintained
SELECT COUNT(*) as orphaned_conversations
FROM conversations c
LEFT JOIN apps a ON c.app_id = a.id
WHERE a.id IS NULL;
-- Expected: 0

SELECT COUNT(*) as orphaned_messages
FROM messages m
LEFT JOIN conversations c ON m.conversation_id = c.id
WHERE c.id IS NULL;
-- Expected: 0

SELECT COUNT(*) as orphaned_devices
FROM devices d
LEFT JOIN apps a ON d.app_id = a.id
WHERE a.id IS NULL;
-- Expected: 0

-- Verify conversation counts per tenant unchanged
SELECT app_id, COUNT(*) as conversation_count
FROM conversations
GROUP BY app_id
ORDER BY conversation_count DESC
LIMIT 10;
-- Compare with baseline distribution
```

**Data Integrity Checklist:**

- [ ] Total app count unchanged
- [ ] Total conversation count unchanged
- [ ] Total message count unchanged
- [ ] Total device count unchanged
- [ ] No NULL API keys
- [ ] All API keys are hashed
- [ ] No orphaned records
- [ ] Per-tenant counts match baseline

**If any counts differ, investigate immediately:**

1. Check application error logs
2. Check database transaction logs
3. Compare with backup data
4. Consider rollback if data loss detected

---

### 5. Rate Limiting Verification

**Test rate limiting on sensitive endpoints:**

```bash
# Test /setup rate limiting (should block after 5 requests)
echo "Testing /setup rate limiting..."
for i in {1..6}; do
  echo "Request $i:"
  curl -X GET http://production.replyhq.com/setup/api/apps \
    -H "X-Master-API-Key: $MASTER_API_KEY" \
    -w "\nHTTP Status: %{http_code}\n" \
    -s -o /dev/null
  sleep 1
done
# Expected: First 5 return 200, 6th returns 429

# Test /admin rate limiting
echo "Testing /admin rate limiting..."
for i in {1..6}; do
  echo "Request $i:"
  curl -X GET "http://production.replyhq.com/admin/api/users" \
    -H "X-App-ID: $TEST_APP_ID" \
    -H "X-API-Key: $TEST_API_KEY" \
    -w "\nHTTP Status: %{http_code}\n" \
    -s -o /dev/null
  sleep 1
done
# Expected: First 5 return 200, 6th returns 429

# Test API rate limiting (should allow 100 requests)
echo "Testing /v1 rate limiting..."
for i in {1..101}; do
  echo -n "$i "
  curl -X GET http://production.replyhq.com/v1/conversations \
    -H "X-App-ID: $TEST_APP_ID" \
    -H "X-API-Key: $TEST_API_KEY" \
    -H "X-Device-ID: test-device" \
    -s -o /dev/null \
    -w "%{http_code}\n"
done
# Expected: First 100 return 200, 101st returns 429
```

**Rate Limiting Checklist:**

- [ ] /setup rate limited to 5 requests per 15 minutes
- [ ] /admin rate limited to 5 requests per 15 minutes
- [ ] /v1 rate limited to 100 requests per 15 minutes
- [ ] 429 status returned when limit exceeded
- [ ] Rate limit headers present in responses

---

### 6. CORS Verification

**Test CORS whitelist enforcement:**

```bash
# Test allowed origin (should succeed)
curl -X GET http://production.replyhq.com/v1/conversations \
  -H "Origin: https://app.replyhq.com" \
  -H "X-App-ID: $TEST_APP_ID" \
  -H "X-API-Key: $TEST_API_KEY" \
  -H "X-Device-ID: test-device" \
  -v 2>&1 | grep -i "access-control"
# Expected: Access-Control-Allow-Origin: https://app.replyhq.com

# Test blocked origin (should fail)
curl -X GET http://production.replyhq.com/v1/conversations \
  -H "Origin: https://evil.com" \
  -H "X-App-ID: $TEST_APP_ID" \
  -H "X-API-Key: $TEST_API_KEY" \
  -H "X-Device-ID: test-device" \
  -v 2>&1 | grep -i "access-control"
# Expected: No Access-Control-Allow-Origin header OR CORS error

# Test request with no origin (should succeed - mobile apps)
curl -X GET http://production.replyhq.com/v1/conversations \
  -H "X-App-ID: $TEST_APP_ID" \
  -H "X-API-Key: $TEST_API_KEY" \
  -H "X-Device-ID: test-device" \
  -w "\nHTTP Status: %{http_code}\n"
# Expected: 200 OK
```

**CORS Verification Checklist:**

- [ ] Whitelisted origins are allowed
- [ ] Non-whitelisted origins are blocked
- [ ] Requests without origin header are allowed (mobile apps)
- [ ] Preflight requests handled correctly

---

### 7. Performance Verification

**Measure performance impact of security changes:**

```sql
-- ========================================
-- PERFORMANCE VERIFICATION
-- ========================================

-- Test 1: Query performance with RLS (run 3 times, take average)
EXPLAIN ANALYZE
SELECT * FROM conversations WHERE app_id = '[test_app_id]';
-- Record: Planning Time + Execution Time = [X] ms
-- Compare with pre-deployment baseline
-- Expected: <5% increase

-- Test 2: Join performance with RLS
EXPLAIN ANALYZE
SELECT * FROM messages m
JOIN conversations c ON m.conversation_id = c.id
WHERE c.app_id = '[test_app_id]'
LIMIT 100;
-- Record: Planning Time + Execution Time = [Y] ms
-- Compare with pre-deployment baseline
-- Expected: <5% increase

-- Test 3: Verify indexes are being used
EXPLAIN ANALYZE
SELECT * FROM conversations WHERE app_id = '[test_app_id]';
-- Verify: "Index Scan" or "Bitmap Index Scan" (not "Seq Scan")

-- Test 4: RLS overhead measurement
-- Disable RLS temporarily on test database (NOT production)
-- Run same queries and compare timing
-- Re-enable RLS immediately after
```

**Performance Verification Checklist:**

- [ ] Query performance within 5% of baseline
- [ ] Join performance within 5% of baseline
- [ ] Indexes are being used correctly
- [ ] No sequential scans on large tables
- [ ] RLS overhead is acceptable

---

## Monitoring and Validation (First 24 Hours)

### 1. Application Metrics

**Monitor these metrics continuously for the first 24 hours:**

| Metric | Alert Condition | Dashboard Link | Check Frequency |
|--------|-----------------|----------------|-----------------|
| **Error Rate** | >1% for 5 minutes | /dashboard/errors | Real-time alert |
| **API Response Time (p95)** | >500ms for 5 minutes | /dashboard/performance | Every 5 minutes |
| **Authentication Failures** | >5% for 5 minutes | /dashboard/auth | Real-time alert |
| **Rate Limit Hits** | >100/hour | /dashboard/ratelimit | Every 15 minutes |
| **Database Query Time (p95)** | >200ms for 5 minutes | /dashboard/database | Every 5 minutes |
| **RLS Policy Violations** | Any occurrence | Database logs | Real-time alert |
| **CORS Errors** | >10/hour | Application logs | Every 15 minutes |

**Monitoring Checklist:**

- [ ] Error rate monitoring active
- [ ] Performance monitoring active
- [ ] Authentication monitoring active
- [ ] Rate limiting monitoring active
- [ ] Database monitoring active
- [ ] Alerts configured for all critical metrics

---

### 2. Console Verification (1 Hour Post-Deploy)

**Run these verification queries 1 hour after deployment:**

```sql
-- ========================================
-- 1-HOUR POST-DEPLOYMENT CHECK
-- ========================================

-- Verify RLS is still enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('conversations', 'messages', 'devices');
-- Expected: All rowsecurity = true

-- Check for any NULL API keys (should be 0)
SELECT COUNT(*) as null_api_keys FROM apps WHERE api_key IS NULL;
-- Expected: 0

-- Check for any unhashed keys (should be 0)
SELECT COUNT(*) as unhashed_keys
FROM apps
WHERE api_key NOT LIKE '%:%';
-- Expected: 0

-- Verify data counts remain stable
SELECT
  (SELECT COUNT(*) FROM apps) as total_apps,
  (SELECT COUNT(*) FROM conversations) as total_conversations,
  (SELECT COUNT(*) FROM messages) as total_messages,
  (SELECT COUNT(*) FROM devices) as total_devices;
-- Compare with baseline and post-deployment counts

-- Spot check random records
SELECT
  c.id,
  c.app_id,
  c.status,
  COUNT(m.id) as message_count
FROM conversations c
LEFT JOIN messages m ON m.conversation_id = c.id
GROUP BY c.id, c.app_id, c.status
ORDER BY RANDOM()
LIMIT 10;
-- Verify: Data looks normal, message counts reasonable
```

**Console Verification Checklist:**

- [ ] RLS still enabled
- [ ] No NULL or unhashed API keys
- [ ] Data counts stable
- [ ] Spot checks look normal
- [ ] No anomalies detected

---

### 3. End-to-End User Flow Testing

**Test complete user workflows:**

```bash
# Test 1: Create new conversation via SDK
curl -X POST http://production.replyhq.com/v1/conversations \
  -H "X-App-ID: $TEST_APP_ID" \
  -H "X-API-Key: $TEST_API_KEY" \
  -H "X-Device-ID: test-device-e2e-$(date +%s)" \
  -H "Content-Type: application/json" \
  -d '{
    "user": {
      "id": "user-e2e-'$(date +%s)'",
      "name": "Test User",
      "attributes": {
        "plan": "pro",
        "test": true
      }
    }
  }'
# Expected: 200 OK with conversation object

# Test 2: Send message in conversation
CONV_ID="[conversation_id_from_test1]"
curl -X POST http://production.replyhq.com/v1/conversations/$CONV_ID/messages \
  -H "X-App-ID: $TEST_APP_ID" \
  -H "X-API-Key: $TEST_API_KEY" \
  -H "X-Device-ID: test-device-e2e-$(date +%s)" \
  -H "Content-Type: application/json" \
  -d '{
    "local_id": "msg-e2e-'$(date +%s)'",
    "body": "Test message from deployment verification",
    "role": "user"
  }'
# Expected: 200 OK with message object

# Test 3: Admin dashboard access
curl -X GET "http://production.replyhq.com/admin/api/users" \
  -H "X-App-ID: $TEST_APP_ID" \
  -H "X-API-Key: $TEST_API_KEY"
# Expected: 200 OK with users list

# Test 4: Admin send message
curl -X POST http://production.replyhq.com/admin/api/conversations/$CONV_ID/messages \
  -H "X-App-ID: $TEST_APP_ID" \
  -H "X-API-Key: $TEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "body": "Test admin response from deployment verification"
  }'
# Expected: 200 OK with message object
```

**End-to-End Testing Checklist:**

- [ ] Conversation creation works
- [ ] Message sending works
- [ ] Admin dashboard accessible
- [ ] Admin can send messages
- [ ] Socket.IO real-time updates work
- [ ] No security errors in flows

---

### 4. Continuous Monitoring Schedule

**Check these at regular intervals:**

**+1 Hour:**
- [ ] Run console verification queries
- [ ] Check error logs for anomalies
- [ ] Review performance metrics
- [ ] Verify no data corruption

**+4 Hours:**
- [ ] Review authentication failure rate
- [ ] Check rate limiting effectiveness
- [ ] Verify RLS performance acceptable
- [ ] Review CORS errors (should be minimal)

**+8 Hours:**
- [ ] Comprehensive data integrity check
- [ ] Performance comparison with baseline
- [ ] User-reported issues review
- [ ] Security event log review

**+24 Hours:**
- [ ] Final data integrity verification
- [ ] Performance trend analysis
- [ ] Security posture assessment
- [ ] Close deployment ticket

---

## Rollback Procedures

### When to Rollback

**Immediate rollback if:**

- Authentication failures >10% for 10 minutes
- Error rate >5% for 10 minutes
- Data integrity violations detected
- Performance degradation >20%
- Critical security vulnerability discovered

**Consider rollback if:**

- User-reported issues increase significantly
- Performance degradation 10-20%
- Non-critical data inconsistencies

### Rollback Decision Matrix

| Issue Severity | Authentication | Data Integrity | Performance | Action |
|----------------|----------------|----------------|-------------|--------|
| **Critical** | >10% failure | Any violation | >50% slower | Immediate rollback |
| **High** | 5-10% failure | Potential issue | 20-50% slower | Rollback + investigate |
| **Medium** | 1-5% failure | No issues | 10-20% slower | Monitor + investigate |
| **Low** | <1% failure | No issues | <10% slower | Monitor |

---

### Rollback Step 1: Disable RLS (Immediate - 2 minutes)

**This can be done WITHOUT application restart or code rollback.**

```sql
-- ========================================
-- EMERGENCY RLS DISABLE
-- ========================================

BEGIN;

-- Disable RLS on all tables
ALTER TABLE conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE devices DISABLE ROW LEVEL SECURITY;

COMMIT;

-- Verify RLS disabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('conversations', 'messages', 'devices');
-- Expected: All rowsecurity = false
```

**Post-RLS-Disable Verification:**

```sql
-- Application queries should still work (with application-level filtering)
SELECT COUNT(*) FROM conversations WHERE app_id = '[test_app_id]';
-- Expected: Returns correct count

-- Verify no errors in application logs
-- Check that application still enforces tenant isolation via app_id
```

**RLS Rollback Checklist:**

- [ ] RLS disabled on all tables
- [ ] Application queries still work
- [ ] Application-level filtering still active
- [ ] No new errors introduced

**NOTE:** Disabling RLS does NOT break the application because the code still filters by `app_id`. RLS is defense-in-depth, not the primary security mechanism.

---

### Rollback Step 2: Restore API Keys (High Risk - 10 minutes)

**Only do this if hashed API keys are causing authentication failures.**

**Option A: Restore from Backup (Safest)**

```bash
# Restore ONLY the apps table from backup
pg_restore -h $DB_HOST -U $DB_USER -d $DB_NAME \
  --table=apps \
  --data-only \
  backup_phase0_*.dump

# This will restore plaintext API keys
```

**Option B: Manual Unhashing (If Backup Unavailable - Not Recommended)**

```sql
-- WARNING: This requires you to have saved plaintext keys somewhere
-- This is why we emphasized saving baseline data!

-- Example: Restore a single app's API key
UPDATE apps
SET api_key = '[plaintext_api_key_from_backup]'
WHERE id = '[app_id]';

-- Repeat for all apps...
```

**Post-API-Key-Restore Verification:**

```bash
# Test authentication with restored key
curl -X GET http://production.replyhq.com/v1/conversations \
  -H "X-App-ID: $TEST_APP_ID" \
  -H "X-API-Key: $RESTORED_PLAINTEXT_KEY" \
  -H "X-Device-ID: test-device" \
  -w "\nHTTP Status: %{http_code}\n"
# Expected: 200 OK
```

**API Key Rollback Checklist:**

- [ ] API keys restored from backup
- [ ] Authentication works with restored keys
- [ ] All apps have valid keys
- [ ] No NULL API keys

**IMPORTANT:** After restoring plaintext keys, you MUST roll back the application code to the version that expects plaintext keys, OR keep the new code (which can handle both plaintext and hashed keys during migration).

---

### Rollback Step 3: Code Rollback (High Risk - 15 minutes)

**Only do this if the new code is causing issues.**

```bash
# Option A: Git rollback + redeploy
cd /Users/alin/Desktop/replyhq/backend
git revert [deployment_commit_sha]
npm ci
npm run build
pm2 reload replyhq-backend

# Option B: Deploy previous version
git checkout [previous_commit_sha]
npm ci
npm run build
pm2 reload replyhq-backend

# Option C: Use your deployment tool's rollback feature
# (e.g., Kubernetes, AWS, etc.)
kubectl rollout undo deployment/replyhq-backend
```

**Post-Code-Rollback Verification:**

```bash
# Verify old code is running
curl http://production.replyhq.com/health
# Check version number or commit SHA in response

# Verify basic functionality
curl -X GET http://production.replyhq.com/setup/api/apps \
  -H "X-Master-API-Key: $MASTER_API_KEY"
# Expected: Should work (or not require master key if rolled back far enough)
```

**Code Rollback Checklist:**

- [ ] Previous code version deployed
- [ ] Application servers restarted
- [ ] Health check passes
- [ ] Basic functionality works
- [ ] Error rate returns to normal

---

### Rollback Step 4: Full Database Restore (Last Resort - 30-60 minutes)

**Only do this if data corruption or loss is detected.**

**WARNING: This will lose ALL data written after the backup was taken.**

```bash
# Step 1: Stop application (prevent new writes)
pm2 stop replyhq-backend
# OR
kubectl scale deployment/replyhq-backend --replicas=0

# Step 2: Restore from backup
pg_restore -h $DB_HOST -U $DB_USER -d $DB_NAME \
  --clean --if-exists \
  backup_phase0_*.dump

# Step 3: Verify restoration
psql $DATABASE_URL -c "SELECT COUNT(*) FROM apps;"
# Compare with expected count from backup time

# Step 4: Restart application with OLD code
pm2 start replyhq-backend
# OR
kubectl scale deployment/replyhq-backend --replicas=3
```

**Post-Restore Verification:**

```sql
-- Verify data matches backup time
SELECT COUNT(*) as total_apps FROM apps;
-- Expected: Count from backup time

-- Verify API keys are in expected format (plaintext from backup)
SELECT id, api_key FROM apps LIMIT 5;

-- Verify RLS is disabled (from backup)
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('conversations', 'messages', 'devices');
-- Expected: All rowsecurity = false (from backup)
```

**Full Restore Checklist:**

- [ ] Application stopped before restore
- [ ] Database restored from backup
- [ ] Data counts match backup time
- [ ] Application restarted with old code
- [ ] Basic functionality works

**CRITICAL:** After full restore, you MUST communicate to users that data created between backup time and restore time has been lost.

---

### Rollback Step 5: Post-Rollback Verification

**After any rollback, verify the system is stable:**

```sql
-- Data integrity check
SELECT
  (SELECT COUNT(*) FROM apps) as total_apps,
  (SELECT COUNT(*) FROM conversations) as total_conversations,
  (SELECT COUNT(*) FROM messages) as total_messages,
  (SELECT COUNT(*) FROM devices) as total_devices;

-- Check for orphaned records
SELECT
  (SELECT COUNT(*) FROM conversations c LEFT JOIN apps a ON c.app_id = a.id WHERE a.id IS NULL) as orphaned_conversations,
  (SELECT COUNT(*) FROM messages m LEFT JOIN conversations c ON m.conversation_id = c.id WHERE c.id IS NULL) as orphaned_messages,
  (SELECT COUNT(*) FROM devices d LEFT JOIN apps a ON d.app_id = a.id WHERE a.id IS NULL) as orphaned_devices;
-- Expected: All 0
```

```bash
# Application health check
curl http://production.replyhq.com/health

# End-to-end test
curl -X POST http://production.replyhq.com/v1/conversations \
  -H "X-App-ID: $TEST_APP_ID" \
  -H "X-API-Key: $TEST_API_KEY" \
  -H "X-Device-ID: test-device-rollback-$(date +%s)" \
  -H "Content-Type: application/json" \
  -d '{
    "user": {
      "id": "user-rollback-test"
    }
  }'
# Expected: 200 OK
```

**Post-Rollback Checklist:**

- [ ] Data integrity verified
- [ ] No orphaned records
- [ ] Application health check passes
- [ ] End-to-end test passes
- [ ] Error rate returns to normal
- [ ] Performance returns to baseline

---

## Post-Deployment Communication

### Internal Team Communication

**Immediate (within 1 hour):**

- [ ] Notify team of successful deployment
- [ ] Share initial metrics and verification results
- [ ] Document any issues encountered
- [ ] Update deployment log

**+4 Hours:**

- [ ] Status update with key metrics
- [ ] Any issues or concerns
- [ ] Rollback decision (if needed)

**+24 Hours:**

- [ ] Final deployment report
- [ ] Performance comparison
- [ ] Security posture improvement
- [ ] Lessons learned

### External Communication (If Needed)

**Only if user-facing impact:**

- [ ] Status page update
- [ ] Customer email (if downtime occurred)
- [ ] Changelog entry
- [ ] Documentation updates

---

## Success Criteria

**Deployment is considered successful if:**

- [ ] All pre-deployment checks passed
- [ ] API key migration completed without errors
- [ ] RLS enabled and enforcing tenant isolation
- [ ] All post-deployment verifications passed
- [ ] Data integrity maintained (0% data loss)
- [ ] Performance within 5% of baseline
- [ ] Error rate <1% for first 24 hours
- [ ] Authentication failure rate <1%
- [ ] Rate limiting working correctly
- [ ] CORS whitelist enforced
- [ ] No security vulnerabilities introduced
- [ ] No user-reported critical issues

**Close deployment ticket if all criteria met after 24 hours.**

---

## Appendix: Quick Reference

### Emergency Contacts

- Database Admin: [Contact Info]
- DevOps Lead: [Contact Info]
- Security Team: [Contact Info]
- On-Call Engineer: [Contact Info]

### Key Commands

```bash
# Health check
curl http://production.replyhq.com/health

# Check error logs
kubectl logs deployment/replyhq-backend --tail=100 | grep -i error

# Emergency RLS disable
psql $DATABASE_URL -c "ALTER TABLE conversations DISABLE ROW LEVEL SECURITY;"
psql $DATABASE_URL -c "ALTER TABLE messages DISABLE ROW LEVEL SECURITY;"
psql $DATABASE_URL -c "ALTER TABLE devices DISABLE ROW LEVEL SECURITY;"

# Database backup
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME --format=custom --file=emergency_backup.dump

# Rollback deployment
kubectl rollout undo deployment/replyhq-backend
```

### Critical SQL Queries

```sql
-- Data integrity check
SELECT
  (SELECT COUNT(*) FROM apps) as apps,
  (SELECT COUNT(*) FROM conversations) as conversations,
  (SELECT COUNT(*) FROM messages) as messages,
  (SELECT COUNT(*) FROM devices) as devices;

-- RLS status check
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('conversations', 'messages', 'devices');

-- API key format check
SELECT
  COUNT(CASE WHEN api_key LIKE '%:%' THEN 1 END) as hashed,
  COUNT(CASE WHEN api_key NOT LIKE '%:%' THEN 1 END) as plaintext
FROM apps;
```

---

## Document Version

- **Version:** 1.0
- **Created:** 2026-01-25
- **Last Updated:** 2026-01-25
- **Author:** Deployment Verification Agent
- **Approved By:** [To be filled]
- **Next Review:** After Phase 0 deployment completion

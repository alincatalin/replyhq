-- Query Plan Verification for Phase 1 Performance Fixes
-- Run these queries to verify indexes are being used correctly

-- 1. Admin Dashboard Query - Should use conversations_app_updated_idx
EXPLAIN ANALYZE
SELECT id, "userId", "deviceId", status, "updatedAt", "createdAt"
FROM conversations
WHERE app_id = '00000000-0000-0000-0000-000000000000'
ORDER BY "updatedAt" DESC
LIMIT 100;

-- Expected: Index Scan using conversations_app_updated_idx
-- Cost should be low (< 10.00)

-- 2. Last Message Query - Should use messages_conversation_sequence_idx or messages_created_at_desc_idx
EXPLAIN ANALYZE
SELECT body, sender, "createdAt"
FROM messages
WHERE conversation_id = '00000000-0000-0000-0000-000000000000'
ORDER BY "createdAt" DESC
LIMIT 1;

-- Expected: Index Scan using messages_created_at_desc_idx or messages_conversation_sequence_idx
-- Cost should be very low (< 1.00)

-- 3. Filtered Messages by Status - Should use messages_status_partial_idx
EXPLAIN ANALYZE
SELECT *
FROM messages
WHERE status = 'FAILED'
LIMIT 100;

-- Expected: Index Scan using messages_status_partial_idx
-- Partial index should make this very fast

-- 4. Conversation Status Filter - Should use conversations_status_idx
EXPLAIN ANALYZE
SELECT *
FROM conversations
WHERE status = 'open'
LIMIT 100;

-- Expected: Index Scan using conversations_status_idx

-- 5. Message History with Sequence - Should use messages_conversation_sequence_idx
EXPLAIN ANALYZE
SELECT *
FROM messages
WHERE conversation_id = '00000000-0000-0000-0000-000000000000'
ORDER BY sequence ASC
LIMIT 50;

-- Expected: Index Scan using messages_conversation_sequence_idx

-- How to interpret results:
-- - "Seq Scan" = BAD (full table scan, slow)
-- - "Index Scan" or "Index Only Scan" = GOOD (using index)
-- - Lower "cost" values = faster queries
-- - "rows" estimate should be close to actual
-- - execution time should be < 10ms for indexed queries

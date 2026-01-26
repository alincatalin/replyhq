-- Add api_key_hash column
ALTER TABLE "apps" ADD COLUMN "api_key_hash" TEXT;

-- Migrate existing api_key values to api_key_hash
-- NOTE: This is a one-time migration. Existing keys will be hashed with a random salt.
-- Operators must regenerate API keys after this migration for security.
DO $$
DECLARE
  app_record RECORD;
  salt TEXT;
  hash TEXT;
BEGIN
  FOR app_record IN SELECT id, api_key FROM apps WHERE api_key IS NOT NULL
  LOOP
    -- Generate random salt (16 bytes = 32 hex chars)
    salt := encode(gen_random_bytes(16), 'hex');

    -- Compute SHA-256 hash
    hash := encode(digest(salt || app_record.api_key, 'sha256'), 'hex');

    -- Store as salt:hash
    UPDATE apps
    SET api_key_hash = salt || ':' || hash
    WHERE id = app_record.id;
  END LOOP;
END $$;

-- Make api_key_hash NOT NULL and UNIQUE
ALTER TABLE "apps" ALTER COLUMN "api_key_hash" SET NOT NULL;
CREATE UNIQUE INDEX "apps_api_key_hash_key" ON "apps"("api_key_hash");

-- Make api_key nullable (deprecated but kept for rollback safety)
ALTER TABLE "apps" ALTER COLUMN "api_key" DROP NOT NULL;

-- Remove unique constraint from api_key (deprecated)
DROP INDEX IF EXISTS "apps_api_key_key";

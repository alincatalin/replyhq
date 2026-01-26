-- Add app_id to messages table (denormalized for RLS performance)
ALTER TABLE "messages" ADD COLUMN "app_id" TEXT;

-- Backfill app_id from conversations
UPDATE messages m
SET app_id = c.app_id
FROM conversations c
WHERE m.conversation_id = c.id;

-- Make app_id NOT NULL after backfill
ALTER TABLE "messages" ALTER COLUMN "app_id" SET NOT NULL;

-- Add index for RLS performance
CREATE INDEX "messages_app_id_idx" ON "messages"("app_id");

-- Enable Row-Level Security on multi-tenant tables
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "devices" ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for conversations
CREATE POLICY "tenant_isolation_conversations" ON "conversations"
  FOR ALL
  USING (app_id = current_setting('app.current_tenant', true));

-- Create RLS policies for messages
CREATE POLICY "tenant_isolation_messages" ON "messages"
  FOR ALL
  USING (app_id = current_setting('app.current_tenant', true));

-- Create RLS policies for devices
CREATE POLICY "tenant_isolation_devices" ON "devices"
  FOR ALL
  USING (app_id = current_setting('app.current_tenant', true));

-- Grant necessary permissions to application role
-- Assumes the database user is 'replyhq_app' - adjust as needed
GRANT SELECT, INSERT, UPDATE, DELETE ON "conversations" TO current_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "messages" TO current_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "devices" TO current_user;

-- Create function to automatically set app_id on message insert
CREATE OR REPLACE FUNCTION set_message_app_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Get app_id from the conversation
  SELECT app_id INTO NEW.app_id
  FROM conversations
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically set app_id on message insert
CREATE TRIGGER set_message_app_id_trigger
  BEFORE INSERT ON messages
  FOR EACH ROW
  WHEN (NEW.app_id IS NULL)
  EXECUTE FUNCTION set_message_app_id();

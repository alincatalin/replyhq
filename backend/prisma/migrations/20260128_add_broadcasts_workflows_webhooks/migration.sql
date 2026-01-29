-- Create enums
CREATE TYPE "TargetType" AS ENUM ('ALL_USERS', 'SEGMENT', 'SPECIFIC_USERS');
CREATE TYPE "BroadcastStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');
CREATE TYPE "RecipientStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'FAILED');
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');
CREATE TYPE "ExecutionStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "StepStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- Broadcasts
CREATE TABLE "broadcasts" (
  "id" TEXT PRIMARY KEY,
  "app_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "data" JSONB,
  "target_type" "TargetType" NOT NULL,
  "segment_query" JSONB,
  "user_ids" TEXT[] NOT NULL,
  "status" "BroadcastStatus" NOT NULL,
  "scheduled_at" TIMESTAMP(3),
  "sent_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "total_recipients" INTEGER NOT NULL DEFAULT 0,
  "total_sent" INTEGER NOT NULL DEFAULT 0,
  "total_delivered" INTEGER NOT NULL DEFAULT 0,
  "total_opened" INTEGER NOT NULL DEFAULT 0,
  "total_clicked" INTEGER NOT NULL DEFAULT 0,
  "error_message" TEXT,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "broadcast_recipients" (
  "id" TEXT PRIMARY KEY,
  "broadcast_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "status" "RecipientStatus" NOT NULL,
  "sent_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "opened_at" TIMESTAMP(3),
  "clicked_at" TIMESTAMP(3),
  "error_message" TEXT,
  "metadata" JSONB
);

-- Workflows
CREATE TABLE "workflows" (
  "id" TEXT PRIMARY KEY,
  "app_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "trigger" JSONB NOT NULL,
  "nodes" JSONB NOT NULL,
  "edges" JSONB NOT NULL,
  "status" "WorkflowStatus" NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "workflow_executions" (
  "id" TEXT PRIMARY KEY,
  "workflow_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "device_id" TEXT,
  "status" "ExecutionStatus" NOT NULL,
  "current_node_id" TEXT,
  "context" JSONB NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "error_message" TEXT
);

CREATE TABLE "workflow_steps" (
  "id" TEXT PRIMARY KEY,
  "execution_id" TEXT NOT NULL,
  "node_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "status" "StepStatus" NOT NULL,
  "input" JSONB NOT NULL,
  "output" JSONB,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "error_message" TEXT
);

-- Webhooks
CREATE TABLE "webhooks" (
  "id" TEXT PRIMARY KEY,
  "app_id" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "events" TEXT[] NOT NULL,
  "secret" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "webhook_deliveries" (
  "id" TEXT PRIMARY KEY,
  "webhook_id" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL,
  "http_status" INTEGER,
  "response_body" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "next_retry_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Foreign keys
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflows" ADD CONSTRAINT "workflows_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "workflow_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "broadcasts_app_id_status_idx" ON "broadcasts"("app_id", "status");
CREATE INDEX "broadcasts_app_id_scheduled_at_idx" ON "broadcasts"("app_id", "scheduled_at");
CREATE UNIQUE INDEX "broadcast_recipients_broadcast_id_device_id_key" ON "broadcast_recipients"("broadcast_id", "device_id");
CREATE INDEX "broadcast_recipients_broadcast_id_status_idx" ON "broadcast_recipients"("broadcast_id", "status");
CREATE INDEX "broadcast_recipients_user_id_idx" ON "broadcast_recipients"("user_id");

CREATE INDEX "workflows_app_id_status_idx" ON "workflows"("app_id", "status");
CREATE INDEX "workflows_app_id_trigger_idx" ON "workflows"("app_id", "trigger");
CREATE INDEX "workflow_executions_workflow_id_status_idx" ON "workflow_executions"("workflow_id", "status");
CREATE INDEX "workflow_executions_user_id_status_idx" ON "workflow_executions"("user_id", "status");
CREATE INDEX "workflow_executions_workflow_id_started_at_idx" ON "workflow_executions"("workflow_id", "started_at");
CREATE INDEX "workflow_steps_execution_id_idx" ON "workflow_steps"("execution_id");
CREATE INDEX "workflow_steps_node_id_status_idx" ON "workflow_steps"("node_id", "status");

CREATE INDEX "webhooks_app_id_idx" ON "webhooks"("app_id");
CREATE INDEX "webhook_deliveries_webhook_id_status_idx" ON "webhook_deliveries"("webhook_id", "status");

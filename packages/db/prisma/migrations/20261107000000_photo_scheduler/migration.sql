-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('photo', 'seo_post');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('scheduled', 'publishing', 'published', 'failed', 'dead', 'skipped', 'needs_images');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "ai_rename_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "photo_schedules" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "weekdays" INTEGER[],
    "local_time" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "count_per_day" INTEGER NOT NULL,
    "default_category" TEXT NOT NULL DEFAULT 'ADDITIONAL',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "photo_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_jobs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "type" "JobType" NOT NULL,
    "schedule_id" UUID,
    "schedule_version" INTEGER NOT NULL DEFAULT 1,
    "run_at" TIMESTAMP(3) NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'scheduled',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "category" TEXT,
    "image_id" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "manually_edited" BOOLEAN NOT NULL DEFAULT false,
    "idempotency_key" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publish_logs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "original_name" TEXT,
    "new_name" TEXT,
    "gbp_resource_name" TEXT,
    "error" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publish_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "openai_settings" (
    "workspace_id" UUID NOT NULL,
    "api_key_enc" TEXT NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "key_last4" TEXT NOT NULL,
    "vision_model" TEXT NOT NULL,
    "input_price_per_m" DOUBLE PRECISION NOT NULL,
    "output_price_per_m" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "openai_settings_pkey" PRIMARY KEY ("workspace_id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "est_cost" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "photo_schedules_client_id_key" ON "photo_schedules"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "photo_schedules_workspace_id_client_id_key" ON "photo_schedules"("workspace_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_jobs_idempotency_key_key" ON "scheduled_jobs"("idempotency_key");

-- CreateIndex
CREATE INDEX "scheduled_jobs_client_id_run_at_idx" ON "scheduled_jobs"("client_id", "run_at");

-- CreateIndex
CREATE INDEX "scheduled_jobs_status_run_at_idx" ON "scheduled_jobs"("status", "run_at");

-- CreateIndex
CREATE INDEX "publish_logs_client_id_created_at_idx" ON "publish_logs"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "publish_logs_job_id_idx" ON "publish_logs"("job_id");

-- CreateIndex
CREATE INDEX "ai_usage_workspace_id_client_id_created_at_idx" ON "ai_usage"("workspace_id", "client_id", "created_at");

-- AddForeignKey
ALTER TABLE "photo_schedules" ADD CONSTRAINT "photo_schedules_workspace_id_client_id_fkey" FOREIGN KEY ("workspace_id", "client_id") REFERENCES "clients"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_jobs" ADD CONSTRAINT "scheduled_jobs_workspace_id_client_id_fkey" FOREIGN KEY ("workspace_id", "client_id") REFERENCES "clients"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_jobs" ADD CONSTRAINT "scheduled_jobs_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "library_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_logs" ADD CONSTRAINT "publish_logs_workspace_id_client_id_fkey" FOREIGN KEY ("workspace_id", "client_id") REFERENCES "clients"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_logs" ADD CONSTRAINT "publish_logs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "scheduled_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "openai_settings" ADD CONSTRAINT "openai_settings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_workspace_id_client_id_fkey" FOREIGN KEY ("workspace_id", "client_id") REFERENCES "clients"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;


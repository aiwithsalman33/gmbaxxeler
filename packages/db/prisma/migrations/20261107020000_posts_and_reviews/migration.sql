-- CreateEnum
CREATE TYPE "SeoMode" AS ENUM ('auto', 'draft');

-- CreateEnum
CREATE TYPE "ReviewReplyState" AS ENUM ('unreplied', 'draft', 'replied');

-- CreateEnum
CREATE TYPE "ReplyStatus" AS ENUM ('draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "ReplySource" AS ENUM ('manual', 'ai');

-- CreateEnum
CREATE TYPE "ReplyMode" AS ENUM ('draft_only', 'auto_4_5', 'full_auto');

-- AlterEnum
ALTER TYPE "JobStatus" ADD VALUE 'awaiting_approval';

-- AlterTable
ALTER TABLE "client_profiles" ADD COLUMN     "competitors" TEXT[],
ADD COLUMN     "cta_type" TEXT NOT NULL DEFAULT 'LEARN_MORE',
ADD COLUMN     "cta_url" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "donts" TEXT[],
ADD COLUMN     "dos" TEXT[],
ADD COLUMN     "draft_lead_hours" INTEGER NOT NULL DEFAULT 48,
ADD COLUMN     "keywords" TEXT[],
ADD COLUMN     "onboarded_at" TIMESTAMP(3),
ADD COLUMN     "seo_mode" "SeoMode" NOT NULL DEFAULT 'draft',
ADD COLUMN     "services" TEXT[],
ADD COLUMN     "strategy" TEXT,
ADD COLUMN     "target_areas" TEXT[],
ADD COLUMN     "tone" TEXT,
ADD COLUMN     "usps" TEXT[];

-- CreateTable
CREATE TABLE "seo_schedules" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "weekdays" INTEGER[],
    "local_time" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "count_per_day" INTEGER NOT NULL,
    "default_post_type" TEXT NOT NULL DEFAULT 'standard',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "post_type" TEXT NOT NULL DEFAULT 'standard',
    "summary" TEXT NOT NULL,
    "cta_type" TEXT NOT NULL DEFAULT 'LEARN_MORE',
    "cta_url" TEXT,
    "event_offer" JSONB,
    "ai_generated" BOOLEAN NOT NULL DEFAULT true,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "gbp_post_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "gbp_review_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" TEXT,
    "reviewer_name" TEXT NOT NULL,
    "reviewed_at" TIMESTAMP(3) NOT NULL,
    "reply_state" "ReviewReplyState" NOT NULL DEFAULT 'unreplied',
    "reply_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_replies" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "status" "ReplyStatus" NOT NULL DEFAULT 'draft',
    "source" "ReplySource" NOT NULL DEFAULT 'ai',
    "publish_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "approved_by_id" UUID,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_settings" (
    "client_id" UUID NOT NULL,
    "auto_reply_enabled" BOOLEAN NOT NULL DEFAULT false,
    "reply_brain" TEXT,
    "mode" "ReplyMode" NOT NULL DEFAULT 'draft_only',
    "delay_min_s" INTEGER NOT NULL DEFAULT 300,
    "delay_max_s" INTEGER NOT NULL DEFAULT 3600,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_settings_pkey" PRIMARY KEY ("client_id")
);

-- CreateTable
CREATE TABLE "notification_settings" (
    "workspace_id" UUID NOT NULL,
    "emails" TEXT[],
    "webhook_url" TEXT,
    "webhook_kind" TEXT NOT NULL DEFAULT 'generic',
    "webhook_chat_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("workspace_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seo_schedules_client_id_key" ON "seo_schedules"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "seo_schedules_workspace_id_client_id_key" ON "seo_schedules"("workspace_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "posts_job_id_key" ON "posts"("job_id");

-- CreateIndex
CREATE INDEX "posts_client_id_created_at_idx" ON "posts"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "reviews_client_id_reviewed_at_idx" ON "reviews"("client_id", "reviewed_at");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_client_id_gbp_review_id_key" ON "reviews"("client_id", "gbp_review_id");

-- CreateIndex
CREATE INDEX "review_replies_status_publish_at_idx" ON "review_replies"("status", "publish_at");

-- CreateIndex
CREATE INDEX "review_replies_review_id_idx" ON "review_replies"("review_id");

-- AddForeignKey
ALTER TABLE "seo_schedules" ADD CONSTRAINT "seo_schedules_workspace_id_client_id_fkey" FOREIGN KEY ("workspace_id", "client_id") REFERENCES "clients"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_workspace_id_client_id_fkey" FOREIGN KEY ("workspace_id", "client_id") REFERENCES "clients"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "scheduled_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_workspace_id_client_id_fkey" FOREIGN KEY ("workspace_id", "client_id") REFERENCES "clients"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_replies" ADD CONSTRAINT "review_replies_workspace_id_client_id_fkey" FOREIGN KEY ("workspace_id", "client_id") REFERENCES "clients"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_replies" ADD CONSTRAINT "review_replies_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_settings" ADD CONSTRAINT "review_settings_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;


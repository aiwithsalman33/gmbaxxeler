-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('owner', 'member');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('active', 'revoked', 'error');

-- CreateEnum
CREATE TYPE "ConnectionSource" AS ENUM ('agency', 'invite');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('invited', 'waiting_for_access', 'connected', 'reconnect_required', 'access_removed', 'paused', 'removed');

-- CreateEnum
CREATE TYPE "MatchMethod" AS ENUM ('auto_name', 'auto_address', 'auto_phone', 'manual', 'import', 'oauth');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'needs_review', 'accepted', 'declined');

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('day_2', 'day_5');

-- CreateEnum
CREATE TYPE "FolderKind" AS ENUM ('photos', 'seo_images');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('info', 'warning', 'critical');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" UUID NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "code_hash" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMP(3),
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_connections" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "google_account_email" TEXT NOT NULL,
    "google_subject" TEXT NOT NULL,
    "refresh_token_enc" TEXT NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "scopes" TEXT[],
    "status" "ConnectionStatus" NOT NULL DEFAULT 'active',
    "source" "ConnectionSource" NOT NULL DEFAULT 'agency',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_invites" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "client_id" UUID,
    "token_hash" TEXT NOT NULL,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "connection_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "connection_id" UUID,
    "gbp_account_id" TEXT,
    "gbp_location_id" TEXT,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" "ClientStatus" NOT NULL DEFAULT 'invited',
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "match_method" "MatchMethod",
    "invited_at" TIMESTAMP(3),
    "guide_sent_at" TIMESTAMP(3),
    "connected_at" TIMESTAMP(3),
    "access_lost_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_profiles" (
    "client_id" UUID NOT NULL,
    "gbp_snapshot" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_profiles_pkey" PRIMARY KEY ("client_id")
);

-- CreateTable
CREATE TABLE "gbp_invitations" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "invitation_name" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "location_name" TEXT,
    "address" TEXT,
    "place_id" TEXT,
    "status" "InvitationStatus" NOT NULL DEFAULT 'pending',
    "matched_client_id" UUID,
    "match_score" DOUBLE PRECISION,
    "match_reason" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gbp_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_reminders" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "channel" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_folders" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "kind" "FolderKind" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_images" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "folder_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "public_url" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "seo_name" TEXT,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "tags" TEXT[],
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_snapshots" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "metric" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_stats" (
    "client_id" UUID NOT NULL,
    "rating" DOUBLE PRECISION,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "photo_count" INTEGER NOT NULL DEFAULT 0,
    "last_post_at" TIMESTAMP(3),
    "strength_score" INTEGER NOT NULL DEFAULT 0,
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_stats_pkey" PRIMARY KEY ("client_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "client_id" UUID,
    "user_id" UUID,
    "type" TEXT NOT NULL,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "client_id" UUID,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mock_gbp_state" (
    "workspace_id" UUID NOT NULL,
    "state" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mock_gbp_state_pkey" PRIMARY KEY ("workspace_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_e164_key" ON "users"("phone_e164");

-- CreateIndex
CREATE INDEX "otp_challenges_phone_e164_created_at_idx" ON "otp_challenges"("phone_e164", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspace_id_user_id_key" ON "workspace_members"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "google_connections_workspace_id_idx" ON "google_connections"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "google_connections_workspace_id_google_subject_key" ON "google_connections"("workspace_id", "google_subject");

-- CreateIndex
CREATE UNIQUE INDEX "client_invites_token_hash_key" ON "client_invites"("token_hash");

-- CreateIndex
CREATE INDEX "client_invites_workspace_id_idx" ON "client_invites"("workspace_id");

-- CreateIndex
CREATE INDEX "clients_workspace_id_status_idx" ON "clients"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "clients_workspace_id_id_key" ON "clients"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "clients_workspace_id_gbp_location_id_key" ON "clients"("workspace_id", "gbp_location_id");

-- CreateIndex
CREATE INDEX "gbp_invitations_workspace_id_status_idx" ON "gbp_invitations"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gbp_invitations_workspace_id_invitation_name_key" ON "gbp_invitations"("workspace_id", "invitation_name");

-- CreateIndex
CREATE UNIQUE INDEX "client_reminders_client_id_kind_key" ON "client_reminders"("client_id", "kind");

-- CreateIndex
CREATE INDEX "library_folders_workspace_id_client_id_idx" ON "library_folders"("workspace_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "library_folders_client_id_kind_key" ON "library_folders"("client_id", "kind");

-- CreateIndex
CREATE INDEX "library_images_client_id_folder_id_last_used_at_idx" ON "library_images"("client_id", "folder_id", "last_used_at");

-- CreateIndex
CREATE INDEX "metric_snapshots_workspace_id_client_id_date_idx" ON "metric_snapshots"("workspace_id", "client_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "metric_snapshots_client_id_date_metric_key" ON "metric_snapshots"("client_id", "date", "metric");

-- CreateIndex
CREATE INDEX "notifications_workspace_id_read_at_created_at_idx" ON "notifications"("workspace_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_workspace_id_created_at_idx" ON "audit_logs"("workspace_id", "created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_invites" ADD CONSTRAINT "client_invites_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "google_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gbp_invitations" ADD CONSTRAINT "gbp_invitations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gbp_invitations" ADD CONSTRAINT "gbp_invitations_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "google_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gbp_invitations" ADD CONSTRAINT "gbp_invitations_matched_client_id_fkey" FOREIGN KEY ("matched_client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_reminders" ADD CONSTRAINT "client_reminders_workspace_id_client_id_fkey" FOREIGN KEY ("workspace_id", "client_id") REFERENCES "clients"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_folders" ADD CONSTRAINT "library_folders_workspace_id_client_id_fkey" FOREIGN KEY ("workspace_id", "client_id") REFERENCES "clients"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_images" ADD CONSTRAINT "library_images_workspace_id_client_id_fkey" FOREIGN KEY ("workspace_id", "client_id") REFERENCES "clients"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_images" ADD CONSTRAINT "library_images_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "library_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_workspace_id_client_id_fkey" FOREIGN KEY ("workspace_id", "client_id") REFERENCES "clients"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_stats" ADD CONSTRAINT "location_stats_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One active agency account per workspace.
CREATE UNIQUE INDEX "google_connections_one_active_agency"
  ON "google_connections" ("workspace_id")
  WHERE "source" = 'agency' AND "status" = 'active';

-- A client still waiting for access must be reachable.
ALTER TABLE "clients" ADD CONSTRAINT "clients_pending_has_contact"
  CHECK ("status" NOT IN ('invited', 'waiting_for_access') OR "contact_phone" IS NOT NULL OR "contact_email" IS NOT NULL);

CREATE EXTENSION IF NOT EXISTS citext;

-- Old mobile accounts have no real inbox, so they can't reset a password. Their test data goes too.
DELETE FROM "workspaces" WHERE "owner_id" IN (SELECT "id" FROM "users" WHERE "email" LIKE '%@localpilot.invalid');
DELETE FROM "users" WHERE "email" LIKE '%@localpilot.invalid';

-- CreateEnum
CREATE TYPE "AuthTokenKind" AS ENUM ('verify_email', 'reset_password');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('queued', 'sent', 'failed', 'capped');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "invite_email_sent_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified_at" TIMESTAMP(3),
ADD COLUMN     "failed_login_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_until" TIMESTAMP(3),
ADD COLUMN     "password_hash" TEXT,
ADD COLUMN     "phone" TEXT,
ALTER COLUMN "email" SET DATA TYPE CITEXT;

-- DropTable
DROP TABLE "otp_challenges";

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "AuthTokenKind" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_invites" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'member',
    "token_hash" TEXT NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_log" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "client_id" UUID,
    "to" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'queued',
    "transactional" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_tokens_user_id_kind_idx" ON "auth_tokens"("user_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "team_invites_token_hash_key" ON "team_invites"("token_hash");

-- CreateIndex
CREATE INDEX "team_invites_workspace_id_idx" ON "team_invites"("workspace_id");

-- CreateIndex
CREATE INDEX "email_log_workspace_id_created_at_idx" ON "email_log"("workspace_id", "created_at");

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;


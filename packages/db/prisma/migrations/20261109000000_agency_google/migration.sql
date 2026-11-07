-- CreateEnum
CREATE TYPE "OAuthPurpose" AS ENUM ('login', 'agency', 'invite');

-- AlterEnum
ALTER TYPE "ConnectionStatus" ADD VALUE 'disconnected';

-- AlterTable
ALTER TABLE "gbp_invitations" ADD COLUMN     "suggested_client_id" UUID;

-- AlterTable
ALTER TABLE "google_connections" ADD COLUMN     "access_token_enc" TEXT,
ADD COLUMN     "access_token_expires_at" TIMESTAMP(3),
ADD COLUMN     "accounts_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "google_name" TEXT,
ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "last_synced_at" TIMESTAMP(3),
ADD COLUMN     "locations_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mismatch_confirmed_at" TIMESTAMP(3),
ALTER COLUMN "refresh_token_enc" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "google_subject" TEXT;

-- CreateTable
CREATE TABLE "app_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "google_client_id" TEXT,
    "google_client_secret_enc" TEXT,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "credentials_status" TEXT NOT NULL DEFAULT 'unknown',
    "tested_at" TIMESTAMP(3),
    "api_access" TEXT NOT NULL DEFAULT 'unknown',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_states" (
    "id" UUID NOT NULL,
    "state_hash" TEXT NOT NULL,
    "purpose" "OAuthPurpose" NOT NULL,
    "workspace_id" UUID,
    "user_id" UUID,
    "invite_id" UUID,
    "code_verifier_enc" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_states_state_hash_key" ON "oauth_states"("state_hash");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_subject_key" ON "users"("google_subject");


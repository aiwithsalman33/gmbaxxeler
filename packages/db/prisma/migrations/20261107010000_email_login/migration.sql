-- Old mobile logins carry no email. They stay as placeholders and cannot log in.
DELETE FROM "otp_challenges";
UPDATE "users" SET "email" = 'legacy-' || "id" || '@localpilot.invalid' WHERE "email" IS NULL;

-- DropIndex
DROP INDEX "otp_challenges_phone_e164_created_at_idx";

-- DropIndex
DROP INDEX "users_phone_e164_key";

-- AlterTable
ALTER TABLE "otp_challenges" DROP COLUMN "phone_e164",
ADD COLUMN     "email" TEXT NOT NULL,
ALTER COLUMN "code_hash" SET NOT NULL;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "phone_e164",
ALTER COLUMN "email" SET NOT NULL;

-- CreateIndex
CREATE INDEX "otp_challenges_email_created_at_idx" ON "otp_challenges"("email", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");


import { hashPassword } from "@localpilot/crypto";
import type { AppContext } from "./context";

/** Creates the first owner from env. It never changes an account that already exists, so it is safe on every start. */
export async function seedAdmin(ctx: AppContext): Promise<string> {
  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = ctx.env;
  if (!SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD) return "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are not set, so no owner account was added";
  const email = SEED_ADMIN_EMAIL.trim().toLowerCase();
  if (await ctx.db.user.findUnique({ where: { email }, select: { id: true } })) return "Owner account already exists";

  const passwordHash = await hashPassword(SEED_ADMIN_PASSWORD);
  await ctx.db.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, passwordHash, emailVerifiedAt: new Date() } });
    const workspace = await tx.workspace.create({ data: { name: "My Agency", ownerId: user.id } });
    await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: "owner" } });
  });
  return "Owner account created";
}

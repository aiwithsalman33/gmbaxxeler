import { decryptSecret, encryptSecret } from "@localpilot/crypto";
import { renderEmail, type EmailData, type EmailTemplate } from "@localpilot/notify";
import type { Deps } from "./context";

export const MAIL_QUEUE = "send-email";

/** The payload holds reset and invite links, so it is encrypted in the queue table. */
export interface MailJob {
  logId: string;
  payload: string;
}

export interface MailRequest {
  template: EmailTemplate;
  to: string;
  data?: EmailData;
  workspaceId?: string;
  clientId?: string;
  /** Account mail skips the daily cap, so hitting it can't lock anyone out. */
  transactional?: boolean;
}

function startOfDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Returns false when the workspace has reached its daily cap. */
export async function queueEmail(deps: Deps, request: MailRequest, now = new Date()): Promise<boolean> {
  const { template, to, workspaceId, clientId } = request;
  if (workspaceId && !request.transactional) {
    const sentToday = await deps.db.emailLog.count({
      where: { workspaceId, status: { in: ["queued", "sent"] }, transactional: false, createdAt: { gte: startOfDay(now) } },
    });
    if (sentToday >= deps.mailDailyCap) {
      await deps.db.emailLog.create({ data: { workspaceId, clientId, to, template, status: "capped", error: "Daily cap reached" } });
      deps.logger.warn({ workspaceId, template, cap: deps.mailDailyCap }, "daily email cap reached");
      return false;
    }
  }
  const log = await deps.db.emailLog.create({
    data: { workspaceId, clientId, to, template, status: "queued", transactional: request.transactional ?? false },
  });
  const payload = encryptSecret(JSON.stringify({ template, to, data: request.data ?? {} }), deps.encryptionKey);
  await deps.enqueueMail({ logId: log.id, payload });
  return true;
}

/** Throwing hands the job back to pg-boss, which retries with backoff. */
export async function deliverEmail(deps: Deps, job: MailJob): Promise<void> {
  const log = await deps.db.emailLog.findUnique({ where: { id: job.logId } });
  if (!log || log.status === "sent") return;
  const { template, to, data } = JSON.parse(decryptSecret(job.payload, deps.encryptionKey)) as { template: EmailTemplate; to: string; data: EmailData };
  try {
    await deps.mailProvider.send({ to, ...renderEmail(template, data) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await deps.db.emailLog.update({ where: { id: log.id }, data: { status: "failed", error: message.slice(0, 500) } });
    throw error;
  }
  await deps.db.emailLog.update({ where: { id: log.id }, data: { status: "sent", error: null, sentAt: new Date() } });
}

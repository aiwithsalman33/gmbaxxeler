import type { Notification } from "@localpilot/db";
import type { EmailTemplate } from "@localpilot/notify";
import type { Deps } from "./context";
import { queueEmail } from "./mail";

export const EMAILED_INFO_TYPES = new Set(["seo.draft_ready", "client.connected"]);

function templateFor(type: string): { template: EmailTemplate; path: string } {
  if (type === "review.negative") return { template: "negative_review", path: "/" };
  if (type === "seo.draft_ready") return { template: "draft_awaiting_approval", path: "/" };
  if (type === "client.connected") return { template: "client_connected", path: "/clients" };
  if (type === "google.reconnect_required") return { template: "google_reconnect", path: "/settings/google" };
  return { template: "failed_job", path: "/admin/failed-jobs" };
}

async function recipients(deps: Deps, workspaceId: string, configured: string[]): Promise<string[]> {
  if (configured.length) return configured;
  const workspace = await deps.db.workspace.findUnique({ where: { id: workspaceId }, select: { owner: { select: { email: true } } } });
  return workspace ? [workspace.owner.email] : [];
}

/** Alerts leave the app by email and webhook. A failure here never breaks the job that raised it. */
export async function deliverAlert(
  deps: Deps,
  notification: Pick<Notification, "workspaceId" | "clientId" | "type" | "title" | "body">,
): Promise<void> {
  const settings = await deps.db.notificationSettings.findUnique({ where: { workspaceId: notification.workspaceId } });
  const failed = (channel: string) => (error: unknown) =>
    deps.logger.error({ channel, err: error instanceof Error ? error.message : "unknown" }, "alert delivery failed");

  const { template, path } = templateFor(notification.type);
  for (const to of await recipients(deps, notification.workspaceId, settings?.emails ?? [])) {
    await queueEmail(deps, {
      template,
      to,
      workspaceId: notification.workspaceId,
      clientId: notification.clientId ?? undefined,
      data: { title: notification.title, body: notification.body, link: `${deps.appUrl}${path}` },
    }).catch(failed("email"));
  }
  if (settings?.webhookUrl) {
    await postWebhook(settings, `${notification.title}\n${notification.body}`).catch(failed("webhook"));
  }
}

export async function postWebhook(settings: { webhookUrl: string | null; webhookKind: string; webhookChatId: string | null }, text: string): Promise<void> {
  if (!settings.webhookUrl) return;
  const body = settings.webhookKind === "telegram" ? { chat_id: settings.webhookChatId, text } : { text };
  const response = await fetch(settings.webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
}

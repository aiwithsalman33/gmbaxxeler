import { dueReminder, type ReminderKindName } from "@localpilot/core";
import type { Client } from "@localpilot/db";
import type { ChannelName } from "@localpilot/notify";
import { agencyConnection, notify, PENDING_STATUSES, type Deps } from "./context";
import { guideMessage } from "./guide";
import { queueEmail } from "./mail";

type Route = { channel: "email"; to: string } | { channel: ChannelName; to: string };

function reminderRoute(deps: Deps, client: Client): Route | null {
  if (client.contactEmail) return { channel: "email", to: client.contactEmail };
  const available = deps.messenger.available();
  if (client.contactPhone && available.includes("whatsapp")) return { channel: "whatsapp", to: client.contactPhone };
  if (client.contactPhone && available.includes("sms")) return { channel: "sms", to: client.contactPhone };
  return null;
}

async function sendReminder(deps: Deps, client: Client, kind: ReminderKindName): Promise<void> {
  const connection = await agencyConnection(deps, client.workspaceId);
  const agencyEmail = connection?.googleAccountEmail ?? null;
  const route = reminderRoute(deps, client);

  // The unique (client_id, kind) row is claimed first, so overlapping runs can't double-send.
  const claimed = await deps.db.clientReminder.createMany({
    data: { workspaceId: client.workspaceId, clientId: client.id, kind, channel: route?.channel ?? "manual" },
    skipDuplicates: true,
  });
  if (claimed.count === 0) return;

  const days = kind === "day_2" ? 2 : 5;
  if (route?.channel === "email") {
    await queueEmail(deps, {
      template: "client_reminder",
      to: route.to,
      workspaceId: client.workspaceId,
      clientId: client.id,
      data: { businessName: client.name, agencyEmail: agencyEmail ?? "" },
    });
  } else if (route) {
    await deps.messenger.send(route.channel, { to: route.to, ...guideMessage({ businessName: client.name, agencyEmail, reminder: true }) });
  }
  if (route) {
    await notify(deps, {
      workspaceId: client.workspaceId,
      clientId: client.id,
      type: "client.reminder_sent",
      title: `Day ${days} reminder sent to ${client.name}`,
      body: `Sent by ${route.channel}.`,
    });
    return;
  }
  await notify(deps, {
    workspaceId: client.workspaceId,
    clientId: client.id,
    type: "client.reminder_manual",
    severity: "warning",
    title: `Follow up with ${client.name}`,
    body: `Still waiting for access after ${days} days. No delivery channel is set up, so send the guide yourself.`,
  });
}

export async function sendDueReminders(deps: Deps, now = new Date()): Promise<number> {
  const clients = await deps.db.client.findMany({
    where: { status: { in: [...PENDING_STATUSES] } },
    include: { reminders: { select: { kind: true } } },
  });
  let sent = 0;
  for (const { reminders, ...client } of clients) {
    const startedAt = client.guideSentAt ?? client.invitedAt ?? client.createdAt;
    const kind = dueReminder(startedAt, reminders.map((r) => r.kind), now);
    if (!kind) continue;
    try {
      await sendReminder(deps, client, kind);
      sent++;
    } catch (error) {
      deps.logger.error({ clientId: client.id, err: error instanceof Error ? error.message : "unknown" }, "reminder failed");
    }
  }
  return sent;
}

import { decryptSecret } from "@localpilot/crypto";
import type { Db, GoogleConnection, NotificationSeverity } from "@localpilot/db";
import type { GbpAdapter, GbpSession } from "@localpilot/gbp";
import type { MailProvider, Messenger } from "@localpilot/notify";
import type { Storage } from "@localpilot/storage";
import { deliverAlert, EMAILED_INFO_TYPES } from "./alerts";
import type { MailJob } from "./mail";

export interface Logger {
  info(meta: object, message?: string): void;
  warn(meta: object, message?: string): void;
  error(meta: object, message?: string): void;
}

export interface Deps {
  db: Db;
  gbp: GbpAdapter;
  messenger: Messenger;
  encryptionKey: Buffer;
  logger: Logger;
  storage: Storage;
  aiAdapter: "mock" | "openai";
  mailProvider: MailProvider;
  enqueueMail: (job: MailJob) => Promise<void>;
  mailDailyCap: number;
  appUrl: string;
}

export const PENDING_STATUSES = ["invited", "waiting_for_access"] as const;

export function sessionFor(deps: Deps, connection: GoogleConnection): GbpSession {
  return deps.gbp.session({
    workspaceId: connection.workspaceId,
    refreshToken: decryptSecret(connection.refreshTokenEnc, deps.encryptionKey),
  });
}

export function agencyConnection(deps: Deps, workspaceId: string): Promise<GoogleConnection | null> {
  return deps.db.googleConnection.findFirst({ where: { workspaceId, source: "agency", status: "active" } });
}

export async function notify(
  deps: Deps,
  input: { workspaceId: string; clientId?: string; type: string; severity?: NotificationSeverity; title: string; body: string },
): Promise<void> {
  const notification = await deps.db.notification.create({ data: input });
  if (notification.severity === "critical" || EMAILED_INFO_TYPES.has(notification.type)) await deliverAlert(deps, notification);
}

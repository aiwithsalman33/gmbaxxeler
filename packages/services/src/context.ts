import type { Db, GoogleConnection, NotificationSeverity } from "@localpilot/db";
import type { GbpAdapter, GbpSession } from "@localpilot/gbp";
import type { GoogleCredentials } from "@localpilot/gbp";
import type { MailProvider, Messenger } from "@localpilot/notify";
import type { Storage } from "@localpilot/storage";
import { deliverAlert, EMAILED_INFO_TYPES } from "./alerts";
import { connectionTokens } from "./connections";
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
  enqueueConnect: (clientId: string) => Promise<void>;
  googleEnv: Partial<GoogleCredentials>;
  googleHttp: typeof fetch;
  agencyEmail: string | null;
  /** Import every business the agency account manages as a client, without picking each. */
  autoImport: boolean;
}

export const PENDING_STATUSES = ["invited", "waiting_for_access"] as const;

export function sessionFor(deps: Deps, connection: GoogleConnection): GbpSession {
  return deps.gbp.session({ workspaceId: connection.workspaceId, tokens: connectionTokens(deps, connection) });
}

/** Unexpected accounts stay inactive until someone confirms them. */
export async function agencyConnection(deps: Deps, workspaceId: string): Promise<GoogleConnection | null> {
  const connection = await deps.db.googleConnection.findFirst({ where: { workspaceId, source: "agency", status: "active" } });
  return connection && !needsConfirmation(deps, connection) ? connection : null;
}

export function needsConfirmation(deps: Deps, connection: Pick<GoogleConnection, "googleAccountEmail" | "mismatchConfirmedAt">): boolean {
  return Boolean(deps.agencyEmail && connection.googleAccountEmail.toLowerCase() !== deps.agencyEmail && !connection.mismatchConfirmedAt);
}

export async function notify(
  deps: Deps,
  input: { workspaceId: string; clientId?: string; type: string; severity?: NotificationSeverity; title: string; body: string },
): Promise<void> {
  const notification = await deps.db.notification.create({ data: input });
  if (notification.severity === "critical" || EMAILED_INFO_TYPES.has(notification.type)) await deliverAlert(deps, notification);
}

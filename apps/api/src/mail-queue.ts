import { MAIL_QUEUE, type MailJob } from "@localpilot/services";
import PgBoss from "pg-boss";

const RETRIES = { retryLimit: 3, retryBackoff: true, retryDelay: 30 };

export const CONNECT_QUEUE = "connect-client";

/** The API only adds work to these queues. The worker does it. */
export class MailQueue {
  private readonly boss: PgBoss;
  private started: Promise<unknown> | null = null;

  constructor(connectionString: string) {
    this.boss = new PgBoss({ connectionString, schema: "pgboss", supervise: false, schedule: false });
    this.boss.on("error", () => undefined);
  }

  private start(): Promise<unknown> {
    this.started ??= this.boss.start().then(async () => {
      await this.boss.createQueue(MAIL_QUEUE, { name: MAIL_QUEUE, ...RETRIES });
      await this.boss.createQueue(CONNECT_QUEUE, { name: CONNECT_QUEUE, ...RETRIES });
    });
    return this.started;
  }

  async send(job: MailJob): Promise<void> {
    await this.start();
    await this.boss.send(MAIL_QUEUE, job, RETRIES);
  }

  async sendConnect(clientId: string): Promise<void> {
    await this.start();
    await this.boss.send(CONNECT_QUEUE, { clientId }, RETRIES);
  }

  async stop(): Promise<void> {
    if (this.started) await this.boss.stop({ graceful: false });
  }
}

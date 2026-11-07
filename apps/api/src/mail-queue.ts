import { MAIL_QUEUE, type MailJob } from "@localpilot/services";
import PgBoss from "pg-boss";

const RETRIES = { retryLimit: 3, retryBackoff: true, retryDelay: 30 };

/** The API only adds mail to the queue. The worker sends it. */
export class MailQueue {
  private readonly boss: PgBoss;
  private started: Promise<unknown> | null = null;

  constructor(connectionString: string) {
    this.boss = new PgBoss({ connectionString, schema: "pgboss", supervise: false, schedule: false });
    this.boss.on("error", () => undefined);
  }

  private start(): Promise<unknown> {
    this.started ??= this.boss.start().then(() => this.boss.createQueue(MAIL_QUEUE, { name: MAIL_QUEUE, ...RETRIES }));
    return this.started;
  }

  async send(job: MailJob): Promise<void> {
    await this.start();
    await this.boss.send(MAIL_QUEUE, job, RETRIES);
  }

  async stop(): Promise<void> {
    if (this.started) await this.boss.stop({ graceful: false });
  }
}

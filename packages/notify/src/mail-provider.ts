import nodemailer from "nodemailer";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** SMTP today. A Resend or SES adapter only has to implement this. */
export interface MailProvider {
  /** Set when email can't be sent at all, and says why. */
  offReason?: string;
  send(message: MailMessage): Promise<void>;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export class SmtpProvider implements MailProvider {
  private readonly transport;
  private readonly from: string;

  constructor(config: SmtpConfig) {
    this.from = config.from;
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}

/** Used when SMTP isn't set up. Failing means each email shows as failed in the mail log. */
export class MailOffProvider implements MailProvider {
  constructor(readonly offReason: string) {}

  async send(): Promise<void> {
    throw new Error(this.offReason);
  }
}

/** Development only: prints the message, including its links, to the console. */
export class DevMailProvider implements MailProvider {
  constructor(private readonly log: (message: string) => void) {}

  async send({ to, subject, text }: MailMessage): Promise<void> {
    this.log(`[DEV MAIL] to=${to} subject="${subject}"\n${text}`);
  }
}

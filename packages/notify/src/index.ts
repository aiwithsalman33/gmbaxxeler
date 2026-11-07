export * from "./mail-provider";
export * from "./templates";

import { DevMailProvider, MailOffProvider, SmtpProvider, type MailProvider } from "./mail-provider";

export interface MailConfig {
  provider: "smtp" | "dev";
  production?: boolean;
  host?: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from?: string;
  log: (message: string) => void;
}

/** Missing SMTP settings turn email off rather than stopping the app. Production never prints mail. */
export function createMailProvider(config: MailConfig): MailProvider {
  if (config.provider === "dev" && !config.production) return new DevMailProvider(config.log);
  const { host, user, pass, from, port, secure } = config;
  if (host && user && pass && from) return new SmtpProvider({ host, port, secure, user, pass, from });
  const missing = Object.entries({ SMTP_HOST: host, SMTP_USER: user, SMTP_PASS: pass, MAIL_FROM: from }).filter(([, value]) => !value);
  const reason = `Email is off. Set ${missing.map(([name]) => name).join(", ")} to send mail.`;
  config.log(reason);
  return new MailOffProvider(reason);
}

export type ChannelName = "whatsapp" | "sms";

export interface OutboundMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Channel {
  send(message: OutboundMessage): Promise<void>;
}

export interface MessengerConfig {
  mode: "dev" | "live";
  whatsappWebhookUrl?: string;
  smsWebhookUrl?: string;
  log: (message: string) => void;
  fetch?: typeof fetch;
}

class WebhookChannel implements Channel {
  constructor(
    private readonly url: string,
    private readonly http: typeof fetch,
  ) {}

  async send({ to, text }: OutboundMessage): Promise<void> {
    const response = await this.http(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to, text }),
    });
    if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
  }
}

class DevChannel implements Channel {
  constructor(
    private readonly name: ChannelName,
    private readonly log: (message: string) => void,
  ) {}

  async send({ to, subject }: OutboundMessage): Promise<void> {
    this.log(`[DEV ${this.name}] to=${to} subject="${subject}"`);
  }
}

/** WhatsApp and SMS delivery of the client guide. Email has its own queue. */
export class Messenger {
  private readonly channels = new Map<ChannelName, Channel>();

  constructor(config: MessengerConfig) {
    const http = config.fetch ?? fetch;
    if (config.mode === "dev") {
      for (const name of ["whatsapp", "sms"] as const) this.channels.set(name, new DevChannel(name, config.log));
      return;
    }
    if (config.whatsappWebhookUrl) this.channels.set("whatsapp", new WebhookChannel(config.whatsappWebhookUrl, http));
    if (config.smsWebhookUrl) this.channels.set("sms", new WebhookChannel(config.smsWebhookUrl, http));
  }

  available(): ChannelName[] {
    return [...this.channels.keys()];
  }

  async send(channel: ChannelName, message: OutboundMessage): Promise<void> {
    const target = this.channels.get(channel);
    if (!target) throw new Error(`Channel ${channel} is not configured`);
    await target.send(message);
  }
}

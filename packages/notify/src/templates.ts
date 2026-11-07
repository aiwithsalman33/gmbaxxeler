export const EMAIL_TEMPLATES = [
  "verify_email",
  "reset_password",
  "team_invite",
  "client_invite",
  "client_reminder",
  "negative_review",
  "failed_job",
  "draft_awaiting_approval",
  "client_connected",
  "google_reconnect",
  "test",
] as const;

export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];
export type EmailData = Record<string, string>;

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

interface Content {
  subject: string;
  heading: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  steps?: string[];
  footer?: string;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function managerSteps(agencyEmail: string): string[] {
  return [
    "Open https://business.google.com and sign in",
    "Open your Business Profile, then Menu > Business Profile settings",
    "Choose People and access > Add",
    `Enter ${agencyEmail}`,
    "Set the role to Manager, not Owner, and tap Invite",
  ];
}

const CONTENT: Record<EmailTemplate, (d: EmailData) => Content> = {
  verify_email: (d) => ({
    subject: "Verify your LocalPilot email",
    heading: "Verify your email",
    paragraphs: ["Confirm this address to finish setting up your account. The link works for 24 hours."],
    action: { label: "Verify email", url: d.link ?? "" },
    footer: "If you didn't create an account, you can ignore this email.",
  }),
  reset_password: (d) => ({
    subject: "Reset your LocalPilot password",
    heading: "Reset your password",
    paragraphs: ["Choose a new password using the button below. The link works for 1 hour and can only be used once."],
    action: { label: "Reset password", url: d.link ?? "" },
    footer: "If you didn't ask for this, you can ignore this email. Your password won't change.",
  }),
  team_invite: (d) => ({
    subject: `Join ${d.agencyName} on LocalPilot`,
    heading: "You're invited",
    paragraphs: [`${d.agencyName} invited you to manage clients on LocalPilot. The link works for 7 days.`],
    action: { label: "Accept invite", url: d.link ?? "" },
  }),
  client_invite: (d) => ({
    subject: `Give us access to ${d.businessName} on Google`,
    heading: `Connect ${d.businessName}`,
    paragraphs: [`To start managing ${d.businessName} on Google, we need Manager access to your Business Profile. It takes about a minute:`],
    steps: managerSteps(d.agencyEmail ?? ""),
    footer: "That's it. We'll accept automatically and let you know once it's connected.",
  }),
  client_reminder: (d) => ({
    subject: `Reminder: access to ${d.businessName} on Google`,
    heading: "A quick reminder",
    paragraphs: [`We still need Manager access to ${d.businessName} on Google. It takes about a minute:`],
    steps: managerSteps(d.agencyEmail ?? ""),
  }),
  negative_review: (d) => ({
    subject: d.title ?? "A negative review needs attention",
    heading: "A negative review needs attention",
    paragraphs: [d.body ?? "", "A draft reply is waiting for your approval. Nothing is published until you approve it."],
    action: { label: "Open LocalPilot", url: d.link ?? "" },
  }),
  failed_job: (d) => ({
    subject: d.title ?? "A scheduled job failed",
    heading: "Something needs attention",
    paragraphs: [d.title ?? "", d.body ?? ""],
    action: { label: "View failed jobs", url: d.link ?? "" },
  }),
  draft_awaiting_approval: (d) => ({
    subject: d.title ?? "A post is waiting for approval",
    heading: "A post is waiting for you",
    paragraphs: [d.body ?? "Review it before it publishes."],
    action: { label: "Review posts", url: d.link ?? "" },
  }),
  client_connected: (d) => ({
    subject: d.title ?? "A client connected",
    heading: "A client connected",
    paragraphs: [d.body ?? "", "Fill in their knowledge base so AI posts and replies sound like them."],
    action: { label: "Open LocalPilot", url: d.link ?? "" },
  }),
  google_reconnect: (d) => ({
    subject: d.title ?? "Reconnect your Google account",
    heading: "Reconnect your Google account",
    paragraphs: [d.body ?? "", "Client posts, photos and reviews are paused until you reconnect. App login isn't affected."],
    action: { label: "Reconnect", url: d.link ?? "" },
  }),
  test: () => ({
    subject: "LocalPilot test email",
    heading: "Email is working",
    paragraphs: ["This test came from your LocalPilot mail settings."],
  }),
};

function renderHtml(content: Content): string {
  const paragraphs = content.paragraphs
    .filter(Boolean)
    .map((text) => `<p style="margin:0 0 16px;color:#1e1b2e;font-size:15px;line-height:1.6">${escapeHtml(text)}</p>`)
    .join("");
  const steps = content.steps?.length
    ? `<ol style="margin:0 0 16px;padding-left:20px;color:#1e1b2e;font-size:15px;line-height:1.8">${content.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>`
    : "";
  const action = content.action?.url
    ? `<p style="margin:24px 0"><a href="${escapeHtml(content.action.url)}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:12px">${escapeHtml(content.action.label)}</a></p>`
    : "";
  const footer = content.footer ? `<p style="margin:16px 0 0;color:#6b6880;font-size:13px;line-height:1.5">${escapeHtml(content.footer)}</p>` : "";
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f3ff;font-family:Segoe UI,Roboto,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e9e5f5;border-radius:16px">
<tr><td style="padding:24px 32px 0;color:#7c3aed;font-size:18px;font-weight:700">LocalPilot</td></tr>
<tr><td style="padding:16px 32px 28px"><h1 style="margin:0 0 16px;color:#1e1b2e;font-size:21px">${escapeHtml(content.heading)}</h1>${paragraphs}${steps}${action}${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

function renderText(content: Content): string {
  return [
    content.heading,
    "",
    ...content.paragraphs.filter(Boolean),
    ...(content.steps?.length ? ["", ...content.steps.map((step, index) => `${index + 1}. ${step}`)] : []),
    ...(content.action?.url ? ["", `${content.action.label}: ${content.action.url}`] : []),
    ...(content.footer ? ["", content.footer] : []),
  ].join("\n");
}

export function renderEmail(template: EmailTemplate, data: EmailData): RenderedEmail {
  const content = CONTENT[template](data);
  // Subjects can carry review or client text, so line breaks can't reach the mail header.
  return { subject: content.subject.replace(/[\r\n]+/g, " ").slice(0, 200), text: renderText(content), html: renderHtml(content) };
}

import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret } from "@localpilot/crypto";
import { deliverEmail, MAIL_QUEUE, queueEmail, type MailJob } from "@localpilot/services";
import PgBoss from "pg-boss";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MailQueue } from "../src/mail-queue";
import { TEST_DATABASE_URL } from "./env";
import { connectGoogle, createHarness, linkToken, login, OTHER_EMAIL, PASSWORD, resetDb, type Cookies, type Harness } from "./helpers";

let h: Harness;
let cookies: Cookies;

const api = (method: "GET" | "POST" | "DELETE", url: string, payload?: object, as = cookies) =>
  h.app.inject({ method, url: `/api/v1${url}`, cookies: as, ...(payload ? { payload } : {}) });

beforeAll(async () => {
  h = await createHarness({ MAIL_DAILY_CAP: "3" });
});
beforeEach(async () => {
  await resetDb(h);
  h.mail.length = 0;
  h.mailFailures.count = 0;
  cookies = await login(h);
  h.mail.length = 0;
});
afterAll(async () => {
  await h.app.close();
  await h.ctx.db.$disconnect();
});

const workspaceId = async () => (await h.ctx.db.workspace.findFirstOrThrow()).id;

describe("queueing", () => {
  it("keeps the job encrypted, with no link or address in the queue", async () => {
    const jobs: MailJob[] = [];
    const deps = { ...h.ctx.deps, enqueueMail: async (job: MailJob) => void jobs.push(job) };
    await queueEmail(deps, { template: "reset_password", to: "a@example.com", transactional: true, data: { link: "https://x/reset?token=secret-token" } });
    expect(JSON.stringify(jobs[0])).not.toContain("secret-token");
    expect(JSON.stringify(jobs[0])).not.toContain("a@example.com");
    expect(decryptSecret(jobs[0]!.payload, deps.encryptionKey)).toContain("secret-token");
    expect(await h.ctx.db.emailLog.findFirst({ where: { to: "a@example.com" } })).toMatchObject({ status: "queued", template: "reset_password" });
  });

  it("logs a sent email", async () => {
    await api("POST", "/settings/mail/test");
    const log = (await api("GET", "/settings/mail/log")).json();
    expect(log[0]).toMatchObject({ template: "test", status: "sent" });
    expect(log[0].sentAt).toBeTruthy();
    expect(h.mail).toHaveLength(1);
  });

  it("records a failure and rethrows, so pg-boss retries", async () => {
    const jobs: MailJob[] = [];
    const deps = { ...h.ctx.deps, enqueueMail: async (job: MailJob) => void jobs.push(job) };
    await queueEmail(deps, { template: "test", to: "a@example.com", transactional: true });
    h.mailFailures.count = 1;
    await expect(deliverEmail(h.ctx.deps, jobs[0]!)).rejects.toThrow("SMTP down");
    expect(await h.ctx.db.emailLog.findFirst({ where: { to: "a@example.com" } })).toMatchObject({ status: "failed", error: "SMTP down" });

    await deliverEmail(h.ctx.deps, jobs[0]!);
    const log = await h.ctx.db.emailLog.findFirstOrThrow({ where: { to: "a@example.com" } });
    expect(log).toMatchObject({ status: "sent", error: null });
  });

  it("does not send twice when a job repeats", async () => {
    const jobs: MailJob[] = [];
    const deps = { ...h.ctx.deps, enqueueMail: async (job: MailJob) => void jobs.push(job) };
    await queueEmail(deps, { template: "test", to: "a@example.com", transactional: true });
    await deliverEmail(h.ctx.deps, jobs[0]!);
    await deliverEmail(h.ctx.deps, jobs[0]!);
    expect(h.mail).toHaveLength(1);
  });

  it("travels through a real pg-boss queue with retries configured", async () => {
    const queue = new MailQueue(TEST_DATABASE_URL);
    const key = randomBytes(32);
    await queue.send({ logId: "00000000-0000-4000-8000-000000000001", payload: encryptSecret("{}", key) });

    const boss = new PgBoss({ connectionString: TEST_DATABASE_URL, schema: "pgboss" });
    boss.on("error", () => undefined);
    await boss.start();
    const [job] = await boss.fetch<MailJob>(MAIL_QUEUE, { includeMetadata: true });
    expect(job?.data.logId).toBe("00000000-0000-4000-8000-000000000001");
    expect(job?.retryLimit).toBe(3);
    expect(job?.retryBackoff).toBe(true);
    await boss.complete(MAIL_QUEUE, job!.id);
    await boss.stop({ graceful: false });
    await queue.stop();
  });
});

describe("daily cap", () => {
  it("stops at the cap per workspace and logs it", async () => {
    const warn = vi.spyOn(h.ctx.deps.logger, "warn");
    const id = await workspaceId();
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await queueEmail(h.ctx.deps, { template: "test", to: "a@example.com", workspaceId: id }));
    expect(results).toEqual([true, true, true, false]);
    expect(h.mail).toHaveLength(3);
    expect(await h.ctx.db.emailLog.count({ where: { status: "capped" } })).toBe(1);
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ cap: 3 }), expect.any(String));
    warn.mockRestore();
  });

  it("never blocks account emails", async () => {
    const id = await workspaceId();
    for (let i = 0; i < 4; i++) await queueEmail(h.ctx.deps, { template: "test", to: "a@example.com", workspaceId: id });
    expect(await queueEmail(h.ctx.deps, { template: "test", to: "a@example.com", workspaceId: id, transactional: true })).toBe(true);
    await h.app.inject({ method: "POST", url: "/api/v1/auth/forgot-password", payload: { email: "owner@example.com" } });
    expect(h.mail.at(-1)!.subject).toContain("Reset");
  });

  it("tracks workspaces separately", async () => {
    const id = await workspaceId();
    for (let i = 0; i < 3; i++) await queueEmail(h.ctx.deps, { template: "test", to: "a@example.com", workspaceId: id });
    await login(h, OTHER_EMAIL);
    const other = await h.ctx.db.workspace.findFirstOrThrow({ where: { id: { not: id } } });
    expect(await queueEmail(h.ctx.deps, { template: "test", to: "a@example.com", workspaceId: other.id })).toBe(true);
  });
});

describe("client invite email", () => {
  it("sends the Manager guide naming the connected agency Gmail, and updates status", async () => {
    await connectGoogle(h, cookies);
    const { client } = (await api("POST", "/clients", { businessName: "Harbor View Dental", contactEmail: "owner@harbor.example" })).json();
    const response = await api("POST", `/clients/${client.id}/invite-email`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "waiting_for_access" });
    expect(response.json().inviteEmailSentAt).toBeTruthy();
    const [mail] = h.mail;
    expect(mail).toMatchObject({ to: "owner@harbor.example" });
    expect(mail!.text).toContain("agency.demo@localpilot.dev");
    expect(mail!.text).toContain("People and access");
  });

  it("needs a client email and a connected agency account", async () => {
    await connectGoogle(h, cookies);
    const phoneOnly = (await api("POST", "/clients", { businessName: "Phone Only", contactPhone: "+919876500000" })).json().client;
    expect((await api("POST", `/clients/${phoneOnly.id}/invite-email`)).statusCode).toBe(400);
  });

  it("refuses without an agency account", async () => {
    const { client } = (await api("POST", "/clients", { businessName: "Harbor", contactEmail: "a@example.com" })).json();
    expect((await api("POST", `/clients/${client.id}/invite-email`)).statusCode).toBe(409);
  });

  it("sends day 2 and day 5 reminders by email", async () => {
    await connectGoogle(h, cookies);
    await api("POST", "/clients", { businessName: "Harbor View Dental", contactEmail: "owner@harbor.example" });
    const { sendDueReminders } = await import("@localpilot/services");
    await sendDueReminders(h.ctx.deps, new Date(Date.now() + 2.1 * 86_400_000));
    await sendDueReminders(h.ctx.deps, new Date(Date.now() + 5.1 * 86_400_000));
    expect(h.mail.filter((mail) => mail.subject.startsWith("Reminder"))).toHaveLength(2);
  });
});

describe("alert emails", () => {
  it("emails the owner when no alert addresses are set", async () => {
    await connectGoogle(h, cookies);
    const { notify } = await import("@localpilot/services");
    await notify(h.ctx.deps, { workspaceId: await workspaceId(), type: "review.negative", severity: "critical", title: "1-star review", body: "<b>Bad</b>" });
    expect(h.mail[0]).toMatchObject({ to: "owner@example.com" });
    expect(h.mail[0]!.html).toContain("&lt;b&gt;Bad");
  });
});

describe("team invites", () => {
  const accept = (token: string, body: object) => h.app.inject({ method: "POST", url: `/api/v1/public/team-invites/${token}/accept`, payload: body });

  it("emails a link that sets a password and joins the workspace", async () => {
    expect((await api("POST", "/workspace/invites", { email: "Teammate@Example.com" })).statusCode).toBe(201);
    const token = linkToken(h, "team-invite");
    const info = await h.app.inject({ method: "GET", url: `/api/v1/public/team-invites/${token}` });
    expect(info.json()).toMatchObject({ email: "teammate@example.com", needsPassword: true });
    expect((await accept(token, { password: PASSWORD })).statusCode).toBe(200);

    const signedIn = await h.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "teammate@example.com", password: PASSWORD } });
    expect(signedIn.statusCode).toBe(200);
    const member = Object.fromEntries(signedIn.cookies.map((c) => [c.name, c.value]));
    expect((await api("GET", "/me", undefined, member)).json()).toMatchObject({ role: "member", workspace: { id: await workspaceId() } });
    expect((await api("POST", "/settings/mail/test", undefined, member)).statusCode).toBe(403);
    expect((await api("POST", "/workspace/invites", { email: "x@example.com" }, member)).statusCode).toBe(403);
  });

  it("works once and expires", async () => {
    await api("POST", "/workspace/invites", { email: "teammate@example.com" });
    const token = linkToken(h, "team-invite");
    await accept(token, { password: PASSWORD });
    expect((await accept(token, { password: PASSWORD })).statusCode).toBe(404);

    await api("POST", "/workspace/invites", { email: "late@example.com" });
    const late = linkToken(h, "team-invite");
    await h.ctx.db.teamInvite.updateMany({ where: { email: "late@example.com" }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await accept(late, { password: PASSWORD })).statusCode).toBe(404);
  });

  it("removes a member and ends their sessions, but not the owner", async () => {
    await api("POST", "/workspace/invites", { email: "teammate@example.com" });
    await accept(linkToken(h, "team-invite"), { password: PASSWORD });
    const members = (await api("GET", "/workspace/members")).json();
    const owner = members.find((m: { role: string }) => m.role === "owner");
    const teammate = members.find((m: { role: string }) => m.role === "member");
    expect((await api("DELETE", `/workspace/members/${owner.id}`)).statusCode).toBe(409);
    expect((await api("DELETE", `/workspace/members/${teammate.id}`)).statusCode).toBe(200);
    const again = await h.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "teammate@example.com", password: PASSWORD } });
    expect(again.statusCode).toBe(401);
  });
});

describe("Google reconnect", () => {
  it("returns a sign-in link for the workspace's own connection only", async () => {
    await connectGoogle(h, cookies);
    const [connection] = (await api("GET", "/google/connections")).json();
    expect((await api("POST", `/google/connections/${connection.id}/reconnect`)).json().url).toContain("state=");
    const other = await login(h, OTHER_EMAIL);
    expect((await api("POST", `/google/connections/${connection.id}/reconnect`, undefined, other)).statusCode).toBe(404);
  });
});

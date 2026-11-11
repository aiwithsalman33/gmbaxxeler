import { mkdirSync } from "node:fs";
import { test, type Page } from "@playwright/test";
import { connectMockGoogle, signIn } from "./support";

/** Captures every screen at desktop and phone width. Run with SHOTS_DIR=<folder> SHOTS=1. */
const DIR = process.env.SHOTS_DIR ?? "screenshots";
const SIZES = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

test.skip(!process.env.SHOTS, "Screenshots only run when SHOTS=1");

/** SHOTS_ONLY=login,dashboard limits the run to those screens. */
const ONLY = process.env.SHOTS_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);
const wanted = (name: string) => !ONLY || ONLY.includes(name);

async function shoot(page: Page, name: string) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  // Wait until skeletons are gone, so shots show the real screen rather than its loading state.
  await page.waitForFunction(() => !document.querySelector(".skeleton, [aria-busy='true']"), undefined, { timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(600);
  for (const [size, viewport] of Object.entries(SIZES)) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${DIR}/${size}/${name}.png`, fullPage: true });
  }
  await page.setViewportSize(SIZES.desktop);
}

/** Mock adapter only: adds clients the way a real agency would, then simulates each client's Manager invitation. */
async function seedViaInvites(page: Page) {
  await connectMockGoogle(page);
  const existing = (await (await page.request.get("/api/v1/clients")).json()) as { name: string }[];
  const names = ["Riverside Physio Clinic", "Harbor View Dental", "Maple Street Bakery"];
  for (const [i, name] of names.entries()) {
    if (existing.some((c) => c.name === name)) continue;
    const created = await page.request.post("/api/v1/clients", { data: { businessName: name, contactPhone: `+9198765000${i}0`, address: `${i + 4} Harbor Road, Chennai` } });
    const { client } = (await created.json()) as { client: { id: string } };
    await page.request.post(`/api/v1/dev/mock/clients/${client.id}/invite`);
  }
  await page.request.post("/api/v1/clients/check-invitations");
}

test("public screens", async ({ page }) => {
  for (const size of Object.keys(SIZES)) mkdirSync(`${DIR}/${size}`, { recursive: true });
  for (const [name, path] of [["login", "/login"], ["register", "/register"], ["forgot-password", "/forgot-password"]] as const) {
    if (!wanted(name)) continue;
    await page.goto(path);
    await shoot(page, name);
  }
});

test("app screens", async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page);
  if (process.env.SHOTS_IMPORT) {
    await connectMockGoogle(page);
    await page.request.post("/api/v1/clients/import", { data: { all: true } });
  }
  if (process.env.SHOTS_SEED) await seedViaInvites(page);
  const clients = (await (await page.request.get("/api/v1/clients")).json()) as { id: string; status: string }[];
  const client = clients.find((c) => c.status === "connected") ?? clients[0];

  const pages: [string, string][] = [["clients", "/clients"], ["settings", "/settings"], ["settings-google", "/settings/google"], ["failed-jobs", "/admin/failed-jobs"]];
  if (client) {
    for (const screen of ["dashboard", "library", "photos", "seo-posts", "reviews", "knowledge"]) pages.push([screen, `/${client.id}/${screen}`]);
  }
  for (const [name, path] of pages) {
    if (!wanted(name)) continue;
    await page.goto(path);
    await shoot(page, name);
  }
});

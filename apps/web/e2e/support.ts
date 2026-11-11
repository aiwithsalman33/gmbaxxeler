import { expect, type Page } from "@playwright/test";

export const EMAIL = process.env.E2E_EMAIL ?? "";
export const PASSWORD = process.env.E2E_PASSWORD ?? "";

/** Signs in through the API so tests that aren't about login start fast. */
export async function signIn(page: Page): Promise<void> {
  if (!EMAIL || !PASSWORD) throw new Error("Set E2E_EMAIL and E2E_PASSWORD");
  const response = await page.request.post("/api/v1/auth/login", { data: { email: EMAIL, password: PASSWORD } });
  expect(response.ok(), `login returned ${response.status()}`).toBeTruthy();
}

/** With the mock adapter, the OAuth start redirects straight back with a fake code. */
export async function connectMockGoogle(page: Page): Promise<void> {
  await page.request.get("/api/v1/google/oauth/start");
}

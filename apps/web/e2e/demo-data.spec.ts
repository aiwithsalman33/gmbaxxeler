import { expect, test } from "@playwright/test";
import { connectMockGoogle, signIn } from "./support";

/**
 * Needs a non-production stack with MOCK_SAMPLE_DATA=true, so sample businesses can be imported.
 * Production never creates them, which the API tests cover.
 */
test("demo clients are badged and can be removed from Settings", async ({ page }) => {
  await signIn(page);
  await connectMockGoogle(page);
  const imported = await page.request.post("/api/v1/clients/import", { data: { all: true } });
  test.skip(!imported.ok() || (await imported.json()).length === 0, "No sample businesses to import: sample data is off, or was already removed in this workspace");

  await page.goto("/clients");
  await expect(page.getByText("Green Leaf Cafe")).toBeVisible();
  await expect(page.getByText("Demo data", { exact: true }).first()).toBeVisible();

  await page.goto("/settings");
  await page.getByRole("button", { name: "Remove demo data" }).click();
  await expect(page.getByText(/Removed \d+ demo clients/)).toBeVisible();

  await page.goto("/clients");
  await expect(page.getByText("Green Leaf Cafe")).toHaveCount(0);
  // Real clients must survive; with none left, the empty state shows instead.
  const remaining = (await (await page.request.get("/api/v1/clients")).json()) as { name: string; demo: boolean }[];
  expect(remaining.some((c) => c.demo)).toBe(false);
  if (remaining.length) await expect(page.getByText(remaining[0].name).first()).toBeVisible();
  else await expect(page.getByText(/No clients yet|Connect your Google account to import your clients/)).toBeVisible();
});

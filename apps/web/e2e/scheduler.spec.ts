import { expect, test } from "@playwright/test";
import { signIn } from "./support";

/**
 * Needs a running stack with the mock adapter and a connected client that has upcoming photo
 * uploads (save a photo schedule and add images first). Skips otherwise.
 */
test("a queued photo can be published now and shows as simulated", async ({ page }) => {
  await signIn(page);
  const clients = (await (await page.request.get("/api/v1/clients")).json()) as { id: string; name: string; status: string }[];
  let target: { id: string; jobId: string } | null = null;
  for (const client of clients.filter((c) => c.status === "connected")) {
    const queue = (await (await page.request.get(`/api/v1/clients/${client.id}/photos/queue`)).json()) as { id: string }[];
    if (queue.length) {
      target = { id: client.id, jobId: queue[0]!.id };
      break;
    }
  }
  test.skip(!target, "No connected client with queued photo uploads");

  await page.goto(`/${target!.id}/photos`);
  await expect(page.getByText(/Ready to publish \(simulated\)|Nothing will publish/)).toBeVisible();
  await page.getByRole("button", { name: /^Publish now:/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByText("Published (simulated: nothing was sent to Google)")).toBeVisible();

  await page.getByRole("tab", { name: /History/ }).click();
  await expect(page.getByText("Simulated (mock)").first()).toBeVisible();
});

test("settings shows the worker as online with its last run", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings");
  await expect(page.getByText(/Worker: (online|offline|never started)/)).toBeVisible();
  await expect(page.getByText("Worker: online")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Last heartbeat/)).toBeVisible();
});

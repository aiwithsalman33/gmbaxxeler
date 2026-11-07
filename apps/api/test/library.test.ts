import { deflateSync } from "node:zlib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { connectGoogle, createHarness, login, makePng, multipart, OTHER_EMAIL, resetDb, type Cookies, type Harness } from "./helpers";

let h: Harness;
let cookies: Cookies;
let clientId: string;

beforeAll(async () => {
  h = await createHarness();
});
beforeEach(async () => {
  await resetDb(h);
  h.mail.length = 0;
  cookies = await login(h);
  await connectGoogle(h, cookies);
  const [location] = (await h.app.inject({ method: "GET", url: "/api/v1/locations/unattached", cookies })).json();
  const imported = await h.app.inject({
    method: "POST",
    url: "/api/v1/clients/import",
    cookies,
    payload: { locations: [{ accountId: location.accountId, locationId: location.locationId }] },
  });
  clientId = imported.json()[0].id;
});
afterAll(async () => {
  await h.app.close();
  await h.ctx.db.$disconnect();
});

const upload = (files: { name: string; data: Buffer }[], folder = "photos", as = cookies) =>
  h.app.inject({ method: "POST", url: `/api/v1/clients/${clientId}/library/images?folder=${folder}`, cookies: as, ...multipart(files) });
const list = async (folder: string) =>
  (await h.app.inject({ method: "GET", url: `/api/v1/clients/${clientId}/library/images?folder=${folder}`, cookies })).json().images;

describe("library", () => {
  it("bulk-uploads into both folders and serves public URLs", async () => {
    const response = await upload([{ name: "a.png", data: makePng() }, { name: "b.png", data: makePng() }]);
    expect(response.statusCode).toBe(201);
    await upload([{ name: "c.png", data: makePng() }], "seo_images");

    const photos = await list("photos");
    expect(photos).toHaveLength(2);
    expect(await list("seo_images")).toHaveLength(1);
    expect(photos[0]).toMatchObject({ width: 300, height: 300, mime: "image/png", usageCount: 0 });

    const fetched = await fetch(photos[0].publicUrl);
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get("content-type")).toBe("image/png");
  });

  it("reports per-file errors and keeps the valid files", async () => {
    const response = await upload([
      { name: "good.png", data: makePng() },
      { name: "tiny.png", data: Buffer.from("not an image") },
      { name: "small-dims.png", data: makePng(100, 300) },
      { name: "fake.png", data: Buffer.concat([Buffer.from("not an image at all"), deflateSync(Buffer.alloc(0)), Buffer.alloc(20_000, 7)]) },
    ]);
    const { results } = response.json();
    expect(results.map((r: { ok: boolean }) => r.ok)).toEqual([true, false, false, false]);
    expect(results[1].error).toMatch(/10 KB/);
    expect(results[2].error).toMatch(/250x250/);
    expect(results[3].error).toMatch(/JPG and PNG/);
  });

  it("rejects files over 5 MB", async () => {
    const response = await upload([{ name: "big.png", data: Buffer.concat([makePng(), Buffer.alloc(5 * 1024 * 1024)]) }]);
    expect(response.statusCode).toBe(200);
    expect(response.json().results[0].error).toMatch(/5 MB/);
  });

  it("rejects duplicates but allows re-upload after delete", async () => {
    const data = makePng();
    await upload([{ name: "a.png", data }]);
    expect((await upload([{ name: "copy.png", data }])).json().results[0].ok).toBe(false);

    const [image] = await list("photos");
    await h.app.inject({ method: "DELETE", url: `/api/v1/clients/${clientId}/library/images/${image.id}`, cookies });
    expect(await list("photos")).toHaveLength(0);
    expect((await fetch(image.publicUrl)).status).toBe(404);
    expect((await upload([{ name: "a.png", data }])).statusCode).toBe(201);
  });

  it("moves images between folders and saves tags", async () => {
    await upload([{ name: "a.png", data: makePng() }, { name: "b.png", data: makePng() }]);
    const images = await list("photos");
    await h.app.inject({
      method: "PATCH",
      url: `/api/v1/clients/${clientId}/library/images/${images[0].id}`,
      cookies,
      payload: { tags: ["exterior"] },
    });
    const moved = await h.app.inject({
      method: "POST",
      url: `/api/v1/clients/${clientId}/library/images/bulk-move`,
      cookies,
      payload: { ids: images.map((i: { id: string }) => i.id), folder: "seo_images" },
    });
    expect(moved.json().moved).toBe(2);
    const seo = await list("seo_images");
    expect(seo).toHaveLength(2);
    expect(seo.find((i: { id: string }) => i.id === images[0].id).tags).toEqual(["exterior"]);
  });

  it("blocks uploads from another workspace", async () => {
    const other = await login(h, OTHER_EMAIL);
    expect((await upload([{ name: "a.png", data: makePng() }], "photos", other)).statusCode).toBe(404);
  });
});

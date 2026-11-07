import { describe, expect, it } from "vitest";
import { listModels, OpenAiClient, OpenAiError, renamePrompt } from "./index";

const input = { image: Buffer.from("img"), mime: "image/png", businessName: "Sunrise Dental", service: "Implants", city: "Chennai", originalName: "IMG_1.png" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("renamePrompt", () => {
  it("includes the business, service and city", () => {
    const prompt = renamePrompt(input);
    expect(prompt).toContain("Sunrise Dental");
    expect(prompt).toContain("Implants");
    expect(prompt).toContain("Chennai");
  });

  it("omits missing details", () => {
    expect(renamePrompt({ ...input, service: null, city: null })).not.toContain("City:");
  });
});

describe("OpenAiClient", () => {
  it("sends the image inline and reads usage", async () => {
    let sent: { model: string; messages: { content: { image_url?: { url: string } }[] }[] } | null = null;
    const http = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return json({ choices: [{ message: { content: "dental-clinic-chennai" } }], usage: { prompt_tokens: 100, completion_tokens: 8 } });
    }) as unknown as typeof fetch;

    const result = await new OpenAiClient("key", "test-model", http).renameImage(input);
    expect(result).toEqual({ name: "dental-clinic-chennai", model: "test-model", inputTokens: 100, outputTokens: 8 });
    expect(sent!.model).toBe("test-model");
    expect(sent!.messages[0]!.content[1]!.image_url!.url).toMatch(/^data:image\/png;base64,/);
  });

  it("reports a status without leaking the key", async () => {
    const http = (async () => json({ error: { code: "invalid_api_key" } }, 401)) as unknown as typeof fetch;
    const error = await new OpenAiClient("sk-secret", "m", http).renameImage(input).catch((e) => e);
    expect(error).toBeInstanceOf(OpenAiError);
    expect(error.status).toBe(401);
    expect(error.message).not.toContain("sk-secret");
  });

  it("rejects an empty reply", async () => {
    const http = (async () => json({ choices: [] })) as unknown as typeof fetch;
    await expect(new OpenAiClient("k", "m", http).renameImage(input)).rejects.toThrow(/no text/);
  });
});

describe("listModels", () => {
  it("keeps chat models only", async () => {
    const http = (async () => json({ data: [{ id: "whisper-1" }, { id: "gpt-4o-mini" }] })) as unknown as typeof fetch;
    expect(await listModels("k", http)).toEqual(["gpt-4o-mini"]);
  });
});

import { describe, expect, it } from "vitest";
import { addClientSchema, seoPostSchema } from "./index";

describe("addClientSchema", () => {
  it("requires a phone or an email", () => {
    expect(addClientSchema.safeParse({ businessName: "Acme" }).success).toBe(false);
    expect(addClientSchema.safeParse({ businessName: "Acme", contactEmail: "a@gmail.com" }).success).toBe(true);
    expect(addClientSchema.safeParse({ businessName: "Acme", contactPhone: "+919876543210" }).success).toBe(true);
  });
});

describe("seoPostSchema", () => {
  const url = "https://example.com";

  it("enforces the 1,500 character cap", () => {
    expect(seoPostSchema.safeParse({ summary: "a".repeat(1500), ctaUrl: url }).success).toBe(true);
    expect(seoPostSchema.safeParse({ summary: "a".repeat(1501), ctaUrl: url }).success).toBe(false);
  });

  it("rejects a title on standard posts but allows one on events", () => {
    expect(seoPostSchema.safeParse({ summary: "x", ctaUrl: url, title: "Hi" }).success).toBe(false);
    expect(seoPostSchema.safeParse({ postType: "event", summary: "x", ctaUrl: url, title: "Hi" }).success).toBe(true);
  });

  it("sends no url with a Call button and requires one otherwise", () => {
    expect(seoPostSchema.safeParse({ summary: "x", ctaType: "CALL" }).success).toBe(true);
    expect(seoPostSchema.safeParse({ summary: "x", ctaType: "CALL", ctaUrl: url }).success).toBe(false);
    expect(seoPostSchema.safeParse({ summary: "x", ctaType: "BOOK" }).success).toBe(false);
  });
});

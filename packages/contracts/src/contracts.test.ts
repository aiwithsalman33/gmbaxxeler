import { describe, expect, it } from "vitest";
import { addClientSchema, updatePostSchema } from "./index";

describe("addClientSchema", () => {
  it("requires a phone or an email", () => {
    expect(addClientSchema.safeParse({ businessName: "Acme" }).success).toBe(false);
    expect(addClientSchema.safeParse({ businessName: "Acme", contactEmail: "a@gmail.com" }).success).toBe(true);
    expect(addClientSchema.safeParse({ businessName: "Acme", contactPhone: "+919876543210" }).success).toBe(true);
  });
});

describe("updatePostSchema", () => {
  const url = "https://example.com";

  it("enforces the 1,500 character cap", () => {
    expect(updatePostSchema.safeParse({ summary: "a".repeat(1500), ctaType: "BOOK", ctaUrl: url }).success).toBe(true);
    expect(updatePostSchema.safeParse({ summary: "a".repeat(1501), ctaType: "BOOK", ctaUrl: url }).success).toBe(false);
  });

  it("sends no url with a Call button and requires one otherwise", () => {
    expect(updatePostSchema.safeParse({ summary: "x", ctaType: "CALL" }).success).toBe(true);
    expect(updatePostSchema.safeParse({ summary: "x", ctaType: "CALL", ctaUrl: url }).success).toBe(false);
    expect(updatePostSchema.safeParse({ summary: "x", ctaType: "BOOK" }).success).toBe(false);
  });
});

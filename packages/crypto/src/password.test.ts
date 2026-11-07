import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("uses argon2id and verifies the right password", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(stored.startsWith("$argon2id$")).toBe(true);
    expect(stored).not.toContain("correct horse");
    expect(await verifyPassword(stored, "correct horse battery")).toBe(true);
  });

  it("rejects the wrong password", async () => {
    expect(await verifyPassword(await hashPassword("correct horse battery"), "wrong password")).toBe(false);
  });

  it("salts each hash", async () => {
    expect(await hashPassword("same password")).not.toBe(await hashPassword("same password"));
  });

  it("treats a malformed hash as a failed match", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
  });
});

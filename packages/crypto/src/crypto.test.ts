import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, parseKey } from "./index";

const key = randomBytes(32);

describe("encryptSecret", () => {
  it("round-trips unicode values", () => {
    expect(decryptSecret(encryptSecret("refresh-tökén-✓", key), key)).toBe("refresh-tökén-✓");
  });

  it("uses a fresh IV each time", () => {
    expect(encryptSecret("same", key)).not.toBe(encryptSecret("same", key));
  });

  it("rejects tampered ciphertext", () => {
    const parts = encryptSecret("secret", key).split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."), key)).toThrow();
  });

  it("rejects the wrong key", () => {
    expect(() => decryptSecret(encryptSecret("secret", key), randomBytes(32))).toThrow();
  });

  it("accepts hex and base64 keys", () => {
    const raw = randomBytes(32);
    expect(parseKey(raw.toString("hex"))).toEqual(raw);
    expect(parseKey(raw.toString("base64"))).toEqual(raw);
  });

  it("rejects keys of the wrong length", () => {
    expect(() => parseKey(Buffer.from("short").toString("base64"))).toThrow(/32 bytes/);
  });
});

import { describe, expect, it } from "vitest";
import { matchInvitation, matchLocation, normalizePhone, similarity, type PendingClient } from "./matching";

const clients: PendingClient[] = [
  { id: "a", name: "Sunrise Dental Clinic", contactPhone: "+919876543210" },
  { id: "b", name: "Green Leaf Cafe", address: "12 MG Road, Bengaluru" },
];

describe("matchInvitation", () => {
  it("matches names despite case, punctuation and legal suffixes", () => {
    const result = matchInvitation({ locationName: "SUNRISE DENTAL CLINIC PVT. LTD." }, clients);
    expect(result).toMatchObject({ kind: "match", clientId: "a", method: "auto_name" });
  });

  it("matches on address when the listing name differs", () => {
    const result = matchInvitation({ locationName: "GL Coffee House", address: "12, M.G. Road, Bengaluru" }, clients);
    expect(result).toMatchObject({ kind: "match", clientId: "b", method: "auto_address" });
  });

  it("does not auto-match an unrelated business", () => {
    expect(matchInvitation({ locationName: "Sunshine Dentists" }, clients).kind).toBe("none");
  });

  it("treats the same chain name with duplicate clients as ambiguous", () => {
    const twins = [
      { id: "1", name: "Acme Motors" },
      { id: "2", name: "Acme Motors" },
    ];
    expect(matchInvitation({ locationName: "Acme Motors" }, twins)).toMatchObject({ kind: "ambiguous", clientIds: ["1", "2"] });
  });

  it("rejects a matching name at a clearly different address", () => {
    const branch = [{ id: "1", name: "Acme Motors", address: "45 Anna Salai, Chennai" }];
    expect(matchInvitation({ locationName: "Acme Motors", address: "9 Park Street, Kolkata" }, branch).kind).toBe("none");
  });
});

describe("matchLocation", () => {
  it("prefers phone over name", () => {
    const result = matchLocation({ title: "Totally Different", phone: "098765 43210" }, clients);
    expect(result).toMatchObject({ kind: "match", clientId: "a", method: "auto_phone" });
  });

  it("falls back to the name when phones differ", () => {
    const result = matchLocation({ title: "Green Leaf Cafe", phone: "+91 80 1111 2222" }, clients);
    expect(result).toMatchObject({ kind: "match", clientId: "b", method: "auto_name" });
  });
});

describe("helpers", () => {
  it("normalizes phone formats", () => {
    expect(normalizePhone("+91 98765-43210")).toBe(normalizePhone("09876543210"));
  });

  it("scores identical strings as 1 and empty strings as 0", () => {
    expect(similarity("abc", "abc")).toBe(1);
    expect(similarity("", "abc")).toBe(0);
  });
});

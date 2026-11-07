import { describe, expect, it } from "vitest";
import { matchInvitation, matchLocation, normalizePhone, similarity, type PendingClient } from "./matching";

const clients: PendingClient[] = [
  { id: "a", name: "Sunrise Dental Clinic", contactPhone: "+919876543210", address: "4 Main Road, Adyar, Chennai" },
  { id: "b", name: "Green Leaf Cafe", address: "12 MG Road, Bengaluru" },
  { id: "c", name: "No Address Motors" },
];

describe("matchInvitation", () => {
  it("auto-accepts only when name and address both match", () => {
    const result = matchInvitation({ locationName: "SUNRISE DENTAL CLINIC PVT. LTD.", address: "4, Main Road, Adyar, Chennai" }, clients);
    expect(result).toMatchObject({ kind: "match", clientId: "a" });
  });

  it("only suggests on a name match with no invitation address", () => {
    expect(matchInvitation({ locationName: "Sunrise Dental Clinic" }, clients)).toMatchObject({ kind: "suggest", clientId: "a" });
  });

  it("only suggests when the client has no address", () => {
    expect(matchInvitation({ locationName: "No Address Motors", address: "1 Anywhere Street" }, clients)).toMatchObject({ kind: "suggest", clientId: "c" });
  });

  it("only suggests on an address match with a different name", () => {
    expect(matchInvitation({ locationName: "GL Coffee House", address: "12, M.G. Road, Bengaluru" }, clients)).toMatchObject({ kind: "suggest", clientId: "b" });
  });

  it("does not match an unrelated business", () => {
    expect(matchInvitation({ locationName: "Sunshine Dentists" }, clients).kind).toBe("none");
  });

  it("treats twins as ambiguous, with or without addresses", () => {
    const twins = [
      { id: "1", name: "Acme Motors", address: "9 Park Street, Kolkata" },
      { id: "2", name: "Acme Motors", address: "9 Park Street, Kolkata" },
    ];
    expect(matchInvitation({ locationName: "Acme Motors", address: "9 Park Street, Kolkata" }, twins)).toMatchObject({ kind: "ambiguous" });
    expect(matchInvitation({ locationName: "Acme Motors" }, twins)).toMatchObject({ kind: "ambiguous", clientIds: ["1", "2"] });
  });

  it("rejects a matching name at a clearly different address", () => {
    const branch = [{ id: "1", name: "Acme Motors", address: "45 Anna Salai, Chennai" }];
    expect(matchInvitation({ locationName: "Acme Motors", address: "9 Park Street, Kolkata" }, branch).kind).toBe("none");
  });
});

describe("matchLocation", () => {
  it("accepts an exact phone match", () => {
    expect(matchLocation({ title: "Totally Different", phone: "098765 43210" }, clients)).toMatchObject({ kind: "match", clientId: "a", method: "auto_phone" });
  });

  it("does not connect on a name alone", () => {
    expect(matchLocation({ title: "Green Leaf Cafe", phone: "+91 80 1111 2222" }, clients).kind).toBe("none");
  });

  it("accepts name and address together", () => {
    expect(matchLocation({ title: "Green Leaf Cafe", address: "12 MG Road, Bengaluru" }, clients)).toMatchObject({ kind: "match", clientId: "b" });
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

import { describe, expect, it } from "vitest";
import { pickImages, rotationOrder, type RotationImage } from "./rotation";

const created = new Date("2026-01-01T00:00:00Z");
const image = (id: string, used?: string): RotationImage => ({ id, createdAt: created, lastUsedAt: used ? new Date(used) : null });

describe("rotation", () => {
  it("uses never-used images first, then the oldest", () => {
    const order = rotationOrder([image("b", "2026-03-01"), image("a", "2026-02-01"), image("c")]);
    expect(order.map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("does not repeat until the folder is exhausted", () => {
    const images = [image("a"), image("b"), image("c")];
    const seen: string[] = [];
    let clock = Date.parse("2026-02-01");
    for (let i = 0; i < 6; i++) {
      const [next] = rotationOrder(images);
      seen.push(next!.id);
      next!.lastUsedAt = new Date((clock += 1000));
    }
    expect(new Set(seen.slice(0, 3)).size).toBe(3);
    expect(seen.slice(3)).toEqual(seen.slice(0, 3));
  });

  it("skips reserved images and never returns more than exist", () => {
    const picked = pickImages([image("a"), image("b")], new Set(["a"]), 5);
    expect(picked.map((i) => i.id)).toEqual(["b"]);
  });
});

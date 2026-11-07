import { describe, expect, it } from "vitest";
import { retryDelayMs } from "./retry";
import { slugifyFilename } from "./filename";

describe("slugifyFilename", () => {
  it("makes lowercase hyphenated names", () => {
    expect(slugifyFilename("Sunrise Dental & Implants - Chennai.JPG".toLowerCase())).toBe("sunrise-dental-and-implants-chennai");
  });

  it("drops quotes and punctuation a model might add", () => {
    expect(slugifyFilename('"Café Interior, Bengaluru!"')).toBe("cafe-interior-bengaluru");
  });

  it("caps the length without a trailing hyphen", () => {
    const slug = slugifyFilename(`${"word ".repeat(40)}`);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("retryDelayMs", () => {
  it("backs off exponentially", () => {
    expect([1, 2, 3].map(retryDelayMs)).toEqual([60_000, 300_000, 1_500_000]);
  });
});

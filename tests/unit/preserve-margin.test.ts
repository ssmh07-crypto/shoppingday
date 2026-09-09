import { describe, expect, it } from "vitest";
import { preserveMarginPrice } from "../../src/modules/pricing/preserve-margin";

describe("preserve gross margin", () => {
  it("adjusts up and down using the existing ratio", () => {
    expect(preserveMarginPrice(10000, 15000, 12000)).toBe(18000);
    expect(preserveMarginPrice(10000, 15000, 8000)).toBe(12000);
    expect(preserveMarginPrice(3000, 4000, 3100)).toBe(4140);
  });
  it("does not invent prices for missing, zero, invalid or unchanged costs", () => {
    expect(preserveMarginPrice(null, 15000, 12000)).toBeNull();
    expect(preserveMarginPrice(10000, null, 12000)).toBeNull();
    expect(preserveMarginPrice(0, 15000, 12000)).toBeNull();
    expect(preserveMarginPrice(10000, 15000, 0)).toBeNull();
    expect(preserveMarginPrice(10000, 15000, 10000)).toBeNull();
    expect(preserveMarginPrice(10000, 15000, Infinity)).toBeNull();
    expect(preserveMarginPrice(1, 2147483647, 12000)).toBeNull();
  });
});

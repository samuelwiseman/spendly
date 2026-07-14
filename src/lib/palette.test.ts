import { describe, expect, it } from "vitest";
import { PALETTE, nextColor } from "./palette";

describe("nextColor", () => {
  it("assigns colours in palette order", () => {
    expect(nextColor(0)).toBe(PALETTE[0]);
    expect(nextColor(1)).toBe(PALETTE[1]);
  });
  it("cycles once the palette is exhausted", () => {
    expect(nextColor(PALETTE.length)).toBe(PALETTE[0]);
    expect(nextColor(PALETTE.length + 1)).toBe(PALETTE[1]);
  });
  it("has at least 8 distinct colours", () => {
    expect(new Set(PALETTE).size).toBeGreaterThanOrEqual(8);
  });
});

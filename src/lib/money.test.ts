import { describe, expect, it } from "vitest";
import { formatGBP, formatGBPCompact, toPence } from "./money";

describe("toPence", () => {
  it("parses whole pounds", () => expect(toPence("12")).toBe(1200));
  it("parses two decimal places", () => expect(toPence("12.34")).toBe(1234));
  it("pads a single decimal place", () => expect(toPence("12.3")).toBe(1230));
  it("strips currency symbols and separators", () =>
    expect(toPence("£1,234.56")).toBe(123456));
  it("accepts a number", () => expect(toPence(12.34)).toBe(1234));
  it("rejects negatives", () => expect(() => toPence("-1")).toThrow(RangeError));
  it("rejects non-numeric input", () => expect(() => toPence("abc")).toThrow(RangeError));
  it("rejects sub-penny precision", () => expect(() => toPence("1.234")).toThrow(RangeError));

  // This is the entire reason amount_pence exists.
  it("does not drift when summed", () => {
    const total = toPence("0.1") + toPence("0.2");
    expect(total).toBe(30);
    expect(formatGBP(total)).toBe("£0.30");
  });
});

describe("formatGBP", () => {
  it("formats with thousands separators", () => expect(formatGBP(134020)).toBe("£1,340.20"));
  it("formats zero", () => expect(formatGBP(0)).toBe("£0.00"));
});

describe("formatGBPCompact", () => {
  it("abbreviates thousands", () => expect(formatGBPCompact(241280)).toBe("£2.4k"));
  it("drops a trailing zero", () => expect(formatGBPCompact(200000)).toBe("£2k"));
  it("leaves small values whole", () => expect(formatGBPCompact(64018)).toBe("£640"));
});

import { describe, expect, it } from "vitest";
import { addMonths, formatMonthLong, isValidMonth, resolveMonth } from "./months";

describe("resolveMonth", () => {
  it("keeps a valid month", () => expect(resolveMonth("2026-03")).toBe("2026-03"));
  it("falls back when undefined", () => expect(resolveMonth(undefined)).toMatch(/^\d{4}-\d{2}$/));
  it("falls back when invalid", () => expect(resolveMonth("2026-13")).toMatch(/^\d{4}-\d{2}$/));
  it("falls back when a day is supplied", () => expect(resolveMonth("2026-03-01")).toMatch(/^\d{4}-\d{2}$/));
});

describe("addMonths", () => {
  it("steps forward", () => expect(addMonths("2026-07", 1)).toBe("2026-08"));
  it("steps backward", () => expect(addMonths("2026-07", -1)).toBe("2026-06"));
  it("rolls over the year end", () => expect(addMonths("2026-12", 1)).toBe("2027-01"));
  it("rolls back over the year start", () => expect(addMonths("2026-01", -1)).toBe("2025-12"));
  it("pads single-digit months", () => expect(addMonths("2026-10", -1)).toBe("2026-09"));
});

describe("isValidMonth", () => {
  it("accepts YYYY-MM", () => expect(isValidMonth("2026-07")).toBe(true));
  it("rejects a day component", () => expect(isValidMonth("2026-07-01")).toBe(false));
  it("rejects month zero", () => expect(isValidMonth("2026-00")).toBe(false));
  it("rejects month thirteen", () => expect(isValidMonth("2026-13")).toBe(false));
  it("rejects nonsense", () => expect(isValidMonth("july")).toBe(false));
});

describe("formatMonthLong", () => {
  it("renders a human month", () => expect(formatMonthLong("2026-07")).toBe("July 2026"));
});

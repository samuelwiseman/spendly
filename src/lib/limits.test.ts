import { describe, expect, it } from "vitest";
import { ENTRY_CAP, exceedsCap } from "./limits";

describe("exceedsCap", () => {
  it("allows a user below the cap", () => expect(exceedsCap(ENTRY_CAP - 1)).toBe(false));
  it("rejects a user at the cap", () => expect(exceedsCap(ENTRY_CAP)).toBe(true));
  it("rejects a user above the cap", () => expect(exceedsCap(ENTRY_CAP + 1)).toBe(true));
  it("caps at five thousand", () => expect(ENTRY_CAP).toBe(5000));
});

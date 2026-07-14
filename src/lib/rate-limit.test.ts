import { beforeEach, describe, expect, it } from "vitest";
import { CAPACITY, WINDOW_MS, consume, __reset } from "./rate-limit";

beforeEach(() => __reset());

describe("consume", () => {
  it("allows up to capacity", () => {
    for (let i = 0; i < CAPACITY; i++) expect(consume(1, 0)).toBe(true);
  });

  it("rejects beyond capacity", () => {
    for (let i = 0; i < CAPACITY; i++) consume(1, 0);
    expect(consume(1, 0)).toBe(false);
  });

  it("refills fully after the window", () => {
    for (let i = 0; i < CAPACITY; i++) consume(1, 0);
    expect(consume(1, WINDOW_MS)).toBe(true);
  });

  it("refills proportionally within the window", () => {
    for (let i = 0; i < CAPACITY; i++) consume(1, 0);
    expect(consume(1, WINDOW_MS / 2)).toBe(true);
  });

  it("tracks users independently", () => {
    for (let i = 0; i < CAPACITY; i++) consume(1, 0);
    expect(consume(1, 0)).toBe(false);
    expect(consume(2, 0)).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { stepIndex, swipeDir } from "../talk";

describe("stepIndex", () => {
  it("wraps forward and back", () => {
    expect(stepIndex(9, 10, 1)).toBe(0);
    expect(stepIndex(0, 10, -1)).toBe(9);
    expect(stepIndex(3, 10, 1)).toBe(4);
    expect(stepIndex(3, 10, -1)).toBe(2);
  });
});

describe("swipeDir", () => {
  it("swipe left is next, right is previous", () => {
    expect(swipeDir(-80)).toBe(1);
    expect(swipeDir(80)).toBe(-1);
  });
  it("short drags are taps", () => {
    expect(swipeDir(10)).toBe(0);
    expect(swipeDir(-41)).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import { shouldReload } from "../reloadOnDeploy";

describe("shouldReload", () => {
  it("reloads for a different build when idle", () => {
    expect(shouldReload("2", "1", true)).toBe(true);
  });
  it("waits while busy", () => {
    expect(shouldReload("2", "1", false)).toBe(false);
  });
  it("ignores a same build, a failed check, and dev", () => {
    expect(shouldReload("1", "1", true)).toBe(false);
    expect(shouldReload(null, "1", true)).toBe(false);
    expect(shouldReload("2", "dev", true)).toBe(false);
  });
});

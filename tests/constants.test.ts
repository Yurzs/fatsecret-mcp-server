import { describe, it, expect } from "vitest";
import {
  dateToFatSecretInt,
  dateStringToFatSecretInt,
  fatSecretIntToDateString,
  todayAsFatSecretInt,
} from "../src/constants.js";

describe("Date conversion utilities", () => {
  it("converts epoch start to 0", () => {
    const epoch = new Date("1970-01-01T00:00:00Z");
    expect(dateToFatSecretInt(epoch)).toBe(0);
  });

  it("converts a known date correctly", () => {
    // 2026-05-16 = 20,589 days since epoch
    const result = dateStringToFatSecretInt("2026-05-16");
    expect(result).toBe(20589);
  });

  it("converts FatSecret int back to date string", () => {
    expect(fatSecretIntToDateString(20589)).toBe("2026-05-16");
  });

  it("round-trips date string -> int -> date string", () => {
    const dates = ["2026-01-01", "2026-05-16", "2026-12-31", "2024-02-29"];
    for (const d of dates) {
      const int = dateStringToFatSecretInt(d);
      const back = fatSecretIntToDateString(int);
      expect(back).toBe(d);
    }
  });

  it("todayAsFatSecretInt returns a reasonable number", () => {
    const today = todayAsFatSecretInt();
    // Should be roughly 20,000+ days since 1970
    expect(today).toBeGreaterThan(19000);
    expect(today).toBeLessThan(25000);
  });

  it("handles boundary dates correctly", () => {
    expect(dateStringToFatSecretInt("1970-01-01")).toBe(0);
    expect(dateStringToFatSecretInt("1970-01-02")).toBe(1);
    expect(dateStringToFatSecretInt("2000-01-01")).toBe(10957);
  });
});

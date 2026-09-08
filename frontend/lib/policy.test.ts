import { describe, expect, it } from "vitest";
import { fromContractPolicy, toContractPolicy, validatePolicy } from "./policy";

describe("policy conversion", () => {
  it("scales the threshold to 6 decimals", () => {
    expect(toContractPolicy({ levelBelow: 1, levelAbove: 2, threshold: 1000, maxRisk: 50 }))
      .toEqual({ levelBelow: 1, levelAbove: 2, threshold: 1_000_000_000n, maxRisk: 50 });
  });

  it("round-trips", () => {
    const p = { levelBelow: 1, levelAbove: 2, threshold: 1000, maxRisk: 50 } as const;
    expect(fromContractPolicy(toContractPolicy(p))).toEqual(p);
  });

  it("rejects a threshold with nothing under it", () => {
    expect(validatePolicy({ levelBelow: 0, levelAbove: 2, threshold: 1000, maxRisk: 50 }))
      .toMatch(/below/i);
  });

  it("rejects a threshold over the contract cap", () => {
    expect(validatePolicy({ levelBelow: 1, levelAbove: 2, threshold: 10_001, maxRisk: 50 }))
      .toMatch(/10,000/);
  });

  it("rejects a risk ceiling over the contract cap", () => {
    expect(validatePolicy({ levelBelow: 0, levelAbove: 0, threshold: 0, maxRisk: 81 }))
      .toMatch(/80/);
  });

  it("accepts screening-only", () => {
    expect(validatePolicy({ levelBelow: 0, levelAbove: 0, threshold: 0, maxRisk: 80 })).toBeNull();
  });

  it("rejects an empty object", () => {
    expect(validatePolicy({} as never)).toMatch(/whole number/i);
  });

  it("rejects null", () => {
    expect(validatePolicy(null as never)).toMatch(/policy is required/i);
  });

  it("rejects a negative maxRisk", () => {
    expect(validatePolicy({ levelBelow: 0, levelAbove: 0, threshold: 0, maxRisk: -1 }))
      .toMatch(/whole number/i);
  });

  it("rejects a fractional threshold", () => {
    expect(validatePolicy({ levelBelow: 0, levelAbove: 0, threshold: 1.5, maxRisk: 80 }))
      .toMatch(/whole number/i);
  });
});

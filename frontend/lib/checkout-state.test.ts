import { describe, expect, it } from "vitest";
import { nextStep, requiredLevel } from "./checkout-state";
import type { Policy } from "./data";

const SCREENING_ONLY: Policy = { levelBelow: 0, levelAbove: 0, threshold: 0, maxRisk: 80 };
const TIERED: Policy = { levelBelow: 1, levelAbove: 2, threshold: 1000, maxRisk: 50 };

const base = {
  policy: SCREENING_ONLY,
  amount: 250_000_000n,
  allowance: 10_000_000_000n,
  verified: true,
  connected: true,
};

describe("requiredLevel", () => {
  it("asks for nothing on a screening-only gateway", () => {
    expect(requiredLevel(SCREENING_ONLY, 999_999_000_000n)).toBe(0);
  });

  it("uses levelBelow under the threshold", () => {
    expect(requiredLevel(TIERED, 999_000_000n)).toBe(1);
  });

  it("uses levelAbove at the threshold, matching the contract's >=", () => {
    expect(requiredLevel(TIERED, 1_000_000_000n)).toBe(2);
  });

  it("uses levelAbove above the threshold", () => {
    expect(requiredLevel(TIERED, 1_000_000_001n)).toBe(2);
  });
});

describe("nextStep", () => {
  it("asks for a wallet first", () => {
    expect(nextStep({ ...base, connected: false })).toEqual({ kind: "connect" });
  });

  it("asks for an amount before anything else once connected", () => {
    expect(nextStep({ ...base, amount: null })).toEqual({ kind: "amount" });
  });

  it("pays straight away when the gateway asks for nothing and the allowance covers it", () => {
    expect(nextStep(base)).toEqual({ kind: "pay" });
  });

  it("asks to approve when the allowance falls short", () => {
    expect(nextStep({ ...base, allowance: 249_999_999n })).toEqual({
      kind: "approve",
      short: 1n,
    });
  });

  it("asks to approve when there is no allowance at all", () => {
    expect(nextStep({ ...base, allowance: 0n })).toEqual({
      kind: "approve",
      short: 250_000_000n,
    });
  });

  it("does not ask to approve when the allowance is exactly the amount", () => {
    expect(nextStep({ ...base, allowance: 250_000_000n })).toEqual({ kind: "pay" });
  });

  it("stops at the identity check before spending gas on an approval", () => {
    expect(
      nextStep({ ...base, policy: TIERED, allowance: 0n, verified: false }),
    ).toEqual({ kind: "unverified", level: 1 });
  });

  it("reports the level the amount actually needs", () => {
    expect(
      nextStep({ ...base, policy: TIERED, amount: 1_000_000_000n, verified: false }),
    ).toEqual({ kind: "unverified", level: 2 });
  });

  it("lets a verified payer through to the allowance check", () => {
    expect(
      nextStep({ ...base, policy: TIERED, allowance: 0n, verified: true }),
    ).toEqual({ kind: "approve", short: 250_000_000n });
  });

  it("ignores the attestation entirely when the gateway asks for nothing", () => {
    expect(nextStep({ ...base, verified: false })).toEqual({ kind: "pay" });
  });
});

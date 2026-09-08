import type { Policy } from "./data";

export const MAX_THRESHOLD = 10_000;
export const MAX_RISK = 80;
const UNITS = 1_000_000n; // both USDC and EURC are 6-decimal

export type ContractPolicy = {
  levelBelow: number;
  levelAbove: number;
  threshold: bigint;
  maxRisk: number;
};

export const toContractPolicy = (p: Policy): ContractPolicy => ({
  levelBelow: p.levelBelow,
  levelAbove: p.levelAbove,
  threshold: BigInt(p.threshold) * UNITS,
  maxRisk: p.maxRisk,
});

export const fromContractPolicy = (p: ContractPolicy): Policy => ({
  levelBelow: p.levelBelow as 0 | 1 | 2,
  levelAbove: p.levelAbove as 0 | 1 | 2,
  threshold: Number(p.threshold / UNITS),
  maxRisk: p.maxRisk,
});

const FIELDS = ["levelBelow", "levelAbove", "threshold", "maxRisk"] as const;

/** Mirrors MerchantGateway._validatePolicy. Returns an error string or null. */
export function validatePolicy(p: Policy): string | null {
  if (typeof p !== "object" || p === null) return "A policy is required.";
  for (const field of FIELDS) {
    const v = (p as Record<string, unknown>)[field];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0)
      return `${field} must be a whole number, zero or more.`;
  }
  if (p.levelBelow > 2 || p.levelAbove > 2) return "Identity levels go up to 2.";
  if (p.levelAbove !== 0 && p.levelBelow === 0)
    return "Asking for a passport above the threshold needs at least a selfie check below it.";
  if (p.threshold > MAX_THRESHOLD) return "The contract caps the threshold at 10,000.";
  if (p.maxRisk > MAX_RISK) return "The contract caps the risk ceiling at 80.";
  return null;
}

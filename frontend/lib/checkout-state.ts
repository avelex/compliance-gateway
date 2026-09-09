import type { Policy } from "./data";
import { toContractPolicy } from "./policy";

export type CheckoutInput = {
  policy: Policy;
  /** Base units. `null` means nothing valid has been typed yet. */
  amount: bigint | null;
  /** ERC20 allowance the payer has already granted the gateway, in base units. */
  allowance: bigint;
  /** registry.isValid(gate, wallet, requiredLevel). Irrelevant when the level is 0. */
  verified: boolean;
  connected: boolean;
};

export type CheckoutStep =
  | { kind: "connect" }
  | { kind: "amount" }
  | { kind: "unverified"; level: 1 | 2 }
  | { kind: "approve"; short: bigint }
  | { kind: "pay" };

/** Mirrors MerchantGateway.pay: `amount >= p.threshold ? p.levelAbove : p.levelBelow`.
 *  Policy.threshold is in human units here, so it goes through the same conversion
 *  the dashboard uses to write it. */
export function requiredLevel(policy: Policy, amountUnits: bigint): 0 | 1 | 2 {
  const threshold = toContractPolicy(policy).threshold;
  return amountUnits >= threshold ? policy.levelAbove : policy.levelBelow;
}

export function nextStep(input: CheckoutInput): CheckoutStep {
  if (!input.connected) return { kind: "connect" };
  if (input.amount === null) return { kind: "amount" };

  const level = requiredLevel(input.policy, input.amount);
  // Before the allowance, not after: an approval the payer cannot follow with a
  // payment is gas spent for nothing.
  if (level > 0 && !input.verified) return { kind: "unverified", level };

  if (input.allowance < input.amount)
    return { kind: "approve", short: input.amount - input.allowance };

  return { kind: "pay" };
}

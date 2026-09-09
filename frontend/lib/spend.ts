
/** MerchantGateway.SPEND_WINDOW = 24 hours. */
export const SPEND_WINDOW_SECONDS = 86_400n;

export type SpendWindow = { windowStart: bigint; amount: bigint };

/** How much the payer can still send before the gateway starts asking for the
 *  higher identity level. Mirrors the window roll in MerchantGateway.pay.
 *  Returns null when the gateway has no threshold, where there is no counter at all. */
export function remaining(
  spend: SpendWindow,
  thresholdUnits: bigint,
  nowSeconds: bigint,
): { left: bigint; resetsAt: bigint } | null {
  if (thresholdUnits === 0n) return null;

  const expired = nowSeconds - spend.windowStart >= SPEND_WINDOW_SECONDS;
  if (expired) {
    // pay() would reset the window on the next payment, so the payer's real
    // headroom right now is the whole threshold.
    return { left: thresholdUnits, resetsAt: nowSeconds + SPEND_WINDOW_SECONDS };
  }

  const left = thresholdUnits > spend.amount ? thresholdUnits - spend.amount : 0n;
  return { left, resetsAt: spend.windowStart + SPEND_WINDOW_SECONDS };
}

/** The browser holds the whole retry loop (SPEC §5): the relay keeps no attempt counter
 *  and no give-up rule, so all three numbers live here. */

/** The relay drains once a minute, so anything faster is noise on a deduplicated key. */
export const ENQUEUE_EVERY_MS = 60_000;
/** After this we stop claiming anything is still happening. */
export const GIVE_UP_MS = 300_000;
/** How often the chain is re-read while waiting. */
export const POLL_EVERY_MS = 5_000;

export type WaitInput = {
  /** When the WebSDK told us it was done. */
  startedAt: number;
  /** null means nothing has been queued yet. */
  lastEnqueuedAt: number | null;
  /** registry.isValid(gate, wallet, level), as last read. */
  verified: boolean;
  now: number;
};

export type WaitState =
  | { kind: "verified" }
  | { kind: "waiting"; secondsLeft: number; enqueueNow: boolean }
  | { kind: "timeout" };

export function waitState({ startedAt, lastEnqueuedAt, verified, now }: WaitInput): WaitState {
  // Success first, and deliberately before the deadline: an attestation that lands one
  // second late is still an attestation, and telling the payer otherwise would be false.
  if (verified) return { kind: "verified" };

  const elapsed = now - startedAt;
  if (elapsed >= GIVE_UP_MS) return { kind: "timeout" };

  return {
    kind: "waiting",
    secondsLeft: Math.ceil((GIVE_UP_MS - elapsed) / 1000),
    enqueueNow: lastEnqueuedAt === null || now - lastEnqueuedAt >= ENQUEUE_EVERY_MS,
  };
}

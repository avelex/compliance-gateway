import type { Policy } from "./data";

/** Policy changes waiting on a teammate, between the first click and the last.
 *
 *  In memory on purpose (SPEC §1, §8): the only state with no home in Privy, and a database
 *  for it would be the whole of our persistence layer. The cost is named — this REQUIRES a
 *  long-lived process. On serverless the second approval lands in a different instance, never
 *  finds the first, and the failure is silent.
 *  ponytail: process memory; move to KV the day this deploys to lambdas.
 *
 *  `token` is the asker's Privy access token, kept because only the wallet's owner can
 *  authorize its requests and the teammate's token cannot stand in for it. It is a credential:
 *  it never enters a response body, a log line, or an error message, and it is dropped the
 *  moment the approval is sent or expires — a window shorter than the token's own lifetime.
 *  That drop is not just lazy (get/approve pruning their own entry) — `put` sweeps every
 *  expired entry on the way in, so a change nobody ever opens still gets its token evicted
 *  once the next change is submitted, instead of sitting in the Map until the process restarts. */
export type PendingApproval = {
  id: string;
  did: string;
  walletId: string;
  token: string;
  gate: `0x${string}`;
  policy: Policy;
  threshold: number;
  approvals: string[];
  expiresAt: number;
};

const store = new Map<string, PendingApproval>();

/** Test-only. Module state outlives a test file otherwise. */
export function _reset() {
  store.clear();
}

/** Test-only. Lets a test prove an entry is gone without touching it by id — get()/approve()
 *  would prune it themselves and mask whether the sweep in put() actually did the work. */
export function _size() {
  return store.size;
}

/** Evicts every expired entry. Called from `put` so a change nobody ever opens still gets its
 *  token dropped — get/approve only prune the one id they were asked about, which does nothing
 *  for a link that's never clicked. ponytail: O(n) scan over the whole map; fine at the size a
 *  single merchant's pending approvals reach, revisit if this ever serves many merchants at once. */
function sweep() {
  const now = Date.now();
  for (const [id, a] of store) if (a.expiresAt <= now) store.delete(id);
}

/** The asker's own click counts — they filled in the form. */
export function put(a: Omit<PendingApproval, "approvals">): PendingApproval {
  sweep();
  const approval = { ...a, approvals: [a.did] };
  store.set(a.id, approval);
  return approval;
}

export function get(id: string): PendingApproval | undefined {
  const approval = store.get(id);
  if (!approval) return undefined;
  if (approval.expiresAt <= Date.now()) {
    store.delete(id);
    return undefined;
  }
  return approval;
}

export function approve(
  id: string,
  did: string,
):
  | { ok: true; approval: PendingApproval; ready: boolean }
  | { ok: false; reason: "unknown" | "expired" | "duplicate" } {
  const raw = store.get(id);
  if (!raw) return { ok: false, reason: "unknown" };
  if (raw.expiresAt <= Date.now()) {
    store.delete(id);
    return { ok: false, reason: "expired" };
  }
  if (raw.approvals.includes(did)) return { ok: false, reason: "duplicate" };

  raw.approvals.push(did);
  return { ok: true, approval: raw, ready: raw.approvals.length >= raw.threshold };
}

/** Removes and returns it. Removal is the point: a change must send at most once. */
export function take(id: string): PendingApproval | undefined {
  const approval = store.get(id);
  store.delete(id);
  return approval;
}

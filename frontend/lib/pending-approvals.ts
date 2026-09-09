import type { Policy } from "./data";
import type { PreparedRequest, SignableRequest } from "./privy-request";

/** Policy changes waiting on a teammate, between the first signature and the last.
 *
 *  In memory on purpose (SPEC §1, §8): the only state with no home in Privy, and a database for
 *  it would be the whole of our persistence layer. The cost is named — this REQUIRES a long-lived
 *  process. On serverless the second signature lands in a different instance, never finds the
 *  first, and the failure is silent.
 *  ponytail: process memory; move to KV the day this deploys to lambdas.
 *
 *  What is NOT here any more: the asker's Privy access token. The previous design held one so the
 *  server could sign on their behalf; the server no longer signs anything. It holds the bytes to
 *  be signed — public by construction, the merchant's own browser has to read them — and the
 *  signatures other people produced over exactly those bytes. There is no credential to leak. */
export type PendingApproval = {
  id: string;
  /** The asker. Kept for the "requested by" line and to gate who may read this. */
  did: string;
  gate: `0x${string}`;
  policy: Policy;
  threshold: number;
  /** Sent verbatim. Rebuilding any part of it invalidates every signature already collected. */
  prepared: PreparedRequest;
  /** Handed to each approver's browser to sign. */
  signable: SignableRequest;
  /** Who has signed, in the order they signed. */
  approvals: string[];
  /** Their signatures, index-aligned with `approvals`. */
  signatures: string[];
  expiresAt: number;
};

const store = new Map<string, PendingApproval>();

/** Test-only. Module state outlives a test file otherwise. */
export function _reset() {
  store.clear();
}

/** Test-only. Lets a test prove an entry is gone without touching it by id — get()/addSignature()
 *  would prune it themselves and mask whether the sweep in put() did the work. */
export function _size() {
  return store.size;
}

/** Evicts every expired entry. Called from `put` so a change nobody ever opens still leaves.
 *  ponytail: O(n) scan over the whole map; fine at the size one merchant's pending approvals
 *  reach, revisit if this ever serves many merchants at once. */
function sweep() {
  const now = Date.now();
  for (const [id, a] of store) if (a.expiresAt <= now) store.delete(id);
}

/** Stored with no signatures: the asker signs the same payload as everyone else, in their own
 *  browser, in the step right after this one. */
export function put(a: Omit<PendingApproval, "approvals" | "signatures">): PendingApproval {
  sweep();
  const approval = { ...a, approvals: [], signatures: [] };
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

export function addSignature(
  id: string,
  did: string,
  signature: string,
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
  raw.signatures.push(signature);
  return { ok: true, approval: raw, ready: raw.signatures.length >= raw.threshold };
}

/** Removes and returns it. Removal is the point: a change must send at most once. */
export function take(id: string): PendingApproval | undefined {
  const approval = store.get(id);
  store.delete(id);
  return approval;
}

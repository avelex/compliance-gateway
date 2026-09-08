import { describe, it, expect, beforeEach } from "vitest";
import { put, get, approve, take, _reset, _size } from "./pending-approvals";
import type { Policy } from "./data";

const policy: Policy = { levelBelow: 1, levelAbove: 2, threshold: 500, maxRisk: 40 };
const base = {
  id: "a1",
  did: "did:privy:alice",
  walletId: "w1",
  token: "alice-access-token",
  gate: "0x1111111111111111111111111111111111111111" as const,
  policy,
  threshold: 2,
  expiresAt: Date.now() + 60_000,
};

beforeEach(() => _reset());

describe("pending approvals", () => {
  it("counts the asker's own click", () => {
    // The person who filled in the form has approved it by definition. Anything else makes
    // "2 of 2" mean three clicks.
    expect(put(base).approvals).toEqual(["did:privy:alice"]);
  });

  it("is ready once a second person approves", () => {
    put(base);
    expect(approve("a1", "did:privy:bob")).toMatchObject({ ok: true, ready: true });
  });

  it("refuses a second approval from the same person", () => {
    put(base);
    // Without this, one person clicking their own link twice satisfies a 2-of-2 by themselves,
    // which is the entire property the threshold exists to provide.
    expect(approve("a1", "did:privy:alice")).toEqual({ ok: false, reason: "duplicate" });
  });

  it("refuses an expired approval and forgets it", () => {
    put({ ...base, expiresAt: Date.now() - 1 });
    expect(approve("a1", "did:privy:bob")).toEqual({ ok: false, reason: "expired" });
    // The access token must not outlive the window it was kept for.
    expect(get("a1")).toBeUndefined();
  });

  it("refuses an unknown id", () => {
    expect(approve("nope", "did:privy:bob")).toEqual({ ok: false, reason: "unknown" });
  });

  it("evicts an expired entry nobody ever opened, on the next put()", () => {
    // No teammate clicked the link, so nothing ever calls get/approve/take with "a1" — those
    // would prune it themselves and prove nothing about put()'s own sweep.
    put({ ...base, expiresAt: Date.now() - 1 });
    expect(_size()).toBe(1);
    put({ ...base, id: "a2" });
    expect(_size()).toBe(1); // a1 swept away, only a2 (still live) remains
  });

  it("take() removes it, so a change cannot be sent twice", () => {
    put(base);
    approve("a1", "did:privy:bob");
    expect(take("a1")).toBeDefined();
    expect(take("a1")).toBeUndefined();
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { put, get, addSignature, take, _reset, _size } from "./pending-approvals";
import type { Policy } from "./data";

const policy: Policy = { levelBelow: 1, levelAbove: 2, threshold: 500, maxRisk: 40 };
const prepared = { url: "https://api.privy.io/v1/wallets/w1/rpc", body: { a: 1 }, expiry: "1788888888888" };
const signable = {
  version: 1 as const,
  method: "POST" as const,
  url: prepared.url,
  body: prepared.body,
  headers: { "privy-app-id": "app", "privy-request-expiry": prepared.expiry },
};
const base = {
  id: "a1",
  did: "did:privy:alice",
  gate: "0x1111111111111111111111111111111111111111" as const,
  policy,
  threshold: 2,
  prepared,
  signable,
  expiresAt: Date.now() + 60_000,
};

beforeEach(() => _reset());

describe("pending approvals", () => {
  it("starts empty — the asker's signature arrives separately", () => {
    // The asker signs the same payload everyone else signs. Counting their click before their
    // signature exists would let a 2-of-2 go out with one signature and be rejected by Privy.
    expect(put(base).signatures).toEqual([]);
  });

  it("is ready once the threshold of signatures is in", () => {
    put(base);
    expect(addSignature("a1", "did:privy:alice", "sig-a")).toMatchObject({ ok: true, ready: false });
    expect(addSignature("a1", "did:privy:bob", "sig-b")).toMatchObject({ ok: true, ready: true });
  });

  it("collects the signatures in order for submission", () => {
    put(base);
    addSignature("a1", "did:privy:alice", "sig-a");
    const r = addSignature("a1", "did:privy:bob", "sig-b");
    expect(r.ok && r.approval.signatures).toEqual(["sig-a", "sig-b"]);
  });

  it("refuses a second signature from the same person", () => {
    put(base);
    addSignature("a1", "did:privy:alice", "sig-a");
    // Without this, one person signing their own link twice satisfies a 2-of-2 alone — the whole
    // property the threshold exists to provide. Privy would reject the duplicate anyway; this
    // says so in a sentence instead of a 401.
    expect(addSignature("a1", "did:privy:alice", "sig-a-again")).toEqual({ ok: false, reason: "duplicate" });
  });

  it("refuses an expired approval and forgets it", () => {
    put({ ...base, expiresAt: Date.now() - 1 });
    expect(addSignature("a1", "did:privy:bob", "sig-b")).toEqual({ ok: false, reason: "expired" });
    expect(_size()).toBe(0);
  });

  it("hides an expired approval from get()", () => {
    put({ ...base, expiresAt: Date.now() - 1 });
    expect(get("a1")).toBeUndefined();
  });

  it("sweeps expired entries when a new one is stored", () => {
    put({ ...base, id: "old", expiresAt: Date.now() - 1 });
    put({ ...base, id: "new" });
    // A change nobody ever opens still has to leave: get/addSignature only prune the id they
    // were asked about, which does nothing for a link that is never clicked.
    expect(_size()).toBe(1);
    expect(get("old")).toBeUndefined();
  });

  it("take() removes it so a change is sent at most once", () => {
    put(base);
    expect(take("a1")?.id).toBe("a1");
    expect(take("a1")).toBeUndefined();
  });

  it("refuses a signature for an unknown id", () => {
    expect(addSignature("nope", "did:privy:bob", "sig")).toEqual({ ok: false, reason: "unknown" });
  });
});

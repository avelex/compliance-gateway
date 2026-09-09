import { describe, it, expect, vi, beforeEach } from "vitest";

const get = vi.fn();
vi.mock("./privy-server", () => ({ getPrivy: () => ({ transactions: () => ({ get }) }) }));

const { waitForHash } = await import("./privy-request");

beforeEach(() => get.mockReset());

describe("waitForHash", () => {
  it("keeps asking until the bundler fills the hash in", async () => {
    // The bug this exists for: a sponsored deploy answers with an empty hash, so asking once
    // reports a deploy that lands perfectly well as "we could not confirm it".
    get
      .mockResolvedValueOnce({ status: "broadcasted", transaction_hash: null })
      .mockResolvedValueOnce({ status: "confirmed", transaction_hash: "0xabc", user_operation_hash: "0xdef" });

    expect(await waitForHash("tx_1", 200, 5)).toEqual({ hash: "0xabc", userOpHash: "0xdef" });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("gives up when the budget runs out", async () => {
    get.mockResolvedValue({ status: "broadcasted", transaction_hash: null });
    expect(await waitForHash("tx_1", 30, 5)).toEqual({});
  });

  it("stops early on a status that never gets a hash", async () => {
    get.mockResolvedValue({ status: "failed", transaction_hash: null });
    expect(await waitForHash("tx_1", 5_000, 5)).toEqual({});
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("does not call Privy without a transaction id", async () => {
    expect(await waitForHash(undefined, 5_000, 5)).toEqual({});
    expect(get).not.toHaveBeenCalled();
  });
});

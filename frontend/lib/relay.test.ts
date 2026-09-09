import { afterEach, describe, expect, it, vi } from "vitest";
import { RelayFailure, enqueue, mintToken } from "./relay";

const GATE = "0x1111111111111111111111111111111111111111" as const;
const WALLET = "0x2222222222222222222222222222222222222222" as const;

const respond = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mintToken", () => {
  it("posts the gate and wallet and returns the token", async () => {
    const fetchMock = respond(200, { token: "_act-sbx-jwt-abc" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(mintToken(GATE, WALLET)).resolves.toBe("_act-sbx-jwt-abc");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/relay/token");
    expect(JSON.parse(init.body)).toEqual({ gate: GATE, wallet: WALLET });
  });

  it("reports a rate limit as its own kind, so the screen can say to wait", async () => {
    vi.stubGlobal("fetch", respond(429, {}));
    await expect(mintToken(GATE, WALLET)).rejects.toMatchObject({ kind: "rate-limited" });
  });

  it("treats a 5xx as the provider being unavailable", async () => {
    vi.stubGlobal("fetch", respond(502, { error: "down" }));
    await expect(mintToken(GATE, WALLET)).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("treats a network failure as unavailable, not as a bad request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(mintToken(GATE, WALLET)).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("throws when the relay answers 200 without a token", async () => {
    vi.stubGlobal("fetch", respond(200, {}));
    await expect(mintToken(GATE, WALLET)).rejects.toBeInstanceOf(RelayFailure);
  });
});

describe("enqueue", () => {
  it("posts the verify item and resolves on 202", async () => {
    const fetchMock = respond(202, {});
    vi.stubGlobal("fetch", fetchMock);

    await expect(enqueue(GATE, WALLET, 2)).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/relay/queue");
    expect(JSON.parse(init.body)).toEqual({ kind: "verify", gate: GATE, wallet: WALLET, level: 2 });
  });

  it("fails loudly when the relay rejects the item", async () => {
    vi.stubGlobal("fetch", respond(400, { error: "bad gate" }));
    await expect(enqueue(GATE, WALLET, 2)).rejects.toMatchObject({ kind: "bad-request" });
  });
});

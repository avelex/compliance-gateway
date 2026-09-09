import { describe, expect, it } from "vitest";
import { remaining, SPEND_WINDOW_SECONDS } from "./spend";

const START = 1_757_000_000n;
const THRESHOLD = 1_000_000_000n; // 1,000 tokens at 6 decimals

describe("remaining", () => {
  it("has nothing to report when the gateway has no threshold", () => {
    expect(remaining({ windowStart: START, amount: 0n }, 0n, START + 60n)).toBeNull();
  });

  it("reports the full threshold before anything is spent", () => {
    expect(remaining({ windowStart: 0n, amount: 0n }, THRESHOLD, START)).toEqual({
      left: THRESHOLD,
      resetsAt: START + SPEND_WINDOW_SECONDS,
    });
  });

  it("subtracts what was already spent inside the window", () => {
    expect(
      remaining({ windowStart: START, amount: 250_000_000n }, THRESHOLD, START + 3_600n),
    ).toEqual({ left: 750_000_000n, resetsAt: START + SPEND_WINDOW_SECONDS });
  });

  it("never reports a negative headroom", () => {
    expect(
      remaining({ windowStart: START, amount: 1_500_000_000n }, THRESHOLD, START + 3_600n),
    ).toEqual({ left: 0n, resetsAt: START + SPEND_WINDOW_SECONDS });
  });

  it("reports zero at the threshold, where the contract starts reverting", () => {
    expect(
      remaining({ windowStart: START, amount: THRESHOLD }, THRESHOLD, START + 3_600n),
    ).toEqual({ left: 0n, resetsAt: START + SPEND_WINDOW_SECONDS });
  });

  it("rolls the window once it has expired, as pay() would", () => {
    const now = START + SPEND_WINDOW_SECONDS;
    expect(remaining({ windowStart: START, amount: 900_000_000n }, THRESHOLD, now)).toEqual({
      left: THRESHOLD,
      resetsAt: now + SPEND_WINDOW_SECONDS,
    });
  });

  it("does not roll the window one second early", () => {
    const now = START + SPEND_WINDOW_SECONDS - 1n;
    expect(remaining({ windowStart: START, amount: 900_000_000n }, THRESHOLD, now)).toEqual({
      left: 100_000_000n,
      resetsAt: START + SPEND_WINDOW_SECONDS,
    });
  });
});

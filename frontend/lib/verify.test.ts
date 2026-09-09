import { describe, expect, it } from "vitest";
import { ENQUEUE_EVERY_MS, GIVE_UP_MS, waitState } from "./verify";

const T0 = 1_757_430_000_000;
const base = { startedAt: T0, lastEnqueuedAt: T0, verified: false, now: T0 };

describe("waitState", () => {
  it("reports success the moment the chain says the attestation is valid", () => {
    expect(waitState({ ...base, verified: true, now: T0 + 5_000 })).toEqual({ kind: "verified" });
  });

  it("prefers success over the deadline: a verdict that lands late still counts", () => {
    expect(waitState({ ...base, verified: true, now: T0 + GIVE_UP_MS + 1 })).toEqual({
      kind: "verified",
    });
  });

  it("asks for the first enqueue immediately when nothing has been sent yet", () => {
    expect(waitState({ ...base, lastEnqueuedAt: null })).toEqual({
      kind: "waiting",
      secondsLeft: 300,
      enqueueNow: true,
    });
  });

  it("does not re-enqueue before the minute is up", () => {
    const s = waitState({ ...base, now: T0 + ENQUEUE_EVERY_MS - 1 });
    expect(s).toMatchObject({ kind: "waiting", enqueueNow: false });
  });

  it("re-enqueues once the minute has passed", () => {
    const s = waitState({ ...base, now: T0 + ENQUEUE_EVERY_MS });
    expect(s).toMatchObject({ kind: "waiting", enqueueNow: true });
  });

  it("counts the remaining seconds down", () => {
    const s = waitState({ ...base, now: T0 + 90_000 });
    expect(s).toMatchObject({ kind: "waiting", secondsLeft: 210 });
  });

  it("gives up at the deadline", () => {
    expect(waitState({ ...base, now: T0 + GIVE_UP_MS })).toEqual({ kind: "timeout" });
  });

  it("never asks to enqueue after it has given up", () => {
    const s = waitState({ ...base, lastEnqueuedAt: null, now: T0 + GIVE_UP_MS + 60_000 });
    expect(s).toEqual({ kind: "timeout" });
  });
});

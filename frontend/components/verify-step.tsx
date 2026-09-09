"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SumsubWebSdk from "@sumsub/websdk-react";
import type { Address } from "viem";
import { RelayFailure, enqueue, mintToken } from "@/lib/relay";
import { POLL_EVERY_MS, waitState } from "@/lib/verify";
import { ErrorNote } from "@/components/ui";

type Phase =
  /** Nothing started. The payer has not asked for the check yet. */
  | { kind: "idle" }
  | { kind: "minting" }
  | { kind: "widget"; token: string }
  /** The widget said it is done. From here the chain is the only source of truth.
   *  `token` is null when the payer entered this phase without a widget session —
   *  e.g. from a reload, claiming to have already finished elsewhere. */
  | { kind: "waiting"; token: string | null; startedAt: number };

/** The message never claims to know why. The relay cannot read the applicant's status
 *  and the chain records no refusal (SPEC §5), so "not finished" is all we honestly have.
 *  The reason is on the payer's own screen, inside the widget — which is why the widget
 *  is not unmounted when the wait begins. */
export function VerifyStep({
  gate,
  wallet,
  level,
  verified,
  onPoll,
  onBusyChange,
}: {
  gate: Address;
  wallet: Address;
  level: 1 | 2;
  verified: boolean;
  onPoll: () => void;
  /** Called with true once a widget session is open (an iframe a reload would tear
   *  out mid-capture), false otherwise. Report from an effect, never from render. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const lastEnqueuedAt = useRef<number | null>(null);

  const start = async () => {
    setError(null);
    setPhase({ kind: "minting" });
    try {
      setPhase({ kind: "widget", token: await mintToken(gate, wallet) });
    } catch (e) {
      setPhase({ kind: "idle" });
      setError(e instanceof RelayFailure ? e.message : "We could not start the check.");
    }
  };

  /** The widget calls this when its token expires; it must resolve to a NEW token. */
  const refreshToken = useCallback(() => mintToken(gate, wallet), [gate, wallet]);

  /** The widget wires onMessage exactly once, at mount (shouldComponentUpdate returns
   *  false without `force`), so the handler's view of `phase` is frozen at that render
   *  and its kind test is permanently true. This guard keeps a second
   *  onApplicantSubmitted ping from resetting startedAt and pushing the give-up
   *  deadline out forever. */
  const transitioned = useRef(false);

  /** Queue once when the widget finishes, then keep the clock running. */
  const finished = (token: string) => {
    if (transitioned.current) return;
    transitioned.current = true;
    lastEnqueuedAt.current = null;
    setPhase({ kind: "waiting", token, startedAt: Date.now() });
  };

  // One ticker drives both the countdown and the two periodic actions. Re-enqueueing
  // and re-reading the chain are the same loop at different periods, and running them
  // from separate intervals would drift apart on a throttled background tab.
  useEffect(() => {
    if (phase.kind !== "waiting") return;
    const t = setInterval(() => setNow(Date.now()), POLL_EVERY_MS);
    setNow(Date.now());
    return () => clearInterval(t);
  }, [phase.kind]);

  /** Non-null exactly while an SDK session (and its iframe) is mounted below — the
   *  timeout branch's and idle branch's "check again" enter `waiting` with
   *  token: null, so no widget is open there. */
  const widgetToken = phase.kind === "widget" || phase.kind === "waiting" ? phase.token : null;

  useEffect(() => {
    onBusyChange?.(widgetToken !== null);
    return () => onBusyChange?.(false);
  }, [widgetToken, onBusyChange]);

  const state =
    phase.kind === "waiting"
      ? waitState({
          startedAt: phase.startedAt,
          lastEnqueuedAt: lastEnqueuedAt.current,
          verified,
          now,
        })
      : null;

  useEffect(() => {
    if (!state || state.kind !== "waiting") return;
    onPoll();
    if (!state.enqueueNow) return;
    // Optimistic: mark it sent before the request resolves, so a slow relay cannot
    // produce a burst of identical items on the next few ticks.
    lastEnqueuedAt.current = Date.now();
    enqueue(gate, wallet, level).catch((e) => {
      // A failed enqueue is not fatal — the next minute tries again — but a payer
      // watching a silent screen deserves to know the relay is refusing us.
      if (e instanceof RelayFailure && e.kind !== "unavailable") setError(e.message);
    });
    // `now` is the tick: this effect is the loop body, one iteration per POLL_EVERY_MS.
  }, [now, state?.kind, gate, wallet, level, onPoll]);

  if (verified) return null;

  return (
    <div className="mt-2">
      {phase.kind === "idle" && (
        <>
          <button
            onClick={start}
            className="h-12 w-full rounded-xs bg-blue text-[14.5px] font-medium text-white transition-colors hover:bg-blue-deep"
          >
            {level === 2 ? "Verify with a passport or ID" : "Verify that you are a person"}
          </button>
          <p className="mt-2.5 text-[12.5px] text-slate">
            Your document goes to the verification provider and nowhere else. It never reaches this
            merchant, this page, or the chain.
          </p>
          <button
            onClick={() => {
              lastEnqueuedAt.current = null;
              setPhase({ kind: "waiting", token: null, startedAt: Date.now() });
              setNow(Date.now());
            }}
            className="mt-3 h-9 rounded-xs border border-rule px-3.5 text-[13px] transition-colors hover:border-ink"
          >
            I already passed this — check again
          </button>
          <p className="mt-2.5 text-[12.5px] text-slate">
            Already finished the check elsewhere, or on a reload? This starts no new upload and no
            new session — it just looks you up by the same identifier.
          </p>
        </>
      )}

      {phase.kind === "minting" && (
        <div className="flex h-12 items-center gap-3 border border-rule px-4">
          <span className="breathe size-2 shrink-0 rounded-full bg-blue" />
          <span className="text-[14px]">Opening the check</span>
        </div>
      )}

      {widgetToken && (
        <div className="border border-rule p-3">
          <SumsubWebSdk
            accessToken={widgetToken}
            expirationHandler={refreshToken}
            config={{ theme: "light" }}
            options={{ addViewportTag: false }}
            onMessage={(type: string) => {
              // The widget reports its own completion; the verdict is not ours to read.
              // onApplicantSubmitted means documents were submitted. applicantStatus fires
              // on any status change, including the applicant's pre-existing "init" status
              // the moment the widget opens, so it is not a completion signal.
              if (type === "idCheck.onApplicantSubmitted" && phase.kind === "widget") finished(phase.token);
            }}
            onError={() => setError("Something went wrong in the verification widget.")}
          />
        </div>
      )}

      {state?.kind === "waiting" && (
        <div className="mt-3 flex h-12 items-center gap-3 border border-rule px-4">
          <span className="breathe size-2 shrink-0 rounded-full bg-blue" />
          <span className="text-[14px]">Waiting for your attestation</span>
          <span className="ml-auto text-[12.5px] text-slate">
            Up to {Math.ceil(state.secondsLeft / 60)} min
          </span>
        </div>
      )}

      {state?.kind === "timeout" && phase.kind === "waiting" && (
        <div className="mt-3">
          <p className="text-[13px]">
            The check has not finished. We cannot tell you why from here — the reason, if there is
            one, is in the widget above, on your device.
          </p>
          <button
            onClick={() => {
              lastEnqueuedAt.current = null;
              setPhase({ kind: "waiting", token: phase.token, startedAt: Date.now() });
              setNow(Date.now());
            }}
            className="mt-3 h-9 rounded-xs border border-rule px-3.5 text-[13px] transition-colors hover:border-ink"
          >
            I already passed this — check again
          </button>
          <p className="mt-2.5 text-[12.5px] text-slate">
            Checking again is safe and free. It looks you up by the same identifier, so a check that
            finished after we stopped waiting can still be picked up.
          </p>
        </div>
      )}

      {error && (
        <div className="mt-3">
          <ErrorNote onRetry={() => setError(null)} retryLabel="Dismiss">
            {error}
          </ErrorNote>
        </div>
      )}
    </div>
  );
}

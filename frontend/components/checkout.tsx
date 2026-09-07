"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "connect" | "verify" | "verifying" | "ready" | "paying" | "screening" | "settled" | "returned";

const GATE = { name: "Meridian Issuance", token: "USDC", symbol: "$", threshold: 1000 };
const RECLAIM_SECONDS = 90;

export function Checkout() {
  const [phase, setPhase] = useState<Phase>("connect");
  const [amount, setAmount] = useState("250");
  const [approved, setApproved] = useState(false);
  const [outcome, setOutcome] = useState<"returned" | "settled">("returned");
  const [left, setLeft] = useState(RECLAIM_SECONDS);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const value = Number(amount || 0);
  const needsPassport = value >= GATE.threshold;

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (phase !== "screening") return;
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const after = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));

  function pay(result: "returned" | "settled") {
    setOutcome(result);
    setLeft(RECLAIM_SECONDS);
    setPhase("paying");
    after(900, () => setPhase("screening"));
    after(5200, () => setPhase(result));
  }

  const screening = phase === "screening";
  const done = phase === "settled" || phase === "returned";

  return (
    <div className="mx-auto max-w-[560px] px-6 pt-14 pb-24">
      <header>
        <h1 className="display text-[26px] font-semibold">Pay {GATE.name}</h1>
        <p className="mt-1.5 text-[13px] text-slate">
          Base Sepolia, in {GATE.token}. Your money is held by the gateway contract, never by the
          merchant and never by us.
        </p>
      </header>

      {/* Rule 1: requirements are on screen before the amount is typed. */}
      <section className="mt-7 border border-rule bg-wash p-4">
        <h2 className="text-[13.5px] font-medium">What this merchant asks for</h2>
        <dl className="mt-3 space-y-2 text-[13px]">
          <div className="flex justify-between gap-4">
            <dt className="text-slate">Under {GATE.symbol}1,000</dt>
            <dd className={!needsPassport ? "font-medium" : "text-slate"}>Selfie check</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate">{GATE.symbol}1,000 and above</dt>
            <dd className={needsPassport ? "font-medium" : "text-slate"}>Passport check</dd>
          </div>
        </dl>
        <p className="mt-3 border-t border-rule pt-3 text-[12.5px] text-slate">
          Your documents go to the verification provider and nowhere else. This merchant never sees
          them, and neither do we.
        </p>
      </section>

      <section className="mt-8">
        <label htmlFor="amount" className="text-[13.5px] font-medium">Amount</label>
        <div className="mt-2 flex h-14 items-center rounded-xs border border-rule focus-within:border-ink">
          <span className="pl-4 pr-1 text-[22px] text-slate">{GATE.symbol}</span>
          <input
            id="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            inputMode="decimal"
            disabled={phase !== "connect" && phase !== "verify" && phase !== "ready"}
            className="tnum h-full w-full bg-transparent pr-2 text-[22px] outline-none disabled:text-slate"
          />
          <span className="pr-4 text-[13px] text-slate">{GATE.token}</span>
        </div>

        {/* Rule 2: the daily allowance is shown only once there is a number to show. */}
        {(phase === "ready" || phase === "paying") && (
          <p className="mt-2.5 text-[12.5px] text-slate">
            <span className="tnum">{GATE.symbol}750</span> left today before a passport check is
            needed. Resets at 14:20.
          </p>
        )}
      </section>

      <section className="mt-8">
        {phase === "connect" && (
          <Action onClick={() => setPhase("verify")}>Connect wallet</Action>
        )}

        {phase === "verify" && (
          <>
            <Action onClick={() => { setPhase("verifying"); after(2200, () => setPhase("ready")); }}>
              Start selfie check
            </Action>
            <Note>Takes about a minute. You will not be asked for a document at this amount.</Note>
          </>
        )}

        {phase === "verifying" && (
          <Waiting label="Confirming your check" detail="Up to a minute. Keep this page open." />
        )}

        {phase === "ready" && !approved && (
          <>
            <Action onClick={() => setApproved(true)}>Allow {GATE.token} to be spent</Action>
            <Note>One-time. Next payment to this merchant is a single signature.</Note>
          </>
        )}

        {phase === "ready" && approved && (
          <>
            <Action onClick={() => pay(outcome)}>
              Pay {GATE.symbol}
              {value.toLocaleString("en-US")}
            </Action>
            <Note>Your money is held by the gateway contract until screening finishes.</Note>
          </>
        )}

        {phase === "paying" && <Waiting label="Confirming the payment" detail="One block on Base." />}
      </section>

      {(screening || done) && (
        <section className="mt-10">
          <h2 className="text-[15px] font-medium">Screening</h2>

          <ol className="mt-4 border-l-2 border-ink pl-5">
            <Check
              title="Sanctions list"
              state="clear"
              detail="Checked on chain the moment you paid."
            />
            <Check
              title="Where the funds came from"
              state={screening ? "running" : outcome === "settled" ? "clear" : "stopped"}
              detail={
                screening
                  ? "About a minute. If it does not pass, your money comes back on its own."
                  : outcome === "settled"
                    ? "Cleared the merchant's risk ceiling."
                    : "Above this merchant's risk ceiling."
              }
            />
          </ol>

          {screening && (
            <div className="mt-6 flex items-center justify-between gap-4 border-t border-rule pt-4">
              <p className="max-w-[38ch] text-[12.5px] text-slate">
                If no verdict arrives, take your money back yourself. Nobody can hold it.
              </p>
              <button
                disabled={left > 0}
                className="h-9 shrink-0 rounded-xs border border-rule px-3.5 text-[13px] transition-colors enabled:hover:border-ink disabled:text-slate"
              >
                {left > 0
                  ? `Take it back in ${String(Math.floor(left / 60))}:${String(left % 60).padStart(2, "0")}`
                  : "Take my money back"}
              </button>
            </div>
          )}

          {done && (
            <div className={`mt-7 border-l-2 pl-5 ${outcome === "settled" ? "border-blue" : "hatch border-ink"}`}>
              <div className="bg-paper">
                <h3 className="display text-[21px] font-semibold">
                  {outcome === "settled" ? "Paid" : "Returned to your wallet"}
                </h3>
                <p className="mt-1.5 max-w-[46ch] text-[13px] text-slate">
                  {outcome === "settled"
                    ? `${GATE.symbol}${value.toLocaleString("en-US")} reached ${GATE.name}. Nothing about you reached them.`
                    : `${GATE.symbol}${value.toLocaleString("en-US")} is back where it started. The merchant was never paid and never learned anything about you.`}
                </p>
                <button
                  onClick={() => {
                    setPhase("ready");
                    pay(outcome === "settled" ? "returned" : "settled");
                  }}
                  className="mt-4 text-[13px] text-blue underline underline-offset-2 hover:text-blue-deep"
                >
                  {outcome === "settled" ? "Replay with flagged funds" : "Replay with clean funds"}
                </button>
              </div>
            </div>
          )}

          <p className="mt-9 border-t border-rule pt-3 text-[12px] text-slate">
            The sanctions oracle is mocked on testnet. The mainnet address is in the repository
            config.
          </p>
        </section>
      )}
    </div>
  );
}

function Action({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-12 w-full rounded-xs bg-blue text-[14.5px] font-medium text-white transition-colors hover:bg-blue-deep"
    >
      {children}
    </button>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-2.5 text-[12.5px] text-slate">{children}</p>;
}

function Waiting({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex h-12 items-center gap-3 border border-rule px-4">
      <span className="breathe size-2 shrink-0 rounded-full bg-blue" />
      <span className="text-[14px]">{label}</span>
      <span className="ml-auto text-[12.5px] text-slate">{detail}</span>
    </div>
  );
}

function Check({
  title,
  state,
  detail,
}: {
  title: string;
  state: "clear" | "running" | "stopped";
  detail: string;
}) {
  const mark =
    state === "running" ? (
      <span className="breathe absolute -left-[26px] top-[7px] size-2 rounded-full bg-blue shadow-[0_0_0_4px_var(--color-paper)]" />
    ) : state === "clear" ? (
      <span className="absolute -left-[26px] top-[7px] size-2 bg-ink shadow-[0_0_0_4px_var(--color-paper)]" />
    ) : (
      <span className="hatch absolute -left-[26px] top-[7px] size-2 border border-ink shadow-[0_0_0_4px_var(--color-paper)]" />
    );

  return (
    <li className="relative pb-6 last:pb-0">
      {mark}
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[15px] font-medium">{title}</span>
        <span className={`text-[13px] ${state === "running" ? "text-blue" : "text-slate"}`}>
          {state === "clear" ? "Clear" : state === "running" ? "Screening" : "Not cleared"}
        </span>
      </div>
      <p className="mt-1 max-w-[44ch] text-[13px] text-slate">{detail}</p>
    </li>
  );
}

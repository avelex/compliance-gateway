"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, ErrorNote } from "@/components/ui";
import { SYMBOL, type Gateway } from "@/lib/data";

const LEVELS = [
  { v: 0, label: "No identity check" },
  { v: 1, label: "Selfie check" },
  { v: 2, label: "Passport check" },
];

const MAX_THRESHOLD = 10_000;
const MAX_RISK = 80;

const levelName = (v: number) => LEVELS.find((l) => l.v === v)!.label;

export function PolicyForm({ gateway: g }: { gateway: Gateway }) {
  const params = useSearchParams();
  const ids = { below: useId(), above: useId(), threshold: useId(), risk: useId() };

  const start = g.policy;
  const [below, setBelow] = useState<number>(start.levelBelow);
  const [above, setAbove] = useState<number>(start.levelAbove);
  const [threshold, setThreshold] = useState(String(start.threshold));
  const [risk, setRisk] = useState(String(start.maxRisk));

  const [pending, setPending] = useState<null | typeof start>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  // A compliance change was requested; a screen reader must land on it, not on <body>.
  useEffect(() => {
    if (pending) panel.current?.focus();
  }, [pending]);

  const thresholdNum = Number(threshold);
  const riskNum = Number(risk);

  const errors = {
    threshold:
      threshold.trim() === "" || Number.isNaN(thresholdNum)
        ? "Enter an amount."
        : thresholdNum < 0
          ? "Cannot be negative."
          : thresholdNum > MAX_THRESHOLD
            ? `The contract caps this at ${SYMBOL[g.token]}${MAX_THRESHOLD.toLocaleString("en-US")}.`
            : null,
    risk:
      risk.trim() === "" || Number.isNaN(riskNum)
        ? "Enter a number."
        : riskNum < 0
          ? "Cannot be negative."
          : riskNum > MAX_RISK
            ? `The contract caps this at ${MAX_RISK}.`
            : null,
    // Mirrors _validatePolicy: a stricter check above the threshold is meaningless
    // if anyone can pay below it unidentified.
    levels:
      above !== 0 && below === 0
        ? "Asking for a passport above the threshold needs at least a selfie check below it."
        : null,
  };

  const invalid = Object.values(errors).some(Boolean);
  const dirty =
    below !== start.levelBelow ||
    above !== start.levelAbove ||
    thresholdNum !== start.threshold ||
    riskNum !== start.maxRisk;

  const frozen = pending !== null || busy;

  async function save() {
    setBusy(true);
    setFailed(false);
    const requested = {
      levelBelow: below as 0 | 1 | 2,
      levelAbove: above as 0 | 1 | 2,
      threshold: thresholdNum,
      maxRisk: riskNum,
    };
    try {
      await new Promise((ok, no) =>
        setTimeout(() => (params.get("fail") === "save" ? no(new Error()) : ok(null)), 800),
      );
      setPending(requested);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function withdraw() {
    setPending(null);
    setBelow(start.levelBelow);
    setAbove(start.levelAbove);
    setThreshold(String(start.threshold));
    setRisk(String(start.maxRisk));
  }

  return (
    <div className="mt-9 grid gap-12 lg:grid-cols-[1fr_268px]">
      <div>
        <h2 className="text-[15px] font-medium">What you ask of payers</h2>
        <p className="mt-1.5 max-w-[56ch] text-[13px] text-slate">
          Screening of incoming funds runs on every payment and is not configurable. These four
          settings decide when a payer has to prove who they are.
        </p>

        <fieldset disabled={frozen} className="mt-6 space-y-5">
          <legend className="sr-only">Compliance policy</legend>

          <Field
            id={ids.below}
            label="Under the threshold"
            hint="Applies to payments below the amount you set."
            error={errors.levels}
          >
            <Select id={ids.below} value={below} onChange={setBelow} invalid={!!errors.levels} />
          </Field>

          <Field
            id={ids.above}
            label="At or above the threshold"
            hint="Payments that reach the amount, and anyone whose daily total reaches it."
          >
            <Select id={ids.above} value={above} onChange={setAbove} invalid={!!errors.levels} />
          </Field>

          <Field
            id={ids.threshold}
            label={`Threshold (${g.token})`}
            hint={`Where the stricter check begins. Maximum ${SYMBOL[g.token]}${MAX_THRESHOLD.toLocaleString("en-US")}.`}
            error={errors.threshold}
          >
            <div
              className={`flex h-9 w-[200px] items-center rounded-xs border focus-within:border-ink ${
                errors.threshold ? "border-alert" : "border-rule"
              }`}
            >
              <span aria-hidden className="pl-3 text-slate">
                {SYMBOL[g.token]}
              </span>
              <input
                id={ids.threshold}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                inputMode="decimal"
                max={MAX_THRESHOLD}
                aria-invalid={!!errors.threshold}
                aria-describedby={`${ids.threshold}-hint`}
                className="tnum h-full w-full bg-transparent px-2 text-[13px] outline-none disabled:text-slate"
              />
            </div>
          </Field>

          <Field
            id={ids.risk}
            label="Risk ceiling"
            hint={`How much exposure the funds may carry before the payment is returned, on a 0–100 scale where 0 is untraceably clean. Maximum ${MAX_RISK}.`}
            error={errors.risk}
          >
            <input
              id={ids.risk}
              value={risk}
              onChange={(e) => setRisk(e.target.value)}
              inputMode="numeric"
              max={MAX_RISK}
              aria-invalid={!!errors.risk}
              aria-describedby={`${ids.risk}-hint`}
              className={`tnum h-9 w-[200px] rounded-xs border px-3 text-[13px] outline-none focus:border-ink disabled:text-slate ${
                errors.risk ? "border-alert" : "border-rule"
              }`}
            />
          </Field>
        </fieldset>

        <div className="mt-8 border-t border-rule pt-6">
          {failed && (
            <div className="mb-5">
              <ErrorNote onRetry={save}>
                The change was not submitted. Your policy is unchanged, and the values above
                are still what you typed.
              </ErrorNote>
            </div>
          )}

          {pending ? (
            <div
              ref={panel}
              tabIndex={-1}
              role="status"
              className="border border-rule bg-wash p-4 outline-none"
            >
              <div className="text-[14px] font-medium">Waiting for a second approval</div>
              <p className="mt-1 max-w-[52ch] text-[13px] text-slate">
                The settings above are locked until this resolves. Loosening a compliance
                setting needs two people. Nothing changes on chain until
                Dana approves in Privy.
              </p>

              <dl className="mt-3 space-y-1 text-[13px]">
                <Diff
                  label="Under the threshold"
                  from={levelName(start.levelBelow)}
                  to={levelName(pending.levelBelow)}
                />
                <Diff
                  label="At or above"
                  from={levelName(start.levelAbove)}
                  to={levelName(pending.levelAbove)}
                />
                <Diff
                  label="Threshold"
                  from={`${SYMBOL[g.token]}${start.threshold.toLocaleString("en-US")}`}
                  to={`${SYMBOL[g.token]}${pending.threshold.toLocaleString("en-US")}`}
                />
                <Diff
                  label="Risk ceiling"
                  from={String(start.maxRisk)}
                  to={String(pending.maxRisk)}
                />
              </dl>

              <button
                onClick={withdraw}
                className="mt-3 text-[13px] text-blue underline underline-offset-2 hover:text-blue-deep"
              >
                Withdraw the request
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button onClick={save} disabled={!dirty || invalid || busy}>
                {busy ? "Submitting…" : "Save changes"}
              </Button>
              <span className="max-w-[46ch] text-[12.5px] text-slate">
                {!dirty
                  ? "Nothing to save — the policy on chain matches what is on screen."
                  : invalid
                    ? "Fix the highlighted fields to continue."
                    : "Payments already in screening keep the policy they started under."}
              </span>
            </div>
          )}
        </div>
      </div>

      <aside className="lg:border-l lg:border-rule lg:pl-8">
        <h2 className="text-[15px] font-medium">Who can change this</h2>
        <p className="mt-1.5 text-[13px] text-slate">
          Enforced by Privy on the key itself, not by this page.
        </p>
        <dl className="mt-5 space-y-3.5 text-[13px]">
          <div>
            <dt className="text-[12.5px] text-slate">Wallet</dt>
            <dd className="font-mono text-[12.5px]">0x9E44…7f30</dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-slate">May call</dt>
            <dd>setPolicy, on this gateway only</dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-slate">Signatures required</dt>
            <dd className="tnum">2 of 3</dd>
          </div>
        </dl>
        <ul className="mt-5 space-y-2 border-t border-rule pt-4 text-[13px]">
          {[
            ["Alex", pending ? "signed" : "—"],
            ["Dana", pending ? "waiting" : "—"],
            ["Priya", "—"],
          ].map(([who, state]) => (
            <li key={who} className="flex justify-between">
              <span>{who}</span>
              <span className={state === "waiting" ? "text-blue" : "text-slate"}>{state}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function Diff({ label, from, to }: { label: string; from: string; to: string }) {
  const changed = from !== to;
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate">{label}</dt>
      <dd className={changed ? "" : "text-slate"}>
        {changed ? (
          <>
            <span className="text-slate line-through">{from}</span>{" "}
            <span className="font-medium">{to}</span>
          </>
        ) : (
          "unchanged"
        )}
      </dd>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 border-b border-rule pb-5 last:border-b-0 sm:grid-cols-[1fr_220px] sm:items-start sm:gap-8">
      <div>
        <label htmlFor={id} className="text-[13.5px] font-medium">
          {label}
        </label>
        <p id={`${id}-hint`} className="mt-0.5 max-w-[46ch] text-[12.5px] text-slate">
          {hint}
        </p>
        {error && (
          <p className="mt-1 max-w-[46ch] text-[12.5px] text-alert">{error}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function Select({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: number;
  onChange: (v: number) => void;
  invalid?: boolean;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-invalid={invalid}
      aria-describedby={`${id}-hint`}
      className={`h-9 w-full rounded-xs border bg-white px-2.5 text-[13px] outline-none focus:border-ink disabled:text-slate ${
        invalid ? "border-alert" : "border-rule"
      }`}
    >
      {LEVELS.map((l) => (
        <option key={l.v} value={l.v}>
          {l.label}
        </option>
      ))}
    </select>
  );
}

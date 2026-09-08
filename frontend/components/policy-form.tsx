"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button, ErrorNote, TxLink } from "@/components/ui";
import { SYMBOL, short, type Policy } from "@/lib/data";
import type { OnChainGateway } from "@/lib/gateways";
import { useSignerGrant } from "@/components/delegate-panel";
import { useOrgWallet } from "@/components/login-gate";

const LEVELS = [
  { v: 0, label: "No identity check" },
  { v: 1, label: "Selfie check" },
  { v: 2, label: "Passport check" },
];

const MAX_THRESHOLD = 10_000;
const MAX_RISK = 80;

const levelName = (v: number) => LEVELS.find((l) => l.v === v)!.label;

export function PolicyForm({ gateway: g }: { gateway: OnChainGateway }) {
  const { getAccessToken } = usePrivy();
  const wallet = useOrgWallet();
  const { granted: canSign, policyId } = useSignerGrant();
  const ids = { below: useId(), above: useId(), threshold: useId(), risk: useId() };

  const start = g.policy;
  const [below, setBelow] = useState<number>(start.levelBelow);
  const [above, setAbove] = useState<number>(start.levelAbove);
  const [threshold, setThreshold] = useState(String(start.threshold));
  const [risk, setRisk] = useState(String(start.maxRisk));

  const [saved, setSaved] = useState<{ policy: Policy; hash: string; confirmed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<{ message: string; hash?: string } | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  // A compliance change was made; a screen reader must land on the confirmation, not <body>.
  useEffect(() => {
    if (saved) panel.current?.focus();
  }, [saved]);

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

  const frozen = saved !== null || busy;

  async function save() {
    setBusy(true);
    setFailed(false);
    setError(null);
    const requested: Policy = {
      levelBelow: below as 0 | 1 | 2,
      levelAbove: above as 0 | 1 | 2,
      threshold: thresholdNum,
      maxRisk: riskNum,
    };
    try {
      const res = await fetch("/api/privy/set-policy", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${await getAccessToken()}`,
        },
        body: JSON.stringify({ gate: g.address, policy: requested }),
      });
      // A framework-level 500 is HTML, not JSON. Showing the merchant "Unexpected token '<'"
      // instead of a sentence is what the empty object avoids.
      const body = await res.json().catch(() => ({}) as Record<string, string>);
      if (body.status === "confirmed" || body.status === "unconfirmed") {
        setSaved({ policy: requested, hash: body.hash, confirmed: body.status === "confirmed" });
      } else {
        // Ownership/validation/auth failures, a Privy refusal, or a reverted transaction —
        // all land here. A reverted send still has a hash worth showing.
        setError({ message: body.error ?? "", hash: body.hash });
        setFailed(true);
      }
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : "" });
      setFailed(true);
    } finally {
      setBusy(false);
    }
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
                {error?.message ||
                  "The change was not submitted. Your policy is unchanged, and the values above are still what you typed."}
                {error?.hash && <TxLink tx={error.hash} />}
              </ErrorNote>
            </div>
          )}

          {saved ? (
            <div
              ref={panel}
              tabIndex={-1}
              role="status"
              className="border border-rule bg-wash p-4 outline-none"
            >
              <h3 className="text-[14px] font-medium">
                {saved.confirmed ? "Policy updated" : "Policy change sent"}
              </h3>
              <p className="mt-1 max-w-[52ch] text-[13px] text-slate">
                {saved.confirmed
                  ? "It is on chain now. Payments already in screening keep the policy they started under."
                  : "It was sent but we could not confirm it in time. Do not retry — check this transaction before trying again."}
              </p>

              <dl className="mt-3 space-y-1 text-[13px]">
                <Diff
                  label="Under the threshold"
                  from={levelName(start.levelBelow)}
                  to={levelName(saved.policy.levelBelow)}
                />
                <Diff
                  label="At or above"
                  from={levelName(start.levelAbove)}
                  to={levelName(saved.policy.levelAbove)}
                />
                <Diff
                  label="Threshold"
                  from={`${SYMBOL[g.token]}${start.threshold.toLocaleString("en-US")}`}
                  to={`${SYMBOL[g.token]}${saved.policy.threshold.toLocaleString("en-US")}`}
                />
                <Diff
                  label="Risk ceiling"
                  from={String(start.maxRisk)}
                  to={String(saved.policy.maxRisk)}
                />
              </dl>

              <TxLink tx={saved.hash} />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button onClick={save} disabled={!canSign || !dirty || invalid || busy}>
                {busy ? "Submitting…" : "Save changes"}
              </Button>
              <span className="max-w-[46ch] text-[12.5px] text-slate">
                {!dirty
                  ? "Nothing to save — the policy on chain matches what is on screen."
                  : invalid
                    ? "Fix the highlighted fields to continue."
                    : !canSign
                      ? policyId
                        ? "Grant permission above to save changes."
                        : "This browser doesn't have your permission id — see above."
                      : "Payments already in screening keep the policy they started under."}
              </span>
            </div>
          )}
        </div>
      </div>

      <aside className="lg:border-l lg:border-rule lg:pl-8">
        <h2 className="text-[15px] font-medium">Who can change this</h2>
        <p className="mt-1.5 text-[13px] text-slate">
          The wallet permission is enforced by Privy on the key itself, not by this page. The
          policy that defines it is owned by this dashboard&rsquo;s operator, who can widen it
          without asking you; revoking the permission in Privy is what ends it.
        </p>
        <dl className="mt-5 space-y-3.5 text-[13px]">
          <div>
            <dt className="text-[12.5px] text-slate">Wallet</dt>
            <dd className="font-mono text-[12.5px]">
              {wallet ? short(wallet.address, 6, 4) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-slate">May send</dt>
            <dd>
              {policyId ? (
                <>
                  <span className="font-mono text-[12px]">setPolicy</span>, carrying no value,
                  to the gateways you deployed here
                  <span className="mt-0.5 block font-mono text-[12px] text-slate">
                    including {short(g.address, 6, 4)}
                  </span>
                </>
              ) : (
                "No permission policy exists for this wallet yet"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-slate">Permission granted</dt>
            <dd>{canSign ? "Yes" : "Not yet"}</dd>
          </div>
        </dl>

        <div className="mt-6 border-t border-rule pt-4">
          <div className="flex justify-between text-[13px]">
            <span className="text-slate">Signatures required</span>
            <span className="tnum">2 of 3</span>
          </div>
          <ul className="mt-2 space-y-2 text-[13px]">
            {[
              ["Alex", "signed"],
              ["Dana", "waiting"],
              ["Priya", "—"],
            ].map(([who, state]) => (
              <li key={who} className="flex justify-between">
                <span className="text-slate">{who}</span>
                <span className="text-slate">{state}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-slate">
            This two-of-three approval is a demo mock &mdash; no second signature is collected and
            nothing above it depends on one. Everything else on this panel is read from Privy.
          </p>
        </div>
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

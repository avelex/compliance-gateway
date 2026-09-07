"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { SYMBOL, type Gateway } from "@/lib/data";

const LEVELS = [
  { v: 0, label: "No identity check" },
  { v: 1, label: "Selfie check" },
  { v: 2, label: "Passport check" },
];

export function PolicyForm({ gateway: g }: { gateway: Gateway }) {
  const [below, setBelow] = useState(g.policy.levelBelow);
  const [above, setAbove] = useState(g.policy.levelAbove);
  const [threshold, setThreshold] = useState(String(g.policy.threshold));
  const [risk, setRisk] = useState(String(g.policy.maxRisk));
  const [pending, setPending] = useState(false);

  return (
    <div className="mt-9 grid gap-12 lg:grid-cols-[1fr_268px]">
      <div>
        <h2 className="text-[15px] font-medium">What you ask of payers</h2>
        <p className="mt-1.5 max-w-[56ch] text-[13px] text-slate">
          Screening of incoming funds runs on every payment and is not configurable. These four
          settings decide when a payer has to prove who they are.
        </p>

        <div className="mt-6 space-y-5">
          <Field label="Under the threshold" hint="Applies to payments below the amount you set.">
            <Select value={below} onChange={setBelow} />
          </Field>

          <Field label="At or above the threshold" hint="Payments that reach the amount, and anyone whose daily total reaches it.">
            <Select value={above} onChange={setAbove} />
          </Field>

          <Field label="Threshold" hint="Where the stricter check begins. Maximum 10,000.">
            <div className="flex h-9 w-[200px] items-center rounded-xs border border-rule focus-within:border-ink">
              <span className="pl-3 text-slate">{SYMBOL[g.token]}</span>
              <input
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                inputMode="numeric"
                className="tnum h-full w-full bg-transparent px-2 text-[13px] outline-none"
              />
            </div>
          </Field>

          <Field label="Risk ceiling" hint="How much exposure the funds may carry before the payment is returned. Maximum 80.">
            <input
              value={risk}
              onChange={(e) => setRisk(e.target.value)}
              inputMode="numeric"
              className="tnum h-9 w-[200px] rounded-xs border border-rule px-3 text-[13px] outline-none focus:border-ink"
            />
          </Field>
        </div>

        <div className="mt-8 border-t border-rule pt-6">
          {pending ? (
            <div className="border-l-2 border-blue pl-4">
              <div className="text-[14px] font-medium">Waiting for a second approval</div>
              <p className="mt-1 max-w-[52ch] text-[13px] text-slate">
                Loosening a compliance setting needs two people. Nothing changes on chain until
                Dana approves in Privy.
              </p>
              <button
                onClick={() => setPending(false)}
                className="mt-3 text-[13px] text-blue underline underline-offset-2 hover:text-blue-deep"
              >
                Withdraw the request
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <Button onClick={() => setPending(true)}>Save changes</Button>
              <span className="text-[12.5px] text-slate">
                Payments already in screening keep the policy they started under.
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
            ["Alex", "signed"],
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

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 border-b border-rule pb-5 last:border-b-0 sm:grid-cols-[1fr_220px] sm:items-start sm:gap-8">
      <div>
        <div className="text-[13.5px] font-medium">{label}</div>
        <p className="mt-0.5 max-w-[46ch] text-[12.5px] text-slate">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function Select({ value, onChange }: { value: number; onChange: (v: 0 | 1 | 2) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value) as 0 | 1 | 2)}
      className="h-9 w-full rounded-xs border border-rule bg-white px-2.5 text-[13px] outline-none focus:border-ink"
    >
      {LEVELS.map((l) => (
        <option key={l.v} value={l.v}>{l.label}</option>
      ))}
    </select>
  );
}

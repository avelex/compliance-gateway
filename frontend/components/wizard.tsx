"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { SYMBOL, type Token } from "@/lib/data";

type Kind = "screening" | "regulated";

const KINDS: Record<Kind, { title: string; blurb: string; rows: [string, string][] }> = {
  screening: {
    title: "Take crypto payments",
    blurb:
      "A shop, a SaaS, anything without a licence. Every payment is still screened for where the money came from — you just never ask anyone for a document.",
    rows: [
      ["Under the threshold", "No identity check"],
      ["At or above it", "No identity check"],
      ["Threshold", "Not used"],
      ["Risk ceiling", "80 of 100"],
    ],
  },
  regulated: {
    title: "Work under a licence",
    blurb:
      "An issuer, a law firm, real estate. Small payments clear on a selfie check; anything at or above the threshold needs a passport.",
    rows: [
      ["Under the threshold", "Selfie check"],
      ["At or above it", "Passport check"],
      ["Threshold", "1,000"],
      ["Risk ceiling", "50 of 100"],
    ],
  },
};

export function Wizard() {
  const [kind, setKind] = useState<Kind>("regulated");
  const [token, setToken] = useState<Token>("USDC");
  const [state, setState] = useState<"idle" | "deploying">("idle");
  const router = useRouter();

  function deploy() {
    setState("deploying");
    setTimeout(() => router.push("/gateways/0x2c91"), 1400);
  }

  return (
    <div className="mt-10 space-y-10">
      <section>
        <h2 className="text-[15px] font-medium">What kind of business is this?</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {(Object.keys(KINDS) as Kind[]).map((k) => {
            const on = kind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                aria-pressed={on}
                className={`rounded-xs border p-4 text-left transition-colors ${
                  on ? "border-ink bg-wash" : "border-rule hover:border-slate"
                }`}
              >
                <div className="text-[14.5px] font-medium">{KINDS[k].title}</div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-slate">{KINDS[k].blurb}</p>
                <dl className="mt-4 space-y-1.5 border-t border-rule pt-3">
                  {KINDS[k].rows.map(([l, v]) => (
                    <div key={l} className="flex justify-between gap-4 text-[12.5px]">
                      <dt className="text-slate">{l}</dt>
                      <dd className="tnum">
                        {l === "Threshold" && v !== "Not used" ? SYMBOL[token] + v : v}
                      </dd>
                    </div>
                  ))}
                </dl>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-[15px] font-medium">Which token do you settle in?</h2>
        <div className="mt-4 flex gap-2">
          {(["USDC", "EURC"] as Token[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setToken(t)}
              aria-pressed={token === t}
              className={`h-9 rounded-xs border px-4 text-[13px] transition-colors ${
                token === t ? "border-ink bg-ink text-white" : "border-rule hover:border-slate"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="mt-3 max-w-[52ch] text-[12.5px] text-slate">
          A gateway settles one token, and that cannot be changed after deployment. To take both,
          deploy a second gateway.
        </p>
      </section>

      <section className="border-t border-ink pt-6">
        <dl className="grid gap-x-10 gap-y-3 sm:grid-cols-2">
          <Line label="Network" value="Base Sepolia" />
          <Line label="Token" value={token} />
          <Line label="Settles to" value="0x9E44…7f30" mono />
          <Line label="Gas" value="Covered for you" />
        </dl>

        <div className="mt-7 flex items-center gap-4">
          <Button onClick={deploy} disabled={state === "deploying"}>
            {state === "deploying" ? "Deploying…" : "Deploy gateway"}
          </Button>
          <span className="text-[12.5px] text-slate">
            {state === "deploying" ? "Waiting for the transaction to confirm" : "Takes about 5 seconds"}
          </span>
        </div>
      </section>
    </div>
  );
}

function Line({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-6 border-b border-rule pb-2.5">
      <dt className="text-[13px] text-slate">{label}</dt>
      <dd className={`text-[13px] ${mono ? "font-mono text-[12.5px]" : ""}`}>{value}</dd>
    </div>
  );
}

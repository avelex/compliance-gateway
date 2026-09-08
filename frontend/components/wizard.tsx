"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { Button, ErrorNote, TxLink } from "@/components/ui";
import { SYMBOL, short, type Policy, type Token } from "@/lib/data";
import { useOrgWallet } from "@/components/login-gate";
import { merchantPolicyId, setMerchantPolicyId } from "@/lib/names";

type Kind = "screening" | "regulated";

const POLICIES: Record<Kind, Policy> = {
  screening: { levelBelow: 0, levelAbove: 0, threshold: 0, maxRisk: 80 },
  regulated: { levelBelow: 1, levelAbove: 2, threshold: 1000, maxRisk: 50 },
};

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
  const router = useRouter();
  const { getAccessToken } = usePrivy();
  const wallet = useOrgWallet();
  const [kind, setKind] = useState<Kind | null>(null);
  const [token, setToken] = useState<Token>("USDC");
  const [step, setStep] = useState<"edit" | "confirm" | "deploying">("edit");
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<{ message: string; hash?: string } | null>(null);

  async function deploy() {
    setStep("deploying");
    setFailed(false);
    setError(null);
    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${await getAccessToken()}`,
        },
        body: JSON.stringify({
          token,
          policy: POLICIES[kind!],
          // A hint only, so the route can widen the merchant's existing permission policy
          // before the first grant exists to read it from. The route re-derives it from the
          // wallet and rejects any id whose policy is not named for the caller.
          policyId: wallet ? merchantPolicyId(wallet.address) : undefined,
        }),
      });
      if (!res.ok) {
        let message = "The gateway was not deployed.";
        let hash: string | undefined;
        try {
          const body = await res.json();
          message = body.error ?? message;
          hash = body.hash;
        } catch {
          // Non-JSON body (e.g. a framework-level 500) — fall back to the plain sentence
          // rather than showing the merchant a raw parse error.
        }
        // A response carrying a hash means the deploy was sent. Its own copy says "do not
        // retry", so it must not be handed a retry button.
        setError({ message, hash });
        setFailed(true);
        setStep("edit");
        return;
      }
      const body = await res.json();
      if (body.policyId && wallet) setMerchantPolicyId(wallet.address, body.policyId);
      // The deploy itself succeeded — this is a warning on the success path, not a
      // failure, so it travels as a query param rather than throwing. It's in hand
      // right here and needs no storage: nothing later in the flow has it.
      const warning = body.policyId ? "" : `&policyError=${encodeURIComponent(body.policyError ?? "")}`;
      router.push(`/gateways/${body.gate}?deployed=1${warning}`);
    } catch (e) {
      setError(e instanceof Error ? { message: e.message } : null);
      setFailed(true);
      setStep("edit");
    }
  }

  const chosen = kind ? KINDS[kind] : null;

  return (
    <div className="mt-10 space-y-10">
      <fieldset disabled={step !== "edit"}>
        <legend className="text-[15px] font-medium">What kind of business is this?</legend>
        <p className="mt-1.5 max-w-[56ch] text-[13px] text-slate">
          You can change this after deployment.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {(Object.keys(KINDS) as Kind[]).map((k) => {
            const on = kind === k;
            return (
              <label
                key={k}
                className={`cursor-pointer rounded-xs border p-4 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue ${
                  on ? "border-ink bg-wash" : "border-rule hover:border-slate"
                }`}
              >
                <input
                  type="radio"
                  name="business-kind"
                  value={k}
                  checked={on}
                  onChange={() => setKind(k)}
                  className="sr-only"
                />
                <span className="block text-[14.5px] font-medium">{KINDS[k].title}</span>
                <span className="mt-1.5 block text-[13px] leading-relaxed text-slate">
                  {KINDS[k].blurb}
                </span>
                <span className="mt-4 block space-y-1.5 border-t border-rule pt-3">
                  {KINDS[k].rows.map(([l, v]) => (
                    <span key={l} className="flex justify-between gap-4 text-[12.5px]">
                      <span className="text-slate">{l}</span>
                      <span className="tnum">
                        {l === "Threshold" && v !== "Not used" ? SYMBOL[token] + v : v}
                      </span>
                    </span>
                  ))}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset disabled={step !== "edit"}>
        <legend className="text-[15px] font-medium">Which token do you settle in?</legend>
        <div className="mt-4 flex gap-2">
          {(["USDC", "EURC"] as Token[]).map((t) => (
            <label
              key={t}
              className={`cursor-pointer rounded-xs border px-4 text-[13px] leading-9 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue ${
                token === t ? "border-ink bg-ink text-white" : "border-rule hover:border-slate"
              }`}
            >
              <input
                type="radio"
                name="token"
                value={t}
                checked={token === t}
                onChange={() => setToken(t)}
                className="sr-only"
              />
              {t}
            </label>
          ))}
        </div>
        <p className="mt-3 max-w-[52ch] text-[12.5px] text-slate">
          A gateway settles one token, and that cannot be changed after deployment. To take
          both, deploy a second gateway.
        </p>
      </fieldset>

      <section className="border-t border-ink pt-6">
        {failed && (
          <div className="mb-6">
            <ErrorNote
              onRetry={error?.hash ? undefined : deploy}
              retryLabel="Try deploying again"
            >
              {error?.message ??
                "The gateway was not deployed. Nothing was created and nothing was spent, and your choices above are still here."}
              {error?.hash && <TxLink tx={error.hash} />}
            </ErrorNote>
          </div>
        )}

        <dl className="grid gap-x-10 gap-y-3 sm:grid-cols-2">
          <Line label="Network" value="Base Sepolia" />
          <Line label="Token" value={token} />
          <Line label="Settles to" value={wallet ? short(wallet.address) : "—"} mono />
          <Line label="Gas" value="Covered for you" />
          <Line
            label="Policy"
            value={chosen ? chosen.title : "Choose a business type above"}
          />
          <Line
            label="Asks payers for"
            value={
              chosen
                ? chosen.rows[0][1] === "No identity check"
                  ? "Nothing — screening only"
                  : `${chosen.rows[0][1]} under ${SYMBOL[token]}1,000, ${chosen.rows[1][1].toLowerCase()} above`
                : "—"
            }
          />
        </dl>

        {step === "confirm" ? (
          <div role="status" className="mt-7 border border-rule bg-wash p-4">
            <h3 className="text-[14px] font-medium">Deploy this gateway?</h3>
            <p className="mt-1 max-w-[54ch] text-[13px] text-slate">
              It settles in <strong className="font-medium text-ink">{token}</strong>, and that
              cannot be changed later — a different token means a second gateway. Payers will be
              asked for{" "}
              <strong className="font-medium text-ink">
                {chosen!.rows[0][1] === "No identity check"
                  ? "nothing beyond fund screening"
                  : `a ${chosen!.rows[0][1].toLowerCase()}, or a ${chosen!.rows[1][1].toLowerCase()} at ${SYMBOL[token]}1,000 and above`}
              </strong>
              . The policy is editable afterwards; the token is not.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button onClick={deploy}>Deploy in {token}</Button>
              <Button variant="quiet" onClick={() => setStep("edit")}>
                Go back
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button onClick={() => setStep("confirm")} disabled={!kind || step === "deploying"}>
              {step === "deploying" ? "Deploying…" : "Review and deploy"}
            </Button>
            <span className="text-[12.5px] text-slate">
              {step === "deploying"
                ? "Waiting for the transaction to confirm"
                : kind
                  ? "One transaction, about 5 seconds."
                  : "Choose a business type to continue."}
            </span>
          </div>
        )}
      </section>
    </div>
  );
}

function Line({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-6 border-b border-rule pb-2.5">
      <dt className="shrink-0 text-[13px] text-slate">{label}</dt>
      <dd className={`text-right text-[13px] ${mono ? "font-mono text-[12.5px]" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button, ErrorNote, TxOrIds } from "@/components/ui";
import { short, SYMBOL, type Policy, type Token } from "@/lib/data";

const LEVELS = ["No identity check", "Selfie check", "Passport check"];

type Pending = {
  gate: string;
  policy: Policy;
  token?: Token;
  requestedBy: string;
  mine: boolean;
  have: number;
  need: number;
  expiresAt: number;
};

export function ApprovalPanel({ id }: { id: string }) {
  const { getAccessToken } = usePrivy();
  const [pending, setPending] = useState<Pending | null>(null);
  // "gone" is a genuine 404 from the server — final, no retry (it either expired or was
  // used). "loadFailed" is us never reaching the server — retryable, and must not be told
  // to the approver as "this does not exist" (see loadGateway in lib/gateways.ts).
  const [gone, setGone] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{
    hash?: string;
    transactionId?: string;
    userOpHash?: string;
    status: "confirmed" | "unconfirmed" | "reverted";
  } | null>(null);

  useEffect(() => {
    let live = true;
    setGone(null);
    setLoadFailed(false);
    getAccessToken()
      .then((t) =>
        fetch(`/api/privy/set-policy/approve?id=${encodeURIComponent(id)}`, {
          headers: { authorization: `Bearer ${t}` },
        }),
      )
      .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (!live) return;
        if (ok) setPending(body);
        else setGone(body.error ?? "That approval is not available.");
      })
      .catch(() => live && setLoadFailed(true));
    return () => {
      live = false;
    };
  }, [getAccessToken, id, reload]);

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/privy/set-policy/approve", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${await getAccessToken()}`,
        },
        body: JSON.stringify({ approvalId: id }),
      });
      const body = await res.json().catch(() => ({}) as Record<string, string>);
      if (body.status === "confirmed" || body.status === "unconfirmed" || body.status === "reverted") {
        setSent({ hash: body.hash, transactionId: body.transactionId, userOpHash: body.userOpHash, status: body.status });
      } else if (body.status === "awaiting") {
        setPending((p) => (p ? { ...p, have: body.have, need: body.need, expiresAt: body.expiresAt, mine: true } : p));
      } else {
        setError(body.error ?? "The approval was not recorded. Nothing was sent.");
      }
    } catch {
      setError("The approval was not recorded. Nothing was sent — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (gone) return <p className="mt-9 max-w-[54ch] text-slate">{gone}</p>;
  if (loadFailed) {
    return (
      <div className="mt-9 max-w-[54ch]">
        <ErrorNote onRetry={() => setReload((n) => n + 1)} retryLabel="Try reading it again">
          We could not read this approval. That tells you nothing about whether it still
          exists — nothing was sent either way.
        </ErrorNote>
      </div>
    );
  }
  if (!pending) return <p className="mt-9 text-slate">Loading this request…</p>;

  if (sent) {
    const title =
      sent.status === "confirmed"
        ? "Approved and sent"
        : sent.status === "unconfirmed"
          ? "Approved — sending"
          : "Approved, sent, and reverted";
    const body =
      sent.status === "confirmed"
        ? "The policy is on chain now. Payments already in screening keep the policy they started under."
        : sent.status === "unconfirmed"
          ? "It was sent, but we could not confirm the outcome in time. It may still land — check the transaction before anyone tries this change again."
          : "It was sent and the transaction reverted, so the policy is unchanged. This is not a system error — check the transaction for why, then start the change again if it still applies.";
    return (
      <div role="status" className="mt-9 max-w-[54ch] border border-rule bg-wash p-4">
        <h2 className="text-[14px] font-medium">{title}</h2>
        <p className="mt-1 text-[13px] text-slate">{body}</p>
        <TxOrIds hash={sent.hash} transactionId={sent.transactionId} userOpHash={sent.userOpHash} />
      </div>
    );
  }

  const p = pending.policy;
  const symbol = pending.token ? SYMBOL[pending.token] : "";
  const last = pending.have + 1 >= pending.need;
  const deadline = new Date(pending.expiresAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="mt-9 max-w-[54ch]">
      <dl className="space-y-1 border-t border-rule pt-4 text-[13px]">
        <Row label="Gateway" value={short(pending.gate, 10, 6)} mono />
        <Row label="Requested by" value={short(pending.requestedBy, 16, 6)} mono />
        <Row label="What changes" value={policyChangeSentence(p, symbol)} wide />
        <Row label="Approvals" value={`${pending.have} of ${pending.need}`} />
        <Row label="Expires" value={deadline} />
      </dl>

      {error && (
        <div className="mt-4">
          <ErrorNote onRetry={approve} retryLabel="Try again">
            {error}
          </ErrorNote>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button onClick={approve} disabled={busy || pending.mine}>
          {busy ? "Approving…" : "Approve this change"}
        </Button>
        <span className="max-w-[42ch] text-[12.5px] text-slate">
          {pending.mine
            ? "You have already approved this. It needs someone else on your team."
            : last
              ? "Your team decided this needs one more approval — yours is it. Clicking sends the change on chain immediately."
              : `Your team decided this change needs ${pending.need} approvals before it is sent. Approving now records your vote; it still needs ${pending.need - pending.have - 1} more before anything goes on chain.`}{" "}
          This is not enforced by Privy or by the wallet — it is a control this dashboard applies.
        </span>
      </div>
      {pending.expiresAt <= Date.now() && (
        <p className="mt-3 text-[12.5px] text-slate">
          This may have expired while the page was open — approving will tell you if it has.
        </p>
      )}
    </div>
  );
}

/** Levels: 0 = no identity check, 1 = selfie check, 2 = passport check. Spelled out in words —
 *  a compliance officer approving blind needs the change, not the raw numbers. */
function policyChangeSentence(p: Policy, symbol: string): string {
  if (p.levelAbove === 0 && p.levelBelow === 0) return "Screening only — no identity check at any amount.";
  const below = LEVELS[p.levelBelow];
  const above = LEVELS[p.levelAbove];
  // A missing symbol means the gateway read failed (see the `token` fetch above), not that the
  // threshold has no currency. Say so instead of rendering a bare, currency-less number on a
  // screen whose whole purpose is approving an amount.
  const amount = symbol
    ? `${symbol}${p.threshold.toLocaleString("en-US")}`
    : `${p.threshold.toLocaleString("en-US")} (currency unavailable)`;
  return `Under ${amount}, payers need ${below.toLowerCase()}. At or above it, ${above.toLowerCase()}. Risk ceiling ${p.maxRisk}.`;
}

function Row({ label, value, mono, wide }: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={`flex gap-6 border-b border-rule pb-2.5 ${wide ? "justify-between" : "justify-between"}`}>
      <dt className="shrink-0 text-slate">{label}</dt>
      <dd className={`text-right ${wide ? "max-w-[36ch]" : ""} ${mono ? "font-mono text-[12.5px]" : ""}`}>{value}</dd>
    </div>
  );
}

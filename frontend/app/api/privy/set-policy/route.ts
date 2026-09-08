import { NextResponse } from "next/server";
import { APIError } from "@privy-io/node";
import type { Address } from "viem";
import { validatePolicy } from "@/lib/policy";
import { requireMerchant, Unauthorized, Misconfigured } from "@/lib/privy-server";
import { findMerchantQuorum } from "@/lib/privy-quorum";
import { put } from "@/lib/pending-approvals";
import { sendSetPolicy, assertOwns, reportTx, reportPending, SendPending } from "@/lib/set-policy-tx";
import type { Policy } from "@/lib/data";

export async function POST(req: Request) {
  let merchant;
  try {
    merchant = await requireMerchant(req);
  } catch (e) {
    if (e instanceof Unauthorized) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof Misconfigured) return NextResponse.json({ error: "Privy is not configured." }, { status: 503 });
    throw e;
  }

  let gate: Address, policy: Policy;
  try {
    ({ gate, policy } = (await req.json()) as { gate: Address; policy: Policy });
  } catch {
    return NextResponse.json({ error: "The request body is not valid JSON." }, { status: 400 });
  }

  const invalid = validatePolicy(policy);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  // The gateway must belong to the caller. Privy's policy already pins the destination,
  // but the check belongs here too: this route decides which gate address it is even asked for.
  const notYours = await assertOwns(gate, merchant.address);
  if (notYours) {
    return NextResponse.json({ error: notYours }, { status: notYours.startsWith("Could") ? 502 : 403 });
  }

  // The caller's own token is what authorizes the wallet, so it has to be the one we were
  // handed on this request — not one we stored.
  const token = req.headers.get("authorization")!.slice(7);

  // How many people the merchant decided this takes. A missing quorum (they have not deployed
  // yet, or Task 4's create failed) means one — never a number that blocks them out of their
  // own gateway.
  const team = await findMerchantQuorum(merchant.did).catch(() => undefined);
  const threshold = team?.threshold ?? 1;

  if (threshold <= 1) {
    let hash: string, userOpHash: string | undefined;
    try {
      ({ hash, userOpHash } = await sendSetPolicy({ walletId: merchant.walletId, token, gate, policy }));
    } catch (e) {
      // Must be checked before the generic branch below: Privy accepted this send, so it is
      // not a refusal and must not be told to the merchant as one (see SendPending's comment).
      if (e instanceof SendPending) return reportPending(e);
      // APIError.makeMessage composes status + response body only; anything else could carry
      // key material from viem/node internals and must not reach the client.
      const message = e instanceof APIError ? e.message : "Privy refused the transaction";
      const status = /signer|authoriz|policy/i.test(message) ? 403 : 502;
      return NextResponse.json({ error: message }, { status });
    }
    return reportTx(hash, userOpHash);
  }

  // Threshold ≥ 2: nothing is sent yet. Hold the intent and hand back a link.
  const approvalId = crypto.randomUUID();
  const approval = put({
    id: approvalId,
    did: merchant.did,
    walletId: merchant.walletId,
    token,
    gate,
    policy,
    threshold,
    // Long enough to find a colleague and for them to click; short enough that a held
    // access token is not held for the afternoon.
    expiresAt: Date.now() + 10 * 60_000,
  });

  return NextResponse.json({
    status: "awaiting",
    approvalId,
    approveUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/approve/${approvalId}`,
    have: approval.approvals.length,
    need: threshold,
    expiresAt: approval.expiresAt,
  });
}

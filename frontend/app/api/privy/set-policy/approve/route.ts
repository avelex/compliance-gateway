import { NextResponse } from "next/server";
import { APIError } from "@privy-io/node";
import { requireMerchant, Unauthorized, Misconfigured } from "@/lib/privy-server";
import { findMerchantQuorum, quorumMembers } from "@/lib/privy-quorum";
import { get, approve, take } from "@/lib/pending-approvals";
import { sendSetPolicy, reportTx, reportPending, SendPending } from "@/lib/set-policy-tx";
import { readGateway } from "@/lib/gateways";

async function caller(req: Request) {
  try {
    return { merchant: await requireMerchant(req) };
  } catch (e) {
    if (e instanceof Unauthorized)
      return { response: NextResponse.json({ error: e.message }, { status: 401 }) };
    if (e instanceof Misconfigured)
      return { response: NextResponse.json({ error: "Privy is not configured." }, { status: 503 }) };
    throw e;
  }
}

/** Is this caller on the asking merchant's team? Anyone else must not learn that the approval
 *  exists, let alone what policy it would set. */
async function onTheTeam(askerDid: string, callerDid: string): Promise<boolean> {
  if (askerDid === callerDid) return true;
  const team = await findMerchantQuorum(askerDid);
  if (!team) return false;
  return (await quorumMembers(team.quorumId)).includes(callerDid);
}

export async function GET(req: Request) {
  const { merchant, response } = await caller(req);
  if (response) return response;

  const id = new URL(req.url).searchParams.get("id") ?? "";
  const approval = get(id);
  // One message for "never existed", "expired" and "not yours" — a different sentence for each
  // would tell a stranger which ids are real.
  const denied = NextResponse.json(
    { error: "That approval is not available. It may have expired, or already been sent." },
    { status: 404 },
  );
  if (!approval) return denied;
  if (!(await onTheTeam(approval.did, merchant.did).catch(() => false))) return denied;

  // Note what is absent: the asker's Privy access token and walletId never leave this
  // process. `token` below is the gateway's settlement token symbol (USDC/EURC) — public
  // on-chain data, unrelated to the credential of the same field name in PendingApproval.
  const gateway = await readGateway(approval.gate).catch(() => undefined);

  return NextResponse.json({
    gate: approval.gate,
    policy: approval.policy,
    token: gateway?.token,
    requestedBy: approval.did,
    mine: approval.approvals.includes(merchant.did),
    have: approval.approvals.length,
    need: approval.threshold,
    expiresAt: approval.expiresAt,
  });
}

export async function POST(req: Request) {
  const { merchant, response } = await caller(req);
  if (response) return response;

  let approvalId: string;
  try {
    ({ approvalId } = (await req.json()) as { approvalId: string });
  } catch {
    return NextResponse.json({ error: "The request body is not valid JSON." }, { status: 400 });
  }

  const pending = get(approvalId);
  if (!pending || !(await onTheTeam(pending.did, merchant.did).catch(() => false))) {
    return NextResponse.json(
      { error: "That approval is not available. It may have expired, or already been sent." },
      { status: 404 },
    );
  }

  const result = approve(approvalId, merchant.did);
  if (!result.ok) {
    const message = {
      unknown: "That approval no longer exists. Start the change again.",
      expired: "That approval expired before it was completed. Nothing was sent — start again.",
      duplicate: "You have already approved this change. It needs someone else on your team.",
    }[result.reason];
    return NextResponse.json({ error: message }, { status: 409 });
  }

  if (!result.ready) {
    return NextResponse.json({
      status: "awaiting",
      have: result.approval.approvals.length,
      need: result.approval.threshold,
      expiresAt: result.approval.expiresAt,
    });
  }

  // Remove before sending: a change must send at most once, even if two people race the
  // last approval.
  const ready = take(approvalId);
  if (!ready) return NextResponse.json({ error: "That approval was already sent." }, { status: 409 });

  let hash: string, userOpHash: string | undefined;
  try {
    ({ hash, userOpHash } = await sendSetPolicy({
      walletId: ready.walletId,
      token: ready.token,
      gate: ready.gate,
      policy: ready.policy,
    }));
  } catch (e) {
    // Must be checked before the generic branch below: Privy accepted this send, so it is
    // not a refusal and must not be told to the merchant as one (see SendPending's comment).
    if (e instanceof SendPending) return reportPending(e);
    const message = e instanceof APIError ? e.message : "Privy refused the transaction";
    // The asker's token can expire inside the window. Say so plainly — it is the difference
    // between "ask them to try again" and "something is broken".
    const status = /expire|authoriz|signer|token/i.test(message) ? 403 : 502;
    return NextResponse.json({ error: message }, { status });
  }

  return reportTx(hash, userOpHash);
}

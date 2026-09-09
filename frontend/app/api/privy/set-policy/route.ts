import { NextResponse } from "next/server";
import type { Address } from "viem";
import { encodeFunctionData } from "viem";
import { gatewayAbi } from "@/lib/abi/gateway";
import { validatePolicy, toContractPolicy } from "@/lib/policy";
import {
  requireMerchant,
  Unauthorized,
  Misconfigured,
} from "@/lib/privy-server";
import {
  findMerchantQuorum,
  quorumMembers,
  findOrgWallet,
} from "@/lib/privy-quorum";
import {
  prepareTransaction,
  submitTransaction,
  PrivyRefused,
} from "@/lib/privy-request";
import { put, get, addSignature, take } from "@/lib/pending-approvals";
import { assertOwns, reportTx } from "@/lib/set-policy-tx";
import { readGateway } from "@/lib/gateways";
import type { Policy } from "@/lib/data";

async function caller(req: Request) {
  try {
    return { merchant: await requireMerchant(req) };
  } catch (e) {
    if (e instanceof Unauthorized)
      return {
        response: NextResponse.json({ error: e.message }, { status: 401 }),
      };
    if (e instanceof Misconfigured)
      return {
        response: NextResponse.json(
          { error: "Privy is not configured." },
          { status: 503 },
        ),
      };
    throw e;
  }
}

/** One message for "never existed", "expired" and "not yours" — a different sentence for each
 *  would tell a stranger which ids are real. */
const denied = () =>
  NextResponse.json(
    {
      error:
        "That approval is not available. It may have expired, or already been sent.",
    },
    { status: 404 },
  );

/** Is this caller on the asking merchant's team? */
async function onTheTeam(
  askerDid: string,
  callerDid: string,
): Promise<boolean> {
  if (askerDid === callerDid) return true;
  const team = await findMerchantQuorum(askerDid);
  if (!team) return false;
  return (await quorumMembers(team.quorumId)).includes(callerDid);
}

/** Read a pending change — what a teammate opening the link is shown before they sign. */
export async function GET(req: Request) {
  const { merchant, response } = await caller(req);
  if (response) return response;

  const approval = get(new URL(req.url).searchParams.get("id") ?? "");
  if (!approval) return denied();
  if (!(await onTheTeam(approval.did, merchant.did).catch(() => false)))
    return denied();

  // Note what is absent: nothing here is a credential. `signable` is the request the approver's
  // own browser is about to sign, and `token` below is the gateway's settlement symbol.
  const gateway = await readGateway(approval.gate).catch(() => undefined);

  return NextResponse.json({
    gate: approval.gate,
    policy: approval.policy,
    current: gateway?.policy,
    token: gateway?.token,
    requestedBy: approval.did,
    mine: approval.approvals.includes(merchant.did),
    have: approval.signatures.length,
    need: approval.threshold,
    expiresAt: approval.expiresAt,
    signable: approval.signable,
  });
}

export async function POST(req: Request) {
  const { merchant, response } = await caller(req);
  if (response) return response;

  let payload: {
    gate?: Address;
    policy?: Policy;
    requestId?: string;
    signature?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "The request body is not valid JSON." },
      { status: 400 },
    );
  }

  return payload.requestId
    ? sign(payload.requestId, payload.signature, merchant.did)
    : prepare(payload.gate, payload.policy, merchant.did);
}

/** Phase one. Builds the exact bytes the merchant's browser will sign. Nothing is sent. */
async function prepare(
  gate: Address | undefined,
  policy: Policy | undefined,
  did: string,
) {
  if (!gate || !policy)
    return NextResponse.json(
      { error: "A gateway and a policy are required." },
      { status: 400 },
    );

  const invalid = validatePolicy(policy);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  let team;
  try {
    team = await findMerchantQuorum(did);
  } catch {
    return NextResponse.json(
      { error: "Could not reach Privy. Nothing was sent — try again." },
      { status: 502 },
    );
  }
  // A missing quorum means this account isn't the one that deployed the gateway: only the
  // deployer's own account can start a change here, but any teammate can approve one from the
  // link they are sent.
  if (!team)
    return NextResponse.json(
      {
        error:
          "Only the account that deployed this gateway can start a policy change. Ask them to send you the approval link.",
      },
      { status: 409 },
    );

  let wallet;
  try {
    wallet = await findOrgWallet(team.quorumId);
  } catch {
    return NextResponse.json(
      { error: "Could not reach Privy. Nothing was sent — try again." },
      { status: 502 },
    );
  }
  if (!wallet)
    return NextResponse.json(
      { error: "Your organisation wallet is missing." },
      { status: 409 },
    );

  // The gateway must belong to the caller's organisation wallet. Nothing else stops one merchant
  // from pointing this route at another's gateway.
  const notYours = await assertOwns(gate, wallet.address);
  if (notYours)
    return NextResponse.json(
      { error: notYours },
      { status: notYours.startsWith("Could") ? 502 : 403 },
    );

  const data = encodeFunctionData({
    abi: gatewayAbi,
    functionName: "setPolicy",
    args: [toContractPolicy(policy)],
  });
  const { prepared, signable } = prepareTransaction({
    walletId: wallet.walletId,
    to: gate,
    data,
  });

  const requestId = crypto.randomUUID();
  const approval = put({
    id: requestId,
    did,
    gate,
    policy,
    threshold: team.threshold,
    prepared,
    signable,
    // Read off the signed payload itself, not a fresh Date.now() — every signature is over
    // `privy-request-expiry`, and a request held past it is refused by Privy with 401 rather
    // than sent, so this must not outlive that exact value.
    expiresAt: Number(prepared.expiry),
  });

  return NextResponse.json({
    requestId,
    signable,
    have: 0,
    need: approval.threshold,
    expiresAt: approval.expiresAt,
  });
}

/** Phase two. Records one signature and, once there are enough, sends the stored bytes. */
async function sign(
  requestId: string,
  signature: string | undefined,
  did: string,
) {
  if (!signature)
    return NextResponse.json(
      { error: "A signature is required." },
      { status: 400 },
    );

  const pending = get(requestId);
  if (!pending || !(await onTheTeam(pending.did, did).catch(() => false)))
    return denied();

  const result = addSignature(requestId, did, signature);
  if (!result.ok) {
    const message = {
      unknown: "That change no longer exists. Start it again.",
      expired:
        "That change expired before it was completed. Nothing was sent — start again.",
      duplicate:
        "You have already approved this change. It needs someone else on your team.",
    }[result.reason];
    return NextResponse.json({ error: message }, { status: 409 });
  }

  if (!result.ready) {
    return NextResponse.json({
      status: "awaiting",
      have: result.approval.signatures.length,
      need: result.approval.threshold,
      expiresAt: result.approval.expiresAt,
    });
  }

  // Remove before sending: a change must go out at most once, even if two people race the last
  // signature.
  const ready = take(requestId);
  if (!ready)
    return NextResponse.json(
      { error: "That change was already sent." },
      { status: 409 },
    );

  let sent;
  try {
    sent = await submitTransaction(ready.prepared, ready.signatures);
  } catch (e) {
    if (e instanceof PrivyRefused) {
      // Privy refused before broadcasting: an expired payload, or too few signatures for a
      // quorum it enforces itself. Nothing is in flight, so this is safe to describe as failed.
      const status = e.status === 401 || e.status === 403 ? 403 : 502;
      return NextResponse.json({ error: e.message }, { status });
    }
    // Anything else — a socket reset, a timeout — happened after the request left the process,
    // so unlike PrivyRefused above, we cannot tell whether it was actually sent. The approval is
    // already taken, so say the same "unconfirmed, do not retry" thing the missing-hash branch
    // below says, not that it failed.
    return NextResponse.json(
      {
        status: "unconfirmed",
        error:
          "The policy change was sent but we could not confirm it. Do not retry — check this transaction before trying again.",
      },
      { status: 502 },
    );
  }

  if (!sent.hash) {
    // A sponsored send comes back with an empty hash and a transaction_id; the bundler fills it
    // in. Report it honestly rather than inventing a confirmation.
    return NextResponse.json(
      {
        status: "unconfirmed",
        error:
          "The policy change was sent but we could not confirm it. Do not retry — check this transaction before trying again.",
        transactionId: sent.transactionId,
        userOpHash: sent.userOpHash,
      },
      { status: 502 },
    );
  }
  return reportTx(sent.hash, sent.userOpHash);
}

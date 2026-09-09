import { NextResponse } from "next/server";
import { APIError } from "@privy-io/node";
import { encodeFunctionData, decodeEventLog } from "viem";
import { publicClient, FACTORY, TOKENS } from "@/lib/chain";
import { factoryAbi } from "@/lib/abi/factory";
import { toContractPolicy, validatePolicy } from "@/lib/policy";
import { requireMerchant, Unauthorized, Misconfigured } from "@/lib/privy-server";
import { findMerchantQuorum, ensureOrgWallet } from "@/lib/privy-quorum";
import { prepareTransaction, submitTransaction, PrivyRefused } from "@/lib/privy-request";
import type { Policy, Token } from "@/lib/data";

const RECEIPT_TIMEOUT = 20_000;

/** Deploy requests waiting for their signature. Same lifetime and same reasoning as
 *  lib/pending-approvals.ts, but a deploy needs no quorum: one person, one signature. */
const pending = new Map<string, { prepared: ReturnType<typeof prepareTransaction>["prepared"]; wallet: `0x${string}` }>();

export async function POST(req: Request) {
  let merchant;
  try {
    merchant = await requireMerchant(req);
  } catch (e) {
    if (e instanceof Unauthorized) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof Misconfigured) return NextResponse.json({ error: "Privy is not configured." }, { status: 503 });
    throw e;
  }

  let payload: { token?: Token; policy?: Policy; requestId?: string; signature?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "The request body is not valid JSON." }, { status: 400 });
  }

  if (payload.requestId) return submit(payload.requestId, payload.signature);

  const { token, policy } = payload;
  if (!token || !Object.hasOwn(TOKENS, token)) return NextResponse.json({ error: "Unknown token" }, { status: 400 });
  if (!policy) return NextResponse.json({ error: "A policy is required." }, { status: 400 });
  const invalid = validatePolicy(policy);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  if (!FACTORY) return NextResponse.json({ error: "The gateway factory is not configured." }, { status: 503 });

  // The quorum and the organization wallet MUST already exist since the setup wizard blocks the UI
  let wallet;
  try {
    const team = await findMerchantQuorum(merchant.did);
    if (!team) throw new Error("Organization not found. Complete the setup wizard first.");
    wallet = await ensureOrgWallet(team.quorumId, team.organizationId);
  } catch (e) {
    const message = e instanceof APIError ? e.message : "Your organisation wallet could not be created.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const data = encodeFunctionData({
    abi: factoryAbi,
    functionName: "deploy",
    args: [
      {
        merchant: wallet.address,
        payoutTo: wallet.address,
        token: TOKENS[token],
        policy: toContractPolicy(policy),
      },
    ],
  });
  const { prepared, signable } = prepareTransaction({ walletId: wallet.walletId, to: FACTORY, data });
  const requestId = crypto.randomUUID();
  pending.set(requestId, { prepared, wallet: wallet.address });
  return NextResponse.json({ requestId, signable });
}

async function submit(requestId: string, signature: string | undefined) {
  const held = pending.get(requestId);
  if (!held) return NextResponse.json({ error: "That deployment expired. Start again." }, { status: 404 });
  if (!signature) return NextResponse.json({ error: "A signature is required." }, { status: 400 });
  pending.delete(requestId);

  let sent;
  try {
    sent = await submitTransaction(held.prepared, [signature]);
  } catch (e) {
    if (e instanceof PrivyRefused) return NextResponse.json({ error: e.message }, { status: 502 });
    return NextResponse.json({ error: "The deployment transaction could not be sent." }, { status: 502 });
  }
  if (!sent.hash) {
    // The bundler has not resolved a hash yet. The gateway list finds the gateway by owner once
    // it lands, so the wizard can send the merchant there rather than to a URL it cannot build.
    return NextResponse.json(
      {
        error:
          "The deployment was sent but we could not confirm it. Do not retry — it will appear in your gateways when it lands.",
        transactionId: sent.transactionId,
      },
      { status: 502 },
    );
  }

  let receipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({ hash: sent.hash as `0x${string}`, confirmations: 1, timeout: RECEIPT_TIMEOUT });
  } catch {
    return NextResponse.json(
      {
        error:
          "The deployment was sent but we could not confirm it. Do not retry — it will appear in your gateways when it lands.",
        hash: sent.hash,
      },
      { status: 502 },
    );
  }
  if (receipt.status !== "success") {
    return NextResponse.json({ error: "The deployment transaction reverted", hash: sent.hash }, { status: 502 });
  }

  // A sponsored send rides in a shared bundle, and GatewayDeployed(address indexed gate) carries
  // no merchant field — so "the first event that parses" can be someone else's gateway. Read
  // owner() on each candidate and keep the one that is ours.
  const candidates = receipt.logs
    .filter((log) => log.address.toLowerCase() === FACTORY.toLowerCase())
    .flatMap((log) => {
      try {
        const decoded = decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics });
        return decoded.eventName === "GatewayDeployed" ? [decoded.args.gate as `0x${string}`] : [];
      } catch {
        return [];
      }
    });
  const owners = await publicClient.multicall({
    contracts: candidates.map((address) => ({ address, abi: gatewayAbiOwner, functionName: "owner" as const })),
  });
  const gate = candidates.find(
    (_, i) => owners[i].status === "success" && (owners[i].result as string).toLowerCase() === held.wallet.toLowerCase(),
  );
  if (!gate) return NextResponse.json({ error: "Deployed, but no gateway of yours was found in that block" }, { status: 502 });

  return NextResponse.json({ gate, hash: sent.hash });
}

const gatewayAbiOwner = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

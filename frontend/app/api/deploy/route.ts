import { NextResponse } from "next/server";
import { APIError } from "@privy-io/node";
import { createWalletClient, http, decodeEventLog } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, publicClient, FACTORY, TOKENS } from "@/lib/chain";
import { factoryAbi } from "@/lib/abi/factory";
import { toContractPolicy, validatePolicy } from "@/lib/policy";
import { requireMerchant, Unauthorized, Misconfigured } from "@/lib/privy-server";
import { ensureMerchantQuorum } from "@/lib/privy-quorum";
import type { Policy, Token } from "@/lib/data";

/** Comfortably under a typical platform request cap (Vercel 60s, nginx 504) so the
 *  route's own honest timeout branch fires instead of the host cutting the response
 *  and the wizard reporting a successful deploy as a failure. */
const RECEIPT_TIMEOUT = 20_000;

// Built lazily (not at module load) so an unset DEPLOYER_PRIVATE_KEY doesn't crash the
// whole server on import — mirrors lib/chain.ts's "don't throw until first use" pattern.
function getRelay() {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error("Relayer is not configured");
  const relayer = privateKeyToAccount(key as `0x${string}`);
  return createWalletClient({
    account: relayer,
    chain: baseSepolia,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL),
  });
}

export async function POST(req: Request) {
  let merchant;
  try {
    merchant = await requireMerchant(req);
  } catch (e) {
    if (e instanceof Unauthorized) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof Misconfigured) return NextResponse.json({ error: "Privy is not configured." }, { status: 503 });
    throw e;
  }

  let token: Token, policy: Policy;
  try {
    ({ token, policy } = (await req.json()) as { token: Token; policy: Policy });
  } catch {
    return NextResponse.json({ error: "The request body is not valid JSON." }, { status: 400 });
  }
  if (!Object.hasOwn(TOKENS, token)) return NextResponse.json({ error: "Unknown token" }, { status: 400 });

  const invalid = validatePolicy(policy);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  if (!FACTORY) return NextResponse.json({ error: "The gateway factory is not configured." }, { status: 503 });

  let relay;
  try {
    relay = getRelay();
  } catch {
    // Never log or echo the raw error: it can carry key material from viem's own message.
    return NextResponse.json({ error: "The relayer is not available" }, { status: 503 });
  }

  let hash: `0x${string}`;
  try {
    hash = await relay.writeContract({
      address: FACTORY,
      abi: factoryAbi,
      functionName: "deploy",
      args: [
        {
          merchant: merchant.address,
          payoutTo: merchant.address,
          token: TOKENS[token],
          policy: toContractPolicy(policy),
        },
      ],
    });
  } catch {
    // RPC hiccup, nonce collision, or an out-of-gas relayer. Nothing was sent that we
    // know of, so this is safe to retry.
    return NextResponse.json({ error: "The deployment transaction could not be sent." }, { status: 502 });
  }

  let receipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: RECEIPT_TIMEOUT });
  } catch {
    // The send succeeded (we have a real hash) but confirmation didn't. Telling the
    // merchant "it failed" here would be false and would invite a costly duplicate
    // deploy, so this must not read like the send-failed case above.
    return NextResponse.json(
      {
        error:
          "The deployment was sent but we could not confirm it. Do not retry — check this transaction before deploying again.",
        hash,
      },
      { status: 502 },
    );
  }
  if (receipt.status !== "success") {
    return NextResponse.json({ error: "The deployment transaction reverted", hash }, { status: 502 });
  }

  const gate = receipt.logs
    .filter((log) => log.address.toLowerCase() === FACTORY.toLowerCase())
    .map((log) => {
      try {
        return decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics });
      } catch {
        return null;
      }
    })
    .find((e) => e?.eventName === "GatewayDeployed")?.args.gate as `0x${string}` | undefined;

  if (!gate) return NextResponse.json({ error: "Deployed, but no GatewayDeployed event was found" }, { status: 502 });

  // The merchant's key quorum: who is on their team, and how many of them must approve a
  // policy change. It is our own bookkeeping — Privy does not enforce the threshold (the
  // wallet's owner is the merchant, and an owner's signature is sufficient on its own).
  // What it does buy us is a place to keep team membership without a database.
  //
  // As with the deploy above, a failure here must NOT read as "the deploy failed": the
  // gateway is deployed and paid for, and a non-200 would invite a duplicate deploy.
  let quorumId: string | null = null;
  let quorumError: string | null = null;
  try {
    ({ quorumId } = await ensureMerchantQuorum(merchant.did));
  } catch (e) {
    quorumError =
      e instanceof APIError ? e.message : "Your team could not be created. Policy changes still work.";
  }

  return NextResponse.json({ gate, hash, quorumId, quorumError });
}

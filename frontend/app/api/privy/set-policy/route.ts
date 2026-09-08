import { NextResponse } from "next/server";
import { APIError } from "@privy-io/node";
import { encodeFunctionData, type Address } from "viem";
import { gatewayAbi } from "@/lib/abi/gateway";
import { CAIP2, CHAIN_ID, publicClient } from "@/lib/chain";
import { toContractPolicy, validatePolicy } from "@/lib/policy";
import { getPrivy, requireMerchant, Unauthorized, Misconfigured } from "@/lib/privy-server";
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
  let owner: string;
  try {
    owner = (await publicClient.readContract({ address: gate, abi: gatewayAbi, functionName: "owner" })) as string;
  } catch {
    return NextResponse.json({ error: "Could not read this gateway from the chain." }, { status: 502 });
  }
  if (owner.toLowerCase() !== merchant.address.toLowerCase()) {
    return NextResponse.json({ error: "That gateway is not yours" }, { status: 403 });
  }

  const data = encodeFunctionData({
    abi: gatewayAbi,
    functionName: "setPolicy",
    args: [toContractPolicy(policy)],
  });

  const key = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY;
  if (!key) return NextResponse.json({ error: "Privy is not configured." }, { status: 503 });

  let hash: string;
  try {
    ({ hash } = await getPrivy()
      .wallets()
      .ethereum()
      .sendTransaction(merchant.walletId, {
        caip2: CAIP2,
        params: {
          transaction: {
            // Matches the "in" conditions app/api/deploy/route.ts set on this merchant's
            // Privy policy — but only one spelling each, chosen to match the SDK's own
            // viem encoder (src/viem.ts formatViemTransaction / formatViemQuantity):
            // chain_id as a number, value as a 0x-prefixed hex string. Quantity ("a hex
            // string or a non-negative integer") never means a decimal string.
            to: gate.toLowerCase(),
            data,
            value: "0x0",
            chain_id: CHAIN_ID,
          },
        },
        authorization_context: { authorization_private_keys: [key] },
      }));
  } catch (e) {
    // A missing or revoked signer grant lands here. Say which, don't say "something went
    // wrong" — but APIError.makeMessage composes status + response body only, so it's the
    // only error type here safe to echo verbatim; anything else could carry key material
    // from viem/node internals and must not reach the client.
    const message = e instanceof APIError ? e.message : "Privy refused the transaction";
    const status = /signer|authoriz|policy/i.test(message) ? 403 : 502;
    return NextResponse.json({ error: message }, { status });
  }

  // sendTransaction resolves on broadcast, not confirmation (see app/api/deploy/route.ts's
  // own drip comment) — the same three outcomes as that route apply here.
  let receipt;
  try {
    // Comfortably under a typical platform request cap (Vercel 60s, nginx 504) so this
    // route's own honest "unconfirmed" branch fires instead of the host truncating the
    // response and the form reporting a sent transaction as a failure.
    receipt = await publicClient.waitForTransactionReceipt({
      hash: hash as `0x${string}`,
      confirmations: 1,
      timeout: 20_000,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "The policy change was sent but we could not confirm it. Do not retry — check this transaction before trying again.",
        hash,
        status: "unconfirmed",
      },
      { status: 502 },
    );
  }
  if (receipt.status !== "success") {
    return NextResponse.json({ error: "The policy change transaction reverted", hash, status: "reverted" }, { status: 502 });
  }

  return NextResponse.json({ hash, status: "confirmed" });
}

import { NextResponse } from "next/server";
import { APIError } from "@privy-io/node";
import { createWalletClient, http, parseEther, decodeEventLog } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, publicClient, CHAIN_ID, FACTORY, TOKENS } from "@/lib/chain";
import { factoryAbi } from "@/lib/abi/factory";
import { gatewayAbi } from "@/lib/abi/gateway";
import { toContractPolicy, validatePolicy } from "@/lib/policy";
import { requireMerchant, Unauthorized, Misconfigured, getPrivy } from "@/lib/privy-server";
import type { Policy, Token } from "@/lib/data";

/** Enough Base Sepolia ETH for a handful of setPolicy calls. One drip, at deploy. */
const DRIP = parseEther("0.002");

/** Comfortably under a typical platform request cap (Vercel 60s, nginx 504) so the
 *  route's own honest timeout branch fires instead of the host cutting the response
 *  and the wizard reporting a successful deploy as a failure. */
const RECEIPT_TIMEOUT = 20_000;

/** Deterministic per merchant, and the only thing that proves a policy id the client
 *  handed us belongs to the caller: our key quorum owns these policies, so an
 *  unchecked id would let one merchant widen another's. */
const policyName = (did: string) => `CG setPolicy ${did.replace(/^did:privy:/, "")}`;

/** One rule, one merchant: send `setPolicy` to any gateway in `gates`, on Base Sepolia.
 *  `in` over both spellings because neither Privy's types nor its docs say whether it
 *  compares `to` checksummed or lowercased, or `chain_id` as decimal or hex — a wrong
 *  guess would deny every setPolicy forever. The engine accepts `in` on those two; it
 *  rejects it on `value`, which is why that condition is gone (see below). */
const rulesFor = (gates: string[]) => [
  {
    name: "setPolicy on this merchant's gateways",
    method: "eth_sendTransaction" as const,
    action: "ALLOW" as const,
    conditions: [
      { field_source: "ethereum_transaction" as const, field: "to" as const, operator: "in" as const, value: gates },
      { field_source: "ethereum_transaction" as const, field: "chain_id" as const, operator: "in" as const, value: [String(CHAIN_ID), `0x${CHAIN_ID.toString(16)}`] },
      // No `value` condition: Privy rejects `in` on that field ("Use one of: eq, gt, gte,
      // lt, lte"), and `eq` would be a bet on an encoding we cannot verify — a wrong guess
      // denies every setPolicy and looks identical to a missing grant. It is not needed:
      // MerchantGateway.setPolicy is nonpayable, so the calldata pin below already means a
      // value-carrying call reverts and the value comes back.
      // Without this the grant covers ANY call to the gateway, including
      // transferOwnership and setForwarderAddress(0) — i.e. the escrowed money.
      { field_source: "ethereum_calldata" as const, field: "function_name", abi: gatewayAbi, operator: "eq" as const, value: "setPolicy" },
    ],
  },
];

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

  let token: Token, policy: Policy, hintedPolicyId: unknown;
  try {
    ({ token, policy, policyId: hintedPolicyId } = (await req.json()) as {
      token: Token;
      policy: Policy;
      policyId?: unknown;
    });
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

  // The merchant will send setPolicy from this wallet later and has no ETH.
  // ponytail: a fixed drip from the relayer, best-effort. Privy gas sponsorship
  // (sendTransaction `sponsor: true`) replaces this if it turns out to cover Base Sepolia.
  // A drip failure must not turn a successful deployment into a reported failure: the
  // gateway is real and usable either way, so we still return 200 with `gate`/`hash`.
  // sendTransaction only resolves on broadcast, not confirmation, so even a "successful"
  // call here doesn't prove the merchant actually received the ETH — there is nothing
  // trustworthy to report back, so nothing is reported.
  try {
    const balance = await publicClient.getBalance({ address: merchant.address });
    // Dust is not gas. Top up anything that could not pay for a setPolicy.
    if (balance < DRIP / 2n) {
      await relay.sendTransaction({ to: merchant.address, value: DRIP });
    }
  } catch {
    // Swallowed on purpose — see comment above.
  }

  // The merchant grants our key quorum a signer scoped to this policy so a later
  // setPolicy can be sent from their wallet. Privy allows at most one policy per signer,
  // so it is one policy per merchant wallet, widened with each deploy.
  //
  // Unlike the failures above, this one must not read as "the deploy failed": the
  // gateway is already deployed and paid for, so a non-200 here would invite a
  // duplicate deploy (the exact false-failure Task 4 called out as Critical). Instead
  // report success with policyId: null and let the policy page explain the gap.
  let policyId: string | null = null;
  let policyError: string | null = null;
  const quorumId = process.env.NEXT_PUBLIC_PRIVY_SIGNER_QUORUM_ID;
  const authKey = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY;
  if (!quorumId || !authKey) {
    // A named failure, not a thrown error swallowed into the generic catch below: missing
    // config is a gap on our end, not a Privy rejection, and the two need different fixes.
    policyError = "This dashboard is not configured to create permission policies, so none was created.";
  } else {
    try {
      const privy = getPrivy();

      // Privy enforces at most one policy per signer, so there is exactly one policy per
      // merchant wallet and each deploy widens it. Resolve it server-side: the wallet id
      // comes from the verified access token, so its own signer entry is authoritative and
      // needs no trust in the client.
      let candidate: string | undefined;
      try {
        const w = await privy.wallets().get(merchant.walletId);
        candidate = w.additional_signers?.find((s) => s.signer_id === quorumId)
          ?.override_policy_ids?.[0];
      } catch {
        // Fall through to the client's hint; a create is the honest fallback.
      }
      // Before the first grant there is no signer to read, so the client carries the id.
      // It is never trusted on its face: the policy Privy returns must be named for THIS
      // merchant, or one merchant could widen another's.
      if (!candidate && typeof hintedPolicyId === "string") candidate = hintedPolicyId;

      // Deleted, or not named for this merchant: create a fresh one instead.
      const existing = candidate
        ? await privy
            .policies()
            .get(candidate)
            .then(
              (p) => (p.name === policyName(merchant.did) ? p : undefined),
              () => undefined,
            )
        : undefined;

      if (existing) {
        const to = existing.rules[0]?.conditions.find(
          (c) => c.field_source === "ethereum_transaction" && c.field === "to",
        )?.value;
        const gates = [
          ...new Set([...(Array.isArray(to) ? to : to ? [to] : []), gate.toLowerCase(), gate]),
        ];
        await privy.policies().update(existing.id, {
          authorization_context: { authorization_private_keys: [authKey] },
          rules: rulesFor(gates),
        });
        policyId = existing.id;
      } else {
        const created = await privy.policies().create({
          name: policyName(merchant.did),
          version: "1.0",
          chain_type: "ethereum",
          rules: rulesFor([gate.toLowerCase(), gate]),
          owner_id: quorumId,
        });
        policyId = created.id;
      }
    } catch (e) {
      // This block signs with PRIVY_AUTHORIZATION_PRIVATE_KEY, so only APIError is echoed:
      // its message composes status + response body and nothing else. Any other error
      // (a signing/crypto failure, a transport internal) could carry key material.
      policyError = e instanceof APIError ? e.message : "The permission policy could not be created.";
    }
  }

  return NextResponse.json({ gate, hash, policyId, policyError });
}

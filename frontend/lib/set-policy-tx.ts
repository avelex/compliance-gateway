import { NextResponse } from "next/server";
import { encodeFunctionData, decodeEventLog, type Address } from "viem";
import { gatewayAbi } from "./abi/gateway";
import { CAIP2, CHAIN_ID, publicClient } from "./chain";
import { toContractPolicy } from "./policy";
import { getPrivy } from "./privy-server";
import type { Policy } from "./data";

/** Set to false if Task 1 recorded SPONSORSHIP: FAIL. Confirmed on Base Sepolia tx
 *  0x6a18086fa7675887eec4e1db098aa2d84ed234fb6bd2f6bb39e1eca3b2848b92: a sponsored user-op still
 *  executes with msg.sender == the wallet, so onlyOwner accepts it — no drip/gas top-up needed.
 *
 *  This flag and Privy's own dashboard sponsorship toggle must agree. If sponsorship is turned
 *  off there while this stays `true`, sendSetPolicy still asks for `sponsor: true`, Privy sends
 *  a plain transaction anyway, and the "poll for a user-op hash" path in reportTx below never
 *  finds one — every successful send then reports as `unconfirmed` and the form freezes on a
 *  transaction that actually went through. Fails in the safe direction (never a false
 *  "confirmed"), but a future reader should know a dashboard toggle elsewhere can cause it. */
const SPONSOR = true;

/** Comfortably under a typical platform request cap (Vercel 60s, nginx 504) so our own honest
 *  "unconfirmed" branch fires instead of the host truncating the response. */
const RECEIPT_TIMEOUT = 20_000;

/** How long to poll Privy for the resolved transaction hash before giving up on "sent". */
const HASH_POLL_TIMEOUT = 20_000;
const HASH_POLL_INTERVAL = 1_000;

// A sponsored send is an ERC-4337 user operation, not a plain transaction: the SDK response
// comes back with hash: "" and a transaction_id instead, and the outer bundle tx's receipt only
// tells us handleOps() itself didn't revert — an individual user-op can still fail inside a
// "success" bundle. So for sponsored sends we (a) poll Privy for the resolved transaction_hash,
// then (b) decode the EntryPoint's UserOperationEvent for its own `success` flag.
// Verified on Base Sepolia against tx 0x6a18086fa7675887eec4e1db098aa2d84ed234fb6bd2f6bb39e1eca3b2848b92
// (UserOperationEvent.success = true, sender = 0x65d1dCE2367105d016Fe109b2700917087CdB2D0).
const userOperationEventAbi = [
  {
    type: "event",
    name: "UserOperationEvent",
    inputs: [
      { indexed: true, name: "userOpHash", type: "bytes32" },
      { indexed: true, name: "sender", type: "address" },
      { indexed: true, name: "paymaster", type: "address" },
      { indexed: false, name: "nonce", type: "uint256" },
      { indexed: false, name: "success", type: "bool" },
      { indexed: false, name: "actualGasCost", type: "uint256" },
      { indexed: false, name: "actualGasUsed", type: "uint256" },
    ],
  },
] as const;

// The canonical ERC-4337 EntryPoint addresses — deployed at the same address on every chain via
// a singleton factory, so both versions can be listed unconditionally rather than guessing which
// one Alchemy's bundler used. Filtering receipt.logs down to these before decoding (the same
// pattern app/api/deploy/route.ts uses for FACTORY) means a same-topic0 log from an unrelated
// contract is never even attempted — matching on userOpHash below is what makes attribution
// correct, this is what makes the search itself cheap and narrow.
const ENTRY_POINTS = new Set(
  ["0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789", "0x0000000071727De22E5E9d8BAf0edAc6f37da032"].map((a) =>
    a.toLowerCase(),
  ),
);

/** Thrown only when Privy has ACCEPTED the send and it is still `pending`/`broadcasted` when we
 *  stop polling — never for an outright refusal. A generic `Error` here would be caught by the
 *  routes' `e instanceof APIError` check and rewritten to "Privy refused the transaction", which
 *  tells the merchant it's safe to retry. It isn't: the op can still land minutes later and
 *  change their policy, so a retry races a change already in flight. Routes must catch this
 *  before the generic APIError branch and answer with the "unconfirmed" shape instead. */
export class SendPending extends Error {
  constructor(
    public transactionId: string,
    public userOpHash?: string,
  ) {
    super(`Privy transaction ${transactionId} is still pending`);
  }
}

/** The "sent but unconfirmed" NextResponse for a SendPending — same shape/copy as reportTx's own
 *  unconfirmed branch, minus `hash` (we never got one) and with whatever identifiers we do have
 *  so the merchant has something to look up. */
export function reportPending(pending: SendPending): NextResponse {
  return NextResponse.json(
    {
      status: "unconfirmed",
      error:
        "The policy change was sent but we could not confirm it. Do not retry — check this transaction before trying again.",
      transactionId: pending.transactionId,
      userOpHash: pending.userOpHash,
    },
    { status: 502 },
  );
}

/** Sends setPolicy from the merchant's own wallet, authorized by their own access token.
 *
 *  `user_jwts` is the whole design: Privy exchanges the token for that user's time-bound
 *  signing key and signs the request server-side, so no key of ours can move this wallet and
 *  no signature has to cross into the browser and back. The token must belong to the wallet's
 *  OWNER — a teammate's token cannot authorize this wallet, which is why a pending approval
 *  keeps the asker's. */
export async function sendSetPolicy({
  walletId,
  token,
  gate,
  policy,
}: {
  walletId: string;
  token: string;
  gate: Address;
  policy: Policy;
}): Promise<{ hash: string; userOpHash?: string }> {
  const data = encodeFunctionData({
    abi: gatewayAbi,
    functionName: "setPolicy",
    args: [toContractPolicy(policy)],
  });

  const privy = getPrivy();
  const sent = await privy
    .wallets()
    .ethereum()
    .sendTransaction(walletId, {
      caip2: CAIP2,
      params: {
        // chain_id as a number and value as 0x-prefixed hex, matching the SDK's own viem
        // encoder (src/viem.ts formatViemTransaction / formatViemQuantity).
        transaction: { to: gate.toLowerCase(), data, value: "0x0", chain_id: CHAIN_ID },
      },
      ...(SPONSOR ? { sponsor: true } : {}),
      authorization_context: { user_jwts: [token] },
    });

  // A plain (unsponsored) send already has the real hash; a sponsored one comes back with
  // hash: "" and only a transaction_id, and Privy fills in the hash asynchronously as the
  // bundler includes the op. Either way, carry user_operation_hash through: reportTx needs it
  // to pick OUR UserOperationEvent out of a bundle that can carry unrelated apps' ops too.
  if (sent.hash) return { hash: sent.hash, userOpHash: sent.user_operation_hash };

  const transactionId = sent.transaction_id;
  if (!transactionId) throw new Error("Privy returned no hash and no transaction_id");

  const deadline = Date.now() + HASH_POLL_TIMEOUT;
  let lastUserOpHash: string | undefined;
  while (Date.now() < deadline) {
    const t = await privy.transactions().get(transactionId);
    if (t.transaction_hash) return { hash: t.transaction_hash, userOpHash: t.user_operation_hash };
    lastUserOpHash = t.user_operation_hash ?? lastUserOpHash;
    if (t.status !== "pending" && t.status !== "broadcasted") {
      // A genuine failure: Privy already knows this terminal status will never produce a hash
      // (e.g. provider_error). Safe to describe as refused — nothing is in flight.
      throw new Error(`Privy transaction ${transactionId} did not resolve to a hash (status: ${t.status})`);
    }
    await new Promise((r) => setTimeout(r, HASH_POLL_INTERVAL));
  }
  // Still pending/broadcasted when we stopped looking — Privy accepted this, it just hasn't
  // resolved yet. Not a refusal; see SendPending's own comment.
  throw new SendPending(transactionId, lastUserOpHash);
}

/** The gateway must belong to the caller. Returns an error sentence, or null.
 *  Nothing else stops one merchant from pointing this route at another's gateway. */
export async function assertOwns(gate: Address, address: string): Promise<string | null> {
  let owner: string;
  try {
    owner = (await publicClient.readContract({
      address: gate,
      abi: gatewayAbi,
      functionName: "owner",
    })) as string;
  } catch {
    return "Could not read this gateway from the chain.";
  }
  return owner.toLowerCase() === address.toLowerCase() ? null : "That gateway is not yours";
}

/** Resolves on broadcast, not confirmation — the same three outcomes as /api/deploy, plus a
 *  fourth check that only applies to sponsored sends: a reverted user-op inside a successful
 *  bundle transaction must still report as "reverted", not "confirmed".
 *
 *  `userOpHash` (present only for a sponsored send — an unsponsored one has no user operation
 *  and the outer receipt status is the whole answer) pins which UserOperationEvent is ours: a
 *  sponsored bundle goes through a shared bundler and routinely carries unrelated apps' ops
 *  alongside it, so picking "the first event that parses" would silently report someone else's
 *  success or failure as our own. */
export async function reportTx(hash: string, userOpHash?: string): Promise<NextResponse> {
  let receipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({
      hash: hash as `0x${string}`,
      confirmations: 1,
      timeout: RECEIPT_TIMEOUT,
    });
  } catch {
    return NextResponse.json(
      {
        status: "unconfirmed",
        error:
          "The policy change was sent but we could not confirm it. Do not retry — check this transaction before trying again.",
        hash,
      },
      { status: 502 },
    );
  }

  if (receipt.status !== "success") {
    return NextResponse.json(
      { status: "reverted", error: "The policy change transaction reverted", hash },
      { status: 502 },
    );
  }

  if (SPONSOR) {
    // For a sponsored send the outer receipt describes the BUNDLE transaction, not our
    // operation — it can never stand in as proof on its own, so a missing userOpHash (an
    // immediate hash, or a polled record that simply lacks the field) is "cannot attribute",
    // not "assume success". Only skip this whole check when there was genuinely no user
    // operation to attribute, i.e. SPONSOR is false.
    if (!userOpHash) {
      return NextResponse.json(
        {
          status: "unconfirmed",
          error:
            "The policy change was sent but we could not confirm it. Do not retry — check this transaction before trying again.",
          hash,
        },
        { status: 502 },
      );
    }
    // Match on userOpHash (indexed bytes32, so compare case-insensitively), not "the first
    // UserOperationEvent that parses" — a shared bundler's bundle can carry other apps' ops.
    let userOpEvent: { args: { userOpHash: string; success: boolean } } | undefined;
    for (const log of receipt.logs) {
      if (!ENTRY_POINTS.has(log.address.toLowerCase())) continue;
      try {
        const decoded = decodeEventLog({ abi: userOperationEventAbi, data: log.data, topics: log.topics });
        if (decoded.args.userOpHash.toLowerCase() === userOpHash.toLowerCase()) {
          userOpEvent = decoded;
          break;
        }
      } catch {
        // not the UserOperationEvent log, skip
      }
    }
    // No matching event is not proof of success — it means we could not establish what
    // happened (e.g. an indexing lag, or an EntryPoint we didn't expect). Guessing "confirmed"
    // here is exactly the bug this function exists to avoid, so this reports as unconfirmed,
    // same as a receipt we never got at all.
    if (!userOpEvent) {
      return NextResponse.json(
        {
          status: "unconfirmed",
          error:
            "The policy change was sent but we could not confirm it. Do not retry — check this transaction before trying again.",
          hash,
        },
        { status: 502 },
      );
    }
    if (!userOpEvent.args.success) {
      return NextResponse.json(
        {
          status: "reverted",
          error: "The policy change transaction reverted",
          hash,
        },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ status: "confirmed", hash });
}

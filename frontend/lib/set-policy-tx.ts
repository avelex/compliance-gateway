import { NextResponse } from "next/server";
import { decodeEventLog, type Address } from "viem";
import { gatewayAbi } from "./abi/gateway";
import { publicClient } from "./chain";

/** Comfortably under a typical platform request cap (Vercel 60s, nginx 504) so our own honest
 *  "unconfirmed" branch fires instead of the host truncating the response. */
const RECEIPT_TIMEOUT = 20_000;

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

/** Resolves on confirmation, with the four outcomes /api/deploy also reports. Every send is a
 *  sponsored user operation now, so the outer receipt describes the BUNDLE transaction and can
 *  never stand in as proof on its own: a missing `userOpHash` is "cannot attribute", not
 *  "assume success". */
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

  // Every send is a sponsored user operation now: the outer receipt describes the BUNDLE
  // transaction, not our operation — it can never stand in as proof on its own, so a missing
  // userOpHash (an immediate hash, or a polled record that simply lacks the field) is "cannot
  // attribute", not "assume success".
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

  return NextResponse.json({ status: "confirmed", hash });
}

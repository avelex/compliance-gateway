import type { Address } from "viem";
import { CAIP2, CHAIN_ID } from "./chain";
import { getPrivy } from "./privy-server";

/** Wallet requests the merchant's own browser authorizes and we merely pay for.
 *
 *  Why this exists in two phases rather than one SDK call: a sponsored send needs our app secret,
 *  which only the server has, while the authorization has to come from the wallet's owner, which
 *  only the merchant's browser can produce. So the server builds the exact request, hands out the
 *  bytes to be signed, and later posts *those same bytes* with the signatures it collected.
 *
 *  Verified end to end on Base Sepolia: user op 0x9126bef5…, transaction
 *  0xb904472415596a149d4e7dc97c877a86967390afba11d4b77729affac5f0f099 (receipt success, gas paid by
 *  the app's sponsorship, no key of ours in the authorization).
 *
 *  The alternatives are dead ends, both confirmed against the live API rather than the docs:
 *  `authorization_context.user_jwts` answers 400 "Invalid JWT token provided", and client-side
 *  `sponsor: true` answers "App secret is required for gas sponsored transactions".
 */

const APP_ID = () => process.env.NEXT_PUBLIC_PRIVY_APP_ID!;

/** Long enough for a teammate to be found and to click; the pending approval expires with it. */
export const REQUEST_TTL_MS = 10 * 60_000;

export type PreparedRequest = {
  url: string;
  body: unknown;
  /** Milliseconds, not seconds — PrivyClient.getRequestExpiry() is `Date.now() + ms`, and a
   *  seconds value reads as a 1970 timestamp and the API answers 401 "the request has expired". */
  expiry: string;
};

/** What the browser signs. Plain JSON on purpose: the merchant's own client canonicalises and
 *  signs it, so nothing opaque has to be trusted on the way there. */
export type SignableRequest = {
  version: 1;
  method: "POST";
  url: string;
  body: unknown;
  headers: { "privy-app-id": string; "privy-request-expiry": string };
};

export async function walletIdFor(address: Address): Promise<string | undefined> {
  const wallet = await getPrivy().wallets().getWalletByAddress({ address }).catch(() => undefined);
  return wallet?.id;
}

/** Builds the sponsored transaction request. Nothing is sent — the signature isn't in yet. */
export function prepareTransaction({
  walletId,
  to,
  data,
}: {
  walletId: string;
  to: Address;
  data: `0x${string}`;
}): { prepared: PreparedRequest; signable: SignableRequest } {
  const url = `https://api.privy.io/v1/wallets/${walletId}/rpc`;
  const body = {
    chain_type: "ethereum",
    method: "eth_sendTransaction",
    caip2: CAIP2,
    params: { transaction: { to: to.toLowerCase(), data, value: "0x0", chain_id: CHAIN_ID } },
    sponsor: true,
  };
  const expiry = String(Date.now() + REQUEST_TTL_MS);
  return {
    prepared: { url, body, expiry },
    signable: {
      version: 1,
      method: "POST",
      url,
      body,
      headers: { "privy-app-id": APP_ID(), "privy-request-expiry": expiry },
    },
  };
}

export class PrivyRefused extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Posts the prepared bytes verbatim with the collected signatures. Any difference between what
 *  was signed and what is sent — a re-derived expiry, a reordered body — is a 401, so the caller
 *  must pass back the very object `prepareTransaction` returned. */
export async function submitTransaction(
  prepared: PreparedRequest,
  signatures: string[],
): Promise<{ transactionId?: string; hash?: string; userOpHash?: string }> {
  const res = await fetch(prepared.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "privy-app-id": APP_ID(),
      "privy-request-expiry": prepared.expiry,
      "privy-authorization-signature": signatures.join(","),
      authorization: `Basic ${Buffer.from(`${APP_ID()}:${process.env.PRIVY_APP_SECRET}`).toString("base64")}`,
    },
    body: JSON.stringify(prepared.body),
  });

  const text = await res.text();
  if (!res.ok) {
    // Privy's own sentence is safe to surface: it describes the request we sent, and this route
    // composed that request itself. It never carries key material — there is no key here.
    let message = `Privy refused the transaction (${res.status})`;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      // not JSON — keep the generic sentence rather than echoing a page of HTML
    }
    throw new PrivyRefused(res.status, message);
  }

  const { data } = JSON.parse(text) as {
    data?: { hash?: string; transaction_id?: string; user_operation_hash?: string };
  };
  // A sponsored send is a user operation: `hash` comes back empty and is filled in asynchronously
  // as the bundler includes the op, so transaction_id is what we can follow.
  return { hash: data?.hash || undefined, transactionId: data?.transaction_id, userOpHash: data?.user_operation_hash };
}

/** How long a route may keep asking for the hash. Deliberately well under the 60s a platform
 *  request gets, so the receipt wait after it still has room. */
export const HASH_WAIT_MS = 20_000;

/** These end without a hash ever appearing — waiting out the budget only delays the answer. */
const NEVER_GETS_A_HASH = new Set(["failed", "provider_error"]);

/** A sponsored send is a user operation: Privy answers immediately with an empty hash and a
 *  transaction_id, and the bundler fills the hash in seconds later. Asking once and giving up
 *  reports every successful sponsored send as "we could not confirm it" — which is what
 *  /api/deploy and /api/privy/set-policy both did — so ask again until the hash lands or the
 *  budget runs out. Returns no hash rather than throwing: "we still do not know" is an outcome
 *  both callers already handle. */
export async function waitForHash(
  transactionId: string | undefined,
  budgetMs: number = HASH_WAIT_MS,
  pollMs = 1_500,
): Promise<{ hash?: string; userOpHash?: string }> {
  if (!transactionId) return {};
  const deadline = Date.now() + budgetMs;
  for (;;) {
    const tx = await getPrivy()
      .transactions()
      .get(transactionId)
      .catch(() => undefined);
    if (tx?.transaction_hash) {
      return { hash: tx.transaction_hash, userOpHash: tx.user_operation_hash };
    }
    if (tx && NEVER_GETS_A_HASH.has(tx.status)) return {};
    if (Date.now() + pollMs >= deadline) return {};
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

import { PrivyClient } from "@privy-io/node";

// Built lazily (not at module load) so a missing app id/secret doesn't crash the whole
// server on import — same reasoning as the lazy relayer in app/api/deploy/route.ts.
let _privy: PrivyClient | undefined;
export function getPrivy(): PrivyClient {
  if (!_privy) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
    const appSecret = process.env.PRIVY_APP_SECRET?.trim();
    // The SDK only throws when a variable is entirely absent, not when it's set to "" —
    // which is exactly what an unfilled .env.local line looks like. Check it ourselves.
    if (!appId || !appSecret) throw new Error("Privy app id or secret is not set");
    _privy = new PrivyClient({ appId, appSecret });
  }
  return _privy;
}

export class Unauthorized extends Error {}
/** The server itself is misconfigured (e.g. no Privy app secret) — not the caller's fault. */
export class Misconfigured extends Error {}

/** Resolve the caller from their Privy access token. Throws Unauthorized or Misconfigured. */
export async function requireMerchant(req: Request) {
  const header = req.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  // Only the Authorization header is trusted. A cookie-based fallback would make this
  // spending route CSRF-reachable: a cross-site form POST skips preflight and
  // Request.json() doesn't check Content-Type, so a stray cookie would be enough to
  // deploy a gateway or spend the relayer's ETH on the merchant's behalf.
  if (!token) throw new Unauthorized("Not signed in");

  // Constructed outside the auth try/catch: a missing app id/secret throws here, and that
  // is a server misconfiguration, not proof the caller's token is bad — conflating the two
  // would tell a properly signed-in merchant they're signed out forever.
  let privy;
  try {
    privy = getPrivy();
  } catch {
    throw new Misconfigured("Privy is not configured");
  }

  let claims;
  let user;
  try {
    claims = await privy.utils().auth().verifyAccessToken(token);
    // Privy overrides get() for identity tokens; _get is the documented by-ID lookup.
    user = await privy.users()._get(claims.user_id);
  } catch {
    // Never surface the SDK's own error text: it can echo back request details.
    throw new Unauthorized("Not signed in");
  }

  const wallet = user.linked_accounts.find(
    (a) =>
      a.type === "wallet" &&
      a.wallet_client_type === "privy" &&
      a.chain_type === "ethereum" &&
      a.connector_type === "embedded",
  ) as { id: string | null; address: string } | undefined;
  if (!wallet) throw new Unauthorized("No embedded wallet on this account");
  if (!wallet.id) throw new Unauthorized("No embedded wallet on this account");

  return {
    did: claims.user_id,
    walletId: wallet.id,
    address: wallet.address as `0x${string}`,
  };
}

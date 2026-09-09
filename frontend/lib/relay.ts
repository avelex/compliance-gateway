import type { Address } from "viem";

/** The relay is a different developer's code (docs/relay-spec.md). Everything that can
 *  come back from it is one of three things the screen has to say differently:
 *  "wait a bit", "the provider is down", "we sent something wrong". */
export class RelayFailure extends Error {
  constructor(
    readonly kind: "rate-limited" | "unavailable" | "bad-request",
    message: string,
  ) {
    super(message);
    this.name = "RelayFailure";
  }
}

async function post(path: string, body: unknown): Promise<{ status: number; json: unknown }> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // A dead tunnel and a dead relay are the same sentence to the payer.
    throw new RelayFailure("unavailable", "We could not reach the verification service.");
  }

  let json: unknown = {};
  try {
    json = await res.json();
  } catch {
    // A 202 with an empty body is normal; a broken body on an error is not worth a branch.
  }

  if (res.status === 429)
    throw new RelayFailure("rate-limited", "Too many attempts. Try again later.");
  if (res.status >= 500)
    throw new RelayFailure("unavailable", "The verification service is unavailable.");
  if (!res.ok) {
    const detail = typeof json === "object" && json && "error" in json ? String(json.error) : "";
    throw new RelayFailure("bad-request", detail || "The verification request was rejected.");
  }

  return { status: res.status, json };
}

/** Fresh WebSDK token. Called once to start the widget and again from its refresh
 *  callback: the token's TTL is 600s and a session outlives it. */
export async function mintToken(gate: Address, wallet: Address): Promise<string> {
  const { json } = await post("/api/relay/token", { gate, wallet });
  const token = typeof json === "object" && json && "token" in json ? json.token : null;
  if (typeof token !== "string" || token === "")
    throw new RelayFailure("unavailable", "The verification service returned no session.");
  return token;
}

/** Ask the enclave to look at this (gate, wallet). Deduplicated by that pair on the
 *  relay side, so calling it every minute is the intended usage, not a retry hack. */
export async function enqueue(gate: Address, wallet: Address, level: number): Promise<void> {
  await post("/api/relay/queue", { kind: "verify", gate, wallet, level });
}

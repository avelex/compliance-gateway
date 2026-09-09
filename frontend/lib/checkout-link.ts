import { getAddress, isAddress, parseUnits, type Address } from "viem";

/** Both allowlisted tokens are 6-decimal (SPEC §12), so the link never carries a token. */
const DECIMALS = 6;
const AMOUNT_RE = /^\d{1,12}(\.\d{1,6})?$/;

/** A link with no readable gate is a dead end: there is nothing to pay. */
export function parseGate(raw: string | null | undefined): Address | null {
  if (!raw || !isAddress(raw)) return null;
  return getAddress(raw);
}

/** A link with an unreadable amount is not a dead end — the payer types amounts by
 *  hand anyway, so a bad one becomes an empty field rather than an error screen. */
export function parseAmount(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!AMOUNT_RE.test(s)) return "";
  if (parseUnits(s, DECIMALS) === 0n) return ""; // pay() reverts on zero
  return s;
}

export function toUnits(decimal: string): bigint | null {
  const clean = parseAmount(decimal);
  return clean ? parseUnits(clean, DECIMALS) : null;
}

export function buildCheckoutUrl(origin: string, gate: string, amount: string): string {
  const url = new URL("/checkout", origin);
  url.searchParams.set("gate", gate);
  const clean = parseAmount(amount);
  if (clean) url.searchParams.set("amount", clean);
  return url.toString();
}

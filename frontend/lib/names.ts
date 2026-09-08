const KEY = "gatewayNames";

const read = (): Record<string, string> => {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
};

export const gatewayName = (address: string) =>
  read()[address.toLowerCase()] ?? `Gateway ${address.slice(0, 6)}…${address.slice(-4)}`;

// One Privy policy per merchant wallet, not per gateway: Privy enforces at most one
// policy per signer (@privy-io/node wallets.d.ts WalletAdditionalSignerItem, users.d.ts
// AdditionalSigner), so a second gateway's grant would silently replace the first's.
// The id is keyed by the merchant's wallet address so every gateway screen reads the
// same grant. This is a hint only — /api/deploy re-derives it from the wallet itself
// and refuses any id whose policy is not named for the caller.
const POLICY_KEY = "merchantPolicyIds";

const readPolicies = (): Record<string, string> => {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(POLICY_KEY) ?? "{}");
  } catch {
    return {};
  }
};

export const merchantPolicyId = (wallet: string) => readPolicies()[wallet.toLowerCase()];

export function setMerchantPolicyId(wallet: string, id: string) {
  if (typeof window === "undefined") return;
  const all = readPolicies();
  all[wallet.toLowerCase()] = id;
  window.localStorage.setItem(POLICY_KEY, JSON.stringify(all));
}

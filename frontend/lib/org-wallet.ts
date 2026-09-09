/** The merchant's organization wallet as the browser sees it.
 *
 *  Selection is by address, never by position: a merchant who signed in before this change still
 *  has a personal login wallet, and both are `walletClientType === "privy"`. Picking the first
 *  would sign from an address that owns none of their gateways, and `setPolicy` would revert on
 *  `onlyOwner` with nothing on screen to explain why. */
export function pickOrgWallet<T extends { address: string; walletClientType: string }>(
  wallets: T[],
  orgAddress?: string,
): T | undefined {
  if (!orgAddress) return undefined;
  const wanted = orgAddress.toLowerCase();
  return wallets.find((w) => w.walletClientType === "privy" && w.address.toLowerCase() === wanted);
}

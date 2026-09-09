import { createPublicClient, http, type Address, createWalletClient, custom, type WalletClient } from "viem";
import { baseSepolia } from "viem/chains";
import type { Token } from "./data";

export const CHAIN_ID = 84532;
export const CAIP2 = "eip155:84532";
export { baseSepolia };

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL),
});

// Contracts aren't deployed yet when this module first loads (e.g. the login screen
// before Task 1's env is filled in), so these must not throw here. A later task
// guards them at first use instead.
export const REGISTRY = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS as Address;
export const FACTORY = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as Address;
export const FACTORY_DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_FACTORY_DEPLOY_BLOCK || "0");

export const TOKENS: Record<Token, Address> = {
  USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  EURC: "0x808456652fdb597867f38412077A9182bf77359F",
};

export const tokenOf = (address: string): Token | undefined =>
  (Object.keys(TOKENS) as Token[]).find(
    (t) => TOKENS[t].toLowerCase() === address.toLowerCase(),
  );

/** EIP-1193. Typed loosely on purpose: we call three methods and viem does the rest. */
type Injected = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };

const injected = (): Injected | undefined =>
  typeof window === "undefined"
    ? undefined
    : (window as unknown as { ethereum?: Injected }).ethereum;

/** No wallet in the browser is a state of the screen, not an error. */
export const hasInjectedWallet = () => injected() !== undefined;

export function walletClient(account: Address): WalletClient {
  const provider = injected();
  if (!provider) throw new Error("No wallet in this browser");
  return createWalletClient({ account, chain: baseSepolia, transport: custom(provider) });
}

/** Connects, then makes sure the wallet is on Base Sepolia. A payer on the wrong
 *  chain otherwise sends a real transaction to an address that means nothing there. */
export async function connectWallet(): Promise<Address> {
  const provider = injected();
  if (!provider) throw new Error("No wallet in this browser");

  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as Address[];
  const account = accounts?.[0];
  if (!account) throw new Error("The wallet returned no account");

  const chainId = Number(await provider.request({ method: "eth_chainId" }));
  if (chainId !== CHAIN_ID) {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }],
      });
    } catch {
      // 4902 means the chain is unknown to the wallet; so does a plain rejection
      // from some wallets. Adding it is the same request either way.
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: `0x${CHAIN_ID.toString(16)}`,
            chainName: baseSepolia.name,
            nativeCurrency: baseSepolia.nativeCurrency,
            rpcUrls: [process.env.NEXT_PUBLIC_RPC_URL ?? baseSepolia.rpcUrls.default.http[0]],
            blockExplorerUrls: [baseSepolia.blockExplorers.default.url],
          },
        ],
      });
    }
  }

  return account;
}

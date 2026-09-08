import { createPublicClient, http, type Address } from "viem";
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

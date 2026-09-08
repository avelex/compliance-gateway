"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { baseSepolia } from "@/lib/chain";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        loginMethods: ["email"],
        defaultChain: baseSepolia,
        supportedChains: [baseSepolia],
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        appearance: {
          theme: "light",
          accentColor: "#1750F0",
          logo: undefined,
          walletList: [],
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}

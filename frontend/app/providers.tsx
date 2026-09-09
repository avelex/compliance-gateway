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
        // Off on purpose: the merchant's wallet is created by us, owned by their key quorum
        // (lib/privy-quorum.ts ensureOrgWallet). A login-created wallet would be a second Privy
        // wallet owned by the user alone — not an organization wallet, and not what their
        // gateways are deployed against.
        embeddedWallets: { ethereum: { createOnLogin: "off" } },
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

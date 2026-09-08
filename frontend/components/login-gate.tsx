"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Button } from "@/components/ui";

/** The embedded wallet Privy created for this merchant. Injected wallets are ignored:
 *  the dashboard's org wallet is the one Privy holds, not whatever the browser has. */
export function useOrgWallet() {
  const { wallets } = useWallets();
  return wallets.find((w) => w.walletClientType === "privy");
}

export function LoginGate({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login } = usePrivy();
  const wallet = useOrgWallet();

  if (!ready) return null;

  if (!authenticated) {
    return (
      <div className="mx-auto max-w-[46ch] px-6 pt-24">
        <h1 className="display text-[30px] font-semibold">Sign in</h1>
        <p className="mt-2 text-slate">
          Your organisation&rsquo;s wallet is created on first sign-in and held by Privy. There
          is no seed phrase to write down and no gas to top up.
        </p>
        <div className="mt-7">
          <Button onClick={login}>Continue with email</Button>
        </div>
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="mx-auto max-w-[46ch] px-6 pt-24">
        <p role="status" className="text-slate">Creating your organisation&rsquo;s wallet…</p>
      </div>
    );
  }

  return <>{children}</>;
}

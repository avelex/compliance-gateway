"use client";

import { useEffect, useState } from "react";
import { usePrivy, useWallets, type ConnectedWallet } from "@privy-io/react-auth";
import { Button } from "@/components/ui";
import { pickOrgWallet } from "@/lib/org-wallet";

export type OrgWalletState = {
  /** `undefined` means "not yet known" — either the `/api/privy/team` lookup is still in
   *  flight, or it resolved to a real address but the browser's wallet list has not refreshed
   *  to include it yet. `null` means the lookup resolved and this merchant has no org wallet at
   *  all. A caller that needs to tell "read failed" from either of those reads `failed` instead
   *  of guessing from `wallet` — a failed read must never be mistaken for "confirmed none". */
  wallet: ConnectedWallet | null | undefined;
  failed: boolean;
};

/** The wallet owned by this merchant's key quorum, plus whether the lookup that would have found
 *  it failed. The server is the only place that knows which address that is — the browser can
 *  see several Privy wallets and cannot tell them apart.
 *
 *  `retryKey` re-runs the `/api/privy/team` read (bump it from a retry button) — pass the same
 *  counter a caller already uses to retry its own on-chain read, so one button retries both. */
export function useOrgWalletState(retryKey = 0): OrgWalletState {
  const { getAccessToken, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const [address, setAddress] = useState<string | undefined>();
  const [resolved, setResolved] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!authenticated) return;
    let live = true;
    setFailed(false);
    // getAccessToken is stable in behavior but not in identity — it changes on Privy's own
    // schedule after the first call, and listing it as a dependency here made this effect (and
    // the team lookup + its full wallet-list scan behind it) refire several times per mount for
    // no input that actually changed. Deliberately left out of the deps array; `authenticated`
    // and `retryKey` are the only things that should restart this read.
    // ponytail: every dashboard page (plus the layout's account menu) calls this hook
    // independently, so a page still costs one `/api/privy/team` round trip per mounted caller.
    // Upgrade to a single context/provider that fetches once and shares it if that ever shows up
    // in practice — out of scope here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    getAccessToken()
      .then((t) => fetch("/api/privy/team", { headers: { authorization: `Bearer ${t}` } }))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d) => {
        if (!live) return;
        setAddress(d.walletAddress ?? undefined);
        setResolved(true);
      })
      .catch(() => {
        // Distinct from `resolved` on purpose: a 502/401/network error is not "no org wallet",
        // and must not be read as one by a caller deciding what to render.
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [authenticated, retryKey]);

  const wallet = !resolved ? undefined : !address ? null : pickOrgWallet(wallets, address);
  return { wallet, failed };
}

/** Convenience wrapper for callers that only need the wallet and treat any non-success
 *  (`undefined`, `null`, or a failed read) the same way — i.e. every caller that just tests
 *  `!wallet` / `wallet?.`. Callers that must render a failed read differently from "no wallet
 *  yet" (e.g. the gateways list) should use `useOrgWalletState` directly instead. */
export function useOrgWallet(): ConnectedWallet | null | undefined {
  return useOrgWalletState().wallet;
}

import { SetupWizard } from "./setup-wizard";

export function LoginGate({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login, user } = usePrivy();
  
  // We use a refresh key to force a re-render after the wizard completes,
  // but since we don't have the `user` object updated instantly from our own API,
  // we rely on local state to allow them through.
  const [setupFinished, setSetupFinished] = useState(false);

  if (!ready) return null;

  if (!authenticated) {
    return (
      <div className="mx-auto max-w-[46ch] px-6 pt-24">
        <h1 className="display text-[30px] font-semibold">Sign in</h1>
        <p className="mt-2 text-slate">
          Your organisation&rsquo;s wallet is created during setup and held by Privy.
          There is no seed phrase to write down and no gas to top up.
        </p>
        <div className="mt-7">
          <Button onClick={login}>Continue with email</Button>
        </div>
      </div>
    );
  }

  // Block access if the user has no organization ID in their metadata AND they haven't just finished setup
  if (!user?.customMetadata?.organizationId && !setupFinished) {
    return <SetupWizard onComplete={() => setSetupFinished(true)} />;
  }

  return <>{children}</>;
}

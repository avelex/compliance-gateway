"use client";

import { useState, useSyncExternalStore } from "react";
import { usePrivy, useSigners } from "@privy-io/react-auth";
import { Button, ErrorNote } from "@/components/ui";
import { useOrgWallet } from "@/components/login-gate";
import { merchantPolicyId } from "@/lib/names";

const QUORUM = process.env.NEXT_PUBLIC_PRIVY_SIGNER_QUORUM_ID;

// In-memory only, resets on reload — bridges the gap between "we just watched
// addSigners succeed" and Privy's own account object catching up. We observed the
// grant succeed, so this is an observed fact for the rest of the session; after a
// reload, useSignerGrant falls back to reading Privy's own read-back again.
const grantedThisSession = new Set<string>();
const listeners = new Set<() => void>();
function markGrantedThisSession(wallet: string) {
  grantedThisSession.add(wallet.toLowerCase());
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether this wallet has granted our key quorum the merchant's own permission policy.
 *  Privy allows at most one policy per signer (@privy-io/node wallets.d.ts
 *  WalletAdditionalSignerItem, users/users.d.ts AdditionalSigner), so the grant is
 *  per-wallet, not per-gateway: one policy lists every gateway this merchant deployed.
 *
 *  PENDING VERIFICATION: `signers`/`signerId`/`policyIds` on a linked wallet account
 *  are not documented in Privy's public docs or in the installed SDK's exported types
 *  (`LinkedAccountWithMetadata` widens to a union without a `signers` field in the
 *  .d.ts). This mirrors the field names the client SDK itself writes when granting
 *  (`addSigners({ signers: [{ signerId, policyIds }] })`), so it should round-trip,
 *  but confirm by inspecting `user.linkedAccounts` in the browser after a real grant. */
export function useSignerGrant() {
  const { user } = usePrivy();
  const wallet = useOrgWallet();
  const address = wallet?.address;
  // LoginGate renders nothing until Privy is ready (login-gate.tsx), so this never
  // runs on the server — a lazy initializer is safe and skips a first-frame flash of
  // "no id" while an effect goes and reads it.
  const [policyId] = useState(() => (address ? merchantPolicyId(address) : undefined));
  const sessionGranted = useSyncExternalStore(subscribe, () =>
    address ? grantedThisSession.has(address.toLowerCase()) : false,
  );

  const account: any = user?.linkedAccounts.find(
    (a: any) => a.type === "wallet" && a.address?.toLowerCase() === address?.toLowerCase(),
  );
  const signer = account?.signers?.find((s: any) => s.signerId === QUORUM);
  const policyIds = (signer?.policyIds ?? []) as string[];

  const granted = sessionGranted || (policyId !== undefined && policyIds.includes(policyId));
  return { granted, policyId };
}

export function DelegatePanel() {
  const { addSigners } = useSigners();
  const wallet = useOrgWallet();
  const { granted, policyId } = useSignerGrant();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (granted) return null;

  if (!QUORUM) {
    return (
      <Panel>
        This dashboard isn&rsquo;t configured with a signer quorum
        (NEXT_PUBLIC_PRIVY_SIGNER_QUORUM_ID), so it can&rsquo;t request this permission.
      </Panel>
    );
  }

  async function grant() {
    if (!wallet || !policyId) return;
    setBusy(true);
    setFailed(false);
    try {
      // Exactly one policy: Privy keeps one per signer, so sending a list would either be
      // rejected or silently drop all but one and revoke the earlier gateways' permission.
      await addSigners({
        address: wallet.address,
        signers: [{ signerId: QUORUM!, policyIds: [policyId] }],
      });
      markGrantedThisSession(wallet.address);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (!policyId) {
    return (
      <Panel>
        This browser doesn&rsquo;t have your permission id, so it can&rsquo;t request the
        grant here. Deploy a gateway from this browser, or grant it from the Privy dashboard.
      </Panel>
    );
  }

  return (
    <div className="mt-9 border border-rule bg-wash p-4">
      <h3 className="text-[14px] font-medium">Let this dashboard change the policy for you</h3>
      <p className="mt-1 max-w-[58ch] text-[13px] text-slate">
        Changing a policy is an on-chain transaction, paid for out of your own wallet. Our
        relayer sends it a one-off 0.002 ETH at deploy to cover these; that is the whole of
        the gas we cover, and it is not topped up again.
      </p>
      <p className="mt-2 max-w-[58ch] text-[13px] text-slate">
        The permission covers one thing: a <span className="font-mono text-[12px]">setPolicy</span>{" "}
        call, carrying no value, to the gateways you deployed here. It cannot transfer your
        tokens and it cannot call anything else on those contracts. It is held in a Privy
        policy that this dashboard&rsquo;s operator owns and can change without asking you, so
        the guarantee is only as strong as your trust in us — you can revoke the permission in
        Privy at any time.
      </p>
      {failed && (
        <div className="mt-3">
          <ErrorNote onRetry={grant} retryLabel="Try again">
            The permission was not granted. Nothing changed.
          </ErrorNote>
        </div>
      )}
      <div className="mt-4">
        <Button onClick={grant} disabled={busy || !wallet}>
          {busy ? "Waiting for your approval…" : "Grant permission"}
        </Button>
      </div>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-9 border border-rule bg-wash p-4">
      <h3 className="text-[14px] font-medium">Let this dashboard change the policy for you</h3>
      <p className="mt-1 max-w-[58ch] text-[13px] text-slate">{children}</p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, ErrorNote } from "@/components/ui";
import { useOrgWalletState } from "@/components/login-gate";
import { listGateways, type OnChainGateway } from "@/lib/gateways";
import { gatewayName } from "@/lib/names";
import { policyLine, short } from "@/lib/data";
import { DashboardSkeleton } from "@/components/dashboard-skeleton";

/**
 * Full-width ledger: the extra horizontal room buys real columns, so token and policy
 * stop hiding behind a breakpoint. Below 860px the row folds to one column and each
 * field carries its own label, since the header rule is gone there.
 */
const ROW =
  "grid grid-cols-[minmax(200px,1.5fr)_minmax(150px,1.1fr)_64px_minmax(190px,1.2fr)] items-baseline gap-6 max-[860px]:grid-cols-1 max-[860px]:gap-1";

const LABEL = "hidden text-slate max-[860px]:inline";

export default function GatewaysPage() {
  const [reload, setReload] = useState(0);
  // Same counter drives both reads below, so one retry button retries whichever failed:
  // the team lookup that finds the org wallet, and the on-chain read of its gateways.
  const { wallet, failed: teamFailed } = useOrgWalletState(reload);
  const [rows, setRows] = useState<OnChainGateway[] | null>(null);
  const [failed, setFailed] = useState(false);
  const failedToRead = failed || teamFailed;

  // Four states, failure first. A failed read must never render as "no gateways yet": that
  // tells a merchant with live gateways they have none and invites a deploy the relayer pays
  // for (frontend/PRODUCT.md principle 3, and the same shape as wallet/page.tsx). "No org
  // wallet" is resolved to rows = [] here, not left as rows = null forever, so `rows === null`
  // below means only one thing: this read hasn't come back yet.
  useEffect(() => {
    if (wallet === undefined) return; // still resolving — neither loading nor empty yet
    if (wallet === null) {
      setRows([]); // confirmed: no org wallet, so nothing to read — same as zero gateways
      return;
    }
    let live = true;
    setFailed(false);
    listGateways(wallet.address as `0x${string}`)
      .then((g) => live && setRows(g))
      .catch(() => {
        if (!live) return;
        setRows(null);
        setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [wallet, reload]);

  return (
    <div>
      <div className="flex items-end justify-between gap-6">
        <h1 className="display text-[30px] font-semibold">Gateways</h1>
        <Button href="/gateways/new">New gateway</Button>
      </div>
      <p className="mt-2 max-w-[62ch] text-slate">
        Each gateway is a contract you own. Payments land in it, wait for screening, and leave to you
        or back to the payer.
      </p>

      <ul className="mt-8">
        <li className={`${ROW} border-b border-ink pb-2 text-[12.5px] text-slate max-[860px]:hidden`}>
          <span>Gateway</span>
          <span>Address</span>
          <span>Token</span>
          <span>Policy</span>
        </li>
        {failedToRead ? (
          <li className="py-8">
            <ErrorNote onRetry={() => setReload((n) => n + 1)} retryLabel="Try reading them again">
              We could not reach the network to read your gateways. This tells you nothing
              about how many you have — none of them changed.
            </ErrorNote>
          </li>
        ) : rows === null ? (
          <li className="py-2"><DashboardSkeleton /></li>
        ) : wallet === null || rows.length === 0 ? (
          <li className="py-8">
            <p className="max-w-[52ch] text-slate">
              You have no gateways yet. One gateway takes one token under one policy, and
              deploying it costs you nothing — we pay the gas.
            </p>
            <div className="mt-5">
              <Button href="/gateways/new">Create your first gateway</Button>
            </div>
          </li>
        ) : (
          rows.map((g) => (
            <li key={g.address}>
              <Link
                href={`/gateways/${g.address}`}
                className={`group ${ROW} border-b border-rule py-5 transition-colors hover:bg-wash`}
              >
                <span className="text-[16px] font-medium group-hover:text-blue-deep">
                  {gatewayName(g.address)}
                </span>
                <span className="font-mono text-[12.5px] text-slate">{short(g.address, 10, 6)}</span>
                <span className="text-[13.5px]">
                  <span className={LABEL}>Token </span>
                  {g.token}
                </span>
                <span className="text-[13.5px]">
                  <span className={LABEL}>Policy </span>
                  {policyLine(g.policy, g.token)}
                </span>
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

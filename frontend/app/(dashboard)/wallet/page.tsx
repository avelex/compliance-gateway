"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatUnits } from "viem";
import { erc20Abi } from "@/lib/abi/erc20";
import { publicClient, TOKENS } from "@/lib/chain";
import { useOrgWallet } from "@/components/login-gate";
import {
  ago,
  byslug,
  heldInScreening,
  money,
  payments,
  RECLAIM_SECONDS,
  short,
  SYMBOL,
  type Token,
} from "@/lib/data";
import { Elapsed } from "@/components/elapsed";
import { ErrorNote, ScrollRegion, StatusMark, Td, Th, TxLink } from "@/components/ui";

export default function WalletPage() {
  const wallet = useOrgWallet();
  const address = wallet?.address as `0x${string}` | undefined;
  const [balances, setBalances] = useState<Record<Token, bigint> | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!address) return;
    let live = true;
    setFailed(false);
    publicClient
      .multicall({
        contracts: (Object.keys(TOKENS) as Token[]).map((t) => ({
          address: TOKENS[t],
          abi: erc20Abi,
          functionName: "balanceOf" as const,
          args: [address],
        })),
        allowFailure: false,
      })
      .then((res) => {
        if (!live) return;
        const tokens = Object.keys(TOKENS) as Token[];
        setBalances(Object.fromEntries(tokens.map((t, i) => [t, res[i]])) as Record<Token, bigint>);
      })
      .catch(() => {
        if (!live) return;
        setBalances(null);
        setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [address, reload]);

  const held = heldInScreening();
  const settled = payments.filter((p) => p.status === "settled").slice(0, 6);

  return (
    <div className="max-w-[880px]">
      <h1 className="display text-[30px] font-semibold">Wallet</h1>
      <p className="mt-2 max-w-[62ch] text-slate">
        Cleared payments land here. It is your organisation&rsquo;s wallet, held
        by Privy — we never take custody of your money, and neither does any
        gateway for longer than a screening window.
      </p>

      <section className="mt-9 grid gap-x-12 gap-y-8 sm:grid-cols-2">
        <div>
          <h2 className="text-[13px] text-slate">Available</h2>
          {failed ? (
            <div className="mt-2">
              <ErrorNote onRetry={() => setReload((n) => n + 1)} retryLabel="Try reading it again">
                We could not reach the network to read this balance. This tells you nothing about
                what the wallet holds — your money is untouched.
              </ErrorNote>
            </div>
          ) : balances === null ? (
            <p className="tnum mt-1 text-[32px] font-medium tracking-tight text-slate">
              …
            </p>
          ) : (
            <p className="tnum mt-1 text-[32px] font-medium tracking-tight">
              {(Object.keys(TOKENS) as Token[])
                .filter((t) => balances[t] > 0n)
                .map(
                  (t) =>
                    `${SYMBOL[t]}${Number(formatUnits(balances[t], 6)).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`,
                )
                .join("  +  ") || "—"}
            </p>
          )}
          <p className="mt-1 font-mono text-[12.5px] text-slate">
            {address ? short(address, 12, 8) : "—"}
          </p>
        </div>

        {/* Demo data, deliberately not styled like the real balance beside it: payments
            are not read from chain yet, so this figure describes nobody's money. */}
        <div className="opacity-70">
          <h2 className="text-[13px] text-slate">Held in screening &mdash; demo data</h2>
          <p className="tnum mt-1 text-[24px] font-medium tracking-tight text-slate">
            {held.count > 0 ? held.byToken.map(([t, sum]) => money(sum, t)).join(" + ") : "—"}
          </p>
          <p className="mt-1 max-w-[38ch] text-[12.5px] text-slate">
            Sample data, not your money. Payments are not read from the chain yet, so nothing
            here reflects what any gateway is holding. In the built product a payment settles
            to you or goes back to the payer within {ago(RECLAIM_SECONDS)}.
          </p>
        </div>
      </section>

      <section className="mt-11 border-t border-rule pt-5 opacity-70">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 className="text-[15px] font-medium text-slate">
            Recent settlements &mdash; demo data
          </h2>
          <Link
            href="/payments"
            className="text-[13px] text-slate underline underline-offset-2 hover:text-ink"
          >
            All payments
          </Link>
        </div>

        <p className="mt-1 max-w-[58ch] text-[12px] text-slate">
          Payments are not read from the chain yet. These rows are sample data and describe no
          payment made to you.
        </p>

        {settled.length > 0 ? (
          <ScrollRegion label="Recent settlements" className="mt-4">
            <table className="min-w-[560px]">
              <thead>
                <tr>
                  <Th>Time</Th>
                  <Th>Gateway</Th>
                  <Th right>Amount</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {settled.map((p) => {
                  const g = byslug(p.gateway);
                  return (
                    <tr key={p.id}>
                      <Td className="whitespace-nowrap">
                        <span className="tnum">{p.time}</span>
                        <div className="text-[12px] text-slate">{p.date}</div>
                      </Td>
                      <Td>
                        <span className="block max-w-[24ch] truncate">
                          {g.name}
                        </span>
                        <div className="text-[12px] text-slate">{g.token}</div>
                      </Td>
                      <Td right className="tnum whitespace-nowrap">
                        {money(p.amount, g.token)}
                      </Td>
                      <Td className="w-[200px]">
                        <StatusMark status={p.status} />
                        {p.openedAgo !== undefined && (
                          <div className="mt-1">
                            <Elapsed since={p.openedAgo} />
                          </div>
                        )}
                        <TxLink tx={p.tx} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollRegion>
        ) : (
          <p className="mt-4 max-w-[52ch] text-slate">
            Nothing has settled yet. Payments arrive here once they clear
            screening.
          </p>
        )}
      </section>
    </div>
  );
}

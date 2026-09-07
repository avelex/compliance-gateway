import Link from "next/link";
import {
  ago,
  byslug,
  heldInScreening,
  money,
  payments,
  RECLAIM_SECONDS,
  short,
} from "@/lib/data";
import { Elapsed } from "@/components/elapsed";
import { ScrollRegion, StatusMark, Td, Th, TxLink } from "@/components/ui";

const WALLET = "0x9E44aC0b71fD2c8e5B0a3f7C41dE96b2A8517f30";
const BALANCE = "$12,480.50";

export default function WalletPage() {
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
          <p className="tnum mt-1 text-[32px] font-medium tracking-tight">
            {BALANCE}
          </p>
          <p className="mt-1 font-mono text-[12.5px] text-slate">
            {short(WALLET, 12, 8)}
          </p>
        </div>

        <div>
          <h2 className="text-[13px] text-slate">Held in screening</h2>
          {held.count > 0 ? (
            <>
              <p className="tnum mt-1 text-[32px] font-medium tracking-tight">
                {held.byToken.map(([t, sum]) => money(sum, t)).join(" + ")}
              </p>
              <p className="mt-1 max-w-[38ch] text-[12.5px] text-slate">
                Across{" "}
                {held.count === 1 ? "1 payment" : `${held.count} payments`}. Not
                yours yet — each settles to you or goes back to the payer within{" "}
                {ago(RECLAIM_SECONDS)}.
              </p>
            </>
          ) : (
            <>
              <p className="tnum mt-1 text-[32px] font-medium tracking-tight text-slate">
                —
              </p>
              <p className="mt-1 max-w-[38ch] text-[12.5px] text-slate">
                Nothing is waiting on a screening result.
              </p>
            </>
          )}
        </div>
      </section>

      <section className="mt-11">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 className="text-[15px] font-medium">Recent settlements</h2>
          <Link
            href="/payments"
            className="text-[13px] text-slate underline underline-offset-2 hover:text-ink"
          >
            All payments
          </Link>
        </div>

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

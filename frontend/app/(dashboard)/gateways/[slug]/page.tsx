import QRCode from "qrcode";
import {
  ago,
  byslug,
  gateways,
  heldInScreening,
  money,
  payments,
  policySentence,
  RECLAIM_SECONDS,
  short,
} from "@/lib/data";
import { Suspense } from "react";
import { GatewayHead } from "@/components/gateway-head";
import { DeployedBanner } from "@/components/deployed-banner";
import { CopyLink } from "@/components/copy-link";
import { Elapsed } from "@/components/elapsed";
import { ScrollRegion, StatusMark, Td, Th } from "@/components/ui";

export function generateStaticParams() {
  return gateways.map((g) => ({ slug: g.slug }));
}

export default async function OverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = byslug(slug);
  const url = `https://pay.compliancegateway.xyz/checkout?gate=${g.address}`;
  const qr = await QRCode.toString(url, {
    type: "svg",
    margin: 0,
    color: { dark: "#05070E", light: "#0000" },
  });

  const rows = payments.filter((p) => p.gateway === g.slug).slice(0, 5);
  const held = heldInScreening(g.slug);

  return (
    <div className="max-w-[880px]">
      <Suspense fallback={null}>
        <DeployedBanner />
      </Suspense>

      <GatewayHead g={g} tab="overview" />

      <section className="mt-9">
        <h2 className="text-[15px] font-medium">Take a payment</h2>
        <p className="mt-1.5 max-w-[58ch] text-[13px] text-slate">
          Send this link to a customer or put it behind a button. Money that clears screening
          arrives in your settlement wallet.
        </p>
        <div className="mt-4 flex flex-col gap-6 bg-wash p-5 sm:flex-row">
          <div className="min-w-0 flex-1">
            <CopyLink url={url} />
            <p className="text-[12.5px] text-slate">
              To ask for a set amount, add <span className="font-mono">&amp;amount=250</span> to
              the end of the link.
            </p>
          </div>
          <div
            role="img"
            aria-label={`QR code for the payment link to ${g.name}`}
            className="size-[104px] shrink-0 self-start [&>svg]:size-full"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
        </div>
      </section>

      <section className="mt-11">
        <h2 className="text-[15px] font-medium">Configuration</h2>
        <dl className="mt-4 grid gap-x-12 sm:grid-cols-2">
          <Row label="Network" value="Base Sepolia" />
          <Row label="Token" value={g.token} />
          <Row label="Contract" value={short(g.address, 10, 8)} mono />
          <Row label="Settlement wallet" value={short(g.payoutTo, 10, 8)} mono />
          <Row label="Deployed" value={g.deployedAt} />
          <Row
            label="Risk ceiling"
            value={`${g.policy.maxRisk} of 100 — above this, funds go back`}
          />
        </dl>
        <p className="mt-4 max-w-[62ch] border-l-2 border-ink pl-3 text-[13px]">
          {policySentence(g.policy, g.token)} Funds are screened on every payment, and are held
          for up to {ago(RECLAIM_SECONDS)} while that runs.
        </p>
      </section>

      <section className="mt-11">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 className="text-[15px] font-medium">Recent payments</h2>
          {held.count > 0 && (
            <p className="text-[13px] text-slate">
              <span className="tnum">
                {held.byToken.map(([t, sum]) => money(sum, t)).join(" + ")}
              </span>{" "}
              held in screening
            </p>
          )}
        </div>

        {rows.length > 0 ? (
          <ScrollRegion label={`Recent payments for ${g.name}`} className="mt-4">
            <table className="min-w-[620px]">
              <thead>
                <tr>
                  <Th>Time</Th>
                  <Th>Payer</Th>
                  <Th right>Amount</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <Td className="whitespace-nowrap">
                      <span className="tnum">{p.time}</span>
                      <div className="text-[12px] text-slate">{p.date}</div>
                    </Td>
                    <Td className="font-mono text-[12.5px]">{short(p.payer, 10, 6)}</Td>
                    <Td right className="tnum whitespace-nowrap">
                      {money(p.amount, g.token)}
                    </Td>
                    <Td className="w-[230px]">
                      <StatusMark status={p.status} />
                      {p.openedAgo !== undefined && (
                        <div className="mt-1">
                          <Elapsed since={p.openedAgo} />
                        </div>
                      )}
                      {p.note && <div className="mt-1 text-[12px] text-slate">{p.note}</div>}
                      <a
                        href={`https://sepolia.basescan.org/tx/${p.tx}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-[12px] text-slate underline underline-offset-2 hover:text-ink"
                      >
                        View transaction
                      </a>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        ) : (
          <p className="mt-4 max-w-[52ch] text-slate">
            No payments yet. Copy the link above and send it to a customer to take the first
            one.
          </p>
        )}
      </section>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-6 border-b border-rule py-3">
      <dt className="text-[13px] text-slate">{label}</dt>
      <dd className={`text-[13px] ${mono ? "font-mono text-[12.5px]" : ""}`}>{value}</dd>
    </div>
  );
}

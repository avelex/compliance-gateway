import QRCode from "qrcode";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ago, money, payments, policySentence, RECLAIM_SECONDS, short } from "@/lib/data";
import { loadGateway } from "@/lib/gateways";
import { GatewayHead } from "@/components/gateway-head";
import { DeployedBanner } from "@/components/deployed-banner";
import { CopyLink } from "@/components/copy-link";
import { Elapsed } from "@/components/elapsed";
import { ScrollRegion, StatusMark, Td, Th, TxLink } from "@/components/ui";

export default async function OverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(slug)) notFound();

  const r = await loadGateway(slug as `0x${string}`);
  if (!r.ok && r.missing) notFound();
  if (!r.ok) {
    // An RPC blip is not a missing gateway, and must not be reported as one.
    return (
      <div className="max-w-[880px]">
        <GatewayHead address={slug} tab="overview" />
        <p className="mt-9 max-w-[54ch] text-slate">
          We could not read this gateway from the chain. This tells you nothing about the
          gateway itself — nothing has changed. Reload to try again.
        </p>
      </div>
    );
  }
  const g = r.gateway;

  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3100"}/checkout?gate=${g.address}`;
  const qr = await QRCode.toString(url, {
    type: "svg",
    margin: 0,
    color: { dark: "#05070E", light: "#0000" },
  });

  // mock: payments are out of scope for the Privy pass (lib/data.ts)
  const rows = payments.slice(0, 5);

  return (
    <div className="max-w-[880px]">
      <Suspense fallback={null}>
        <DeployedBanner />
      </Suspense>

      <GatewayHead address={g.address} tab="overview" />

      <section className="mt-9">
        <h2 className="text-[15px] font-medium">Take a payment</h2>
        <p className="mt-1.5 max-w-[58ch] text-[13px] text-slate">
          This is the link a customer would open. Do not send it out yet: the payer side is
          not built — the page it opens is a walkthrough that ignores which gateway it was
          given and takes no money.
        </p>
        <div className="mt-4 flex flex-col gap-6 bg-wash p-5 sm:flex-row">
          <div className="min-w-0 flex-1">
            <CopyLink url={url} />
            <p className="text-[12.5px] text-slate">
              To ask for a set amount, add{" "}
              <span className="font-mono">&amp;amount=250</span> to the end of
              the link.
            </p>
          </div>
          <div
            role="img"
            aria-label={`QR code for the payment link to gateway ${short(g.address, 6, 4)}`}
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
          <Row
            label="Settlement wallet"
            value={short(g.payoutTo, 10, 8)}
            mono
          />
          <Row
            label="Risk ceiling"
            value={`${g.policy.maxRisk} of 100 — above this, funds go back`}
          />
        </dl>
        <p className="mt-4 max-w-[62ch] border-l-2 border-ink pl-3 text-[13px]">
          {policySentence(g.policy, g.token)} Funds are screened on every
          payment, and are held for up to {ago(RECLAIM_SECONDS)} while that
          runs.
        </p>
      </section>

      <section className="mt-11 border-t border-rule pt-5 opacity-70">
        <h2 className="text-[15px] font-medium text-slate">Recent payments &mdash; demo data</h2>
        <p className="mt-1 max-w-[58ch] text-[12px] text-slate">
          Payments are not read from the chain yet. The rows below are sample data: the
          payers, amounts, times and transaction links are invented and describe no payment
          to this gateway.
        </p>

        <ScrollRegion
            label={`Recent payments for gateway ${short(g.address, 6, 4)}`}
            className="mt-4"
          >
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
                    <Td className="font-mono text-[12.5px]">
                      {short(p.payer, 10, 6)}
                    </Td>
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
                      {p.note && (
                        <div className="mt-1 text-[12px] text-slate">
                          {p.note}
                        </div>
                      )}
                      <TxLink tx={p.tx} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
        </ScrollRegion>
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-6 border-b border-rule py-3">
      <dt className="text-[13px] text-slate">{label}</dt>
      <dd className={`text-[13px] ${mono ? "font-mono text-[12.5px]" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

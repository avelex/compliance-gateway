import QRCode from "qrcode";
import { byslug, gateways, payments, money, policySentence, short } from "@/lib/data";
import { GatewayHead } from "@/components/gateway-head";
import { CopyLink } from "@/components/copy-link";
import { StatusMark, Td, Th } from "@/components/ui";

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

  return (
    <div className="max-w-[880px]">
      <GatewayHead g={g} tab="overview" />

      <section className="mt-9">
        <h2 className="text-[15px] font-medium">Take a payment</h2>
        <p className="mt-1.5 max-w-[58ch] text-[13px] text-slate">
          Send this link to a customer or put it behind a button. Money that clears screening arrives
          in your settlement wallet.
        </p>
        <div className="mt-4 flex gap-6 border border-rule bg-wash p-5">
          <div className="min-w-0 flex-1">
            <CopyLink url={url} />
            <p className="mt-3 text-[12.5px] text-slate">
              Add <span className="font-mono">&amp;amount=250</span> to open the page with the amount
              filled in.
            </p>
          </div>
          <div
            className="size-[104px] shrink-0 [&>svg]:size-full"
            aria-label="QR code for the payment link"
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
          <Row label="Settles to" value={short(g.payoutTo, 10, 8)} mono />
          <Row label="Deployed" value={g.deployedAt} />
          <Row label="Risk ceiling" value={`${g.policy.maxRisk} of 100`} />
        </dl>
        <p className="mt-4 max-w-[62ch] border-l-2 border-ink pl-3 text-[13px]">
          {policySentence(g.policy, g.token)}
        </p>
      </section>

      <section className="mt-11">
        <h2 className="text-[15px] font-medium">Recent payments</h2>
        <div className="mt-4 overflow-x-auto"><table className="min-w-[560px]">
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
                <Td className="tnum text-slate">{p.time}</Td>
                <Td className="font-mono text-[12.5px]">{short(p.payer, 10, 6)}</Td>
                <Td right className="tnum">{money(p.amount, g.token)}</Td>
                <Td className="w-[150px]">
                  <StatusMark status={p.status} />
                  {p.note && <div className="mt-1 text-[12px] text-slate">{p.note}</div>}
                </Td>
              </tr>
            ))}
          </tbody>
        </table></div>
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

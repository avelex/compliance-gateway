import { byslug, gateways } from "@/lib/data";
import { GatewayHead } from "@/components/gateway-head";
import { PolicyForm } from "@/components/policy-form";

export function generateStaticParams() {
  return gateways.map((g) => ({ slug: g.slug }));
}

export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = byslug(slug);
  return (
    <div className="max-w-[880px]">
      <GatewayHead g={g} tab="policy" />
      <PolicyForm gateway={g} />
    </div>
  );
}

import { Suspense } from "react";
import { notFound } from "next/navigation";
import { GatewayHead } from "@/components/gateway-head";
import { PolicyForm } from "@/components/policy-form";
import { loadGateway } from "@/lib/gateways";

export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(slug)) notFound();

  const r = await loadGateway(slug as `0x${string}`);
  if (!r.ok && r.missing) notFound();
  if (!r.ok) {
    // An RPC blip is not a missing gateway, and must not be reported as one.
    return (
      <div className="max-w-[880px]">
        <GatewayHead address={slug} tab="policy" />
        <p className="mt-9 max-w-[54ch] text-slate">
          We could not read this gateway from the chain, so its policy is not shown. This
          tells you nothing about the gateway itself — nothing has changed. Reload to try again.
        </p>
      </div>
    );
  }
  const g = r.gateway;

  return (
    <div className="max-w-[880px]">
      <GatewayHead address={g.address} tab="policy" />
      <Suspense fallback={<p className="mt-9 text-slate">Loading policy…</p>}>
        <PolicyForm gateway={g} />
      </Suspense>
    </div>
  );
}

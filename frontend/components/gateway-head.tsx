"use client";

import Link from "next/link";
import { gatewayName } from "@/lib/names";

export function GatewayHead({ address, tab }: { address: string; tab: "overview" | "policy" }) {
  const tabs = [
    { key: "overview", label: "Overview", href: `/gateways/${address}` },
    { key: "policy", label: "Policy", href: `/gateways/${address}/policy` },
  ];
  return (
    <header>
      <Link href="/gateways" className="text-[12.5px] text-slate hover:text-ink">
        Gateways
      </Link>
      <h1 className="display mt-1.5 text-[30px] font-semibold">{gatewayName(address)}</h1>
      <div className="mt-1 font-mono text-[12.5px] text-slate">{address}</div>
      <nav className="mt-6 flex gap-6 border-b border-rule">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={tab === t.key ? "page" : undefined}
            className={`-mb-px border-b-2 pb-2.5 text-[13.5px] transition-colors ${
              tab === t.key ? "border-ink font-medium" : "border-transparent text-slate hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

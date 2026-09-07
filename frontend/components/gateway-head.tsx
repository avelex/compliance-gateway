import Link from "next/link";
import type { Gateway } from "@/lib/data";

export function GatewayHead({ g, tab }: { g: Gateway; tab: "overview" | "policy" }) {
  const tabs = [
    { key: "overview", label: "Overview", href: `/gateways/${g.slug}` },
    { key: "policy", label: "Policy", href: `/gateways/${g.slug}/policy` },
  ];
  return (
    <header>
      <Link href="/gateways" className="text-[12.5px] text-slate hover:text-ink">
        Gateways
      </Link>
      <h1 className="display mt-1.5 text-[30px] font-semibold">{g.name}</h1>
      <div className="mt-1 font-mono text-[12.5px] text-slate">{g.address}</div>
      <nav className="mt-6 flex gap-6 border-b border-rule">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
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

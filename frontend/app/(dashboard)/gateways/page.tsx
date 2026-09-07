import Link from "next/link";
import { gateways, policyLine, short } from "@/lib/data";
import { Button } from "@/components/ui";

export default function GatewaysPage() {
  return (
    <div className="max-w-[880px]">
      <div className="flex items-end justify-between">
        <h1 className="display text-[30px] font-semibold">Gateways</h1>
        <Button href="/gateways/new">New gateway</Button>
      </div>
      <p className="mt-2 max-w-[62ch] text-slate">
        Each gateway is a contract you own. Payments land in it, wait for screening, and leave to you
        or back to the payer.
      </p>

      <ul className="mt-9 border-t border-ink">
        {gateways.map((g) => (
          <li key={g.address}>
            <Link
              href={`/gateways/${g.slug}`}
              className="group grid grid-cols-[1fr_auto] items-baseline gap-5 border-b border-rule py-5 transition-colors hover:bg-wash md:grid-cols-[1fr_80px_200px] md:gap-6"
            >
              <div>
                <div className="text-[16px] font-medium group-hover:text-blue-deep">{g.name}</div>
                <div className="mt-0.5 font-mono text-[12.5px] text-slate">{short(g.address, 10, 6)}</div>
              </div>
              <div className="hidden text-[13.5px] md:block">{g.token}</div>
              <div className="text-right">
                <div className="text-[13.5px]">{policyLine(g.policy, g.token)}</div>
                <div className="mt-0.5 text-[12.5px] text-slate md:hidden">{g.token}</div>
                <div className="mt-0.5 text-[12.5px] text-slate">Deployed {g.deployedAt.split(",")[0]}</div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

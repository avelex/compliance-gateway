import Link from "next/link";
import { gateways, policyLine, short } from "@/lib/data";
import { Button } from "@/components/ui";

/**
 * Full-width ledger: the extra horizontal room buys real columns, so token, policy
 * and deploy date stop hiding behind a breakpoint. Below 860px the row folds to one
 * column and each field carries its own label, since the header rule is gone there.
 */
const ROW =
  "grid grid-cols-[minmax(200px,1.5fr)_minmax(150px,1.1fr)_64px_minmax(190px,1.2fr)_118px] items-baseline gap-6 max-[860px]:grid-cols-1 max-[860px]:gap-1";

const LABEL = "hidden text-slate max-[860px]:inline";

export default function GatewaysPage() {
  return (
    <div>
      <div className="flex items-end justify-between gap-6">
        <h1 className="display text-[30px] font-semibold">Gateways</h1>
        <Button href="/gateways/new">New gateway</Button>
      </div>
      <p className="mt-2 max-w-[62ch] text-slate">
        Each gateway is a contract you own. Payments land in it, wait for screening, and leave to you
        or back to the payer.
      </p>

      <ul className="mt-8">
        <li className={`${ROW} border-b border-ink pb-2 text-[12.5px] text-slate max-[860px]:hidden`}>
          <span>Gateway</span>
          <span>Address</span>
          <span>Token</span>
          <span>Policy</span>
          <span className="text-right">Deployed</span>
        </li>
        {gateways.map((g) => (
          <li key={g.address}>
            <Link
              href={`/gateways/${g.slug}`}
              className={`group ${ROW} border-b border-rule py-5 transition-colors hover:bg-wash`}
            >
              <span className="text-[16px] font-medium group-hover:text-blue-deep">{g.name}</span>
              <span className="font-mono text-[12.5px] text-slate">{short(g.address, 10, 6)}</span>
              <span className="text-[13.5px]">
                <span className={LABEL}>Token </span>
                {g.token}
              </span>
              <span className="text-[13.5px]">
                <span className={LABEL}>Policy </span>
                {policyLine(g.policy, g.token)}
              </span>
              <span className="tnum text-right text-[12.5px] text-slate max-[860px]:text-left">
                <span className={LABEL}>Deployed </span>
                {g.deployedAt.split(",")[0]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

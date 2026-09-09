import { DashboardSkeleton } from "@/components/dashboard-skeleton";
import { ago } from "@/lib/data";
import { GATEWAY_TIMEOUT_SECONDS } from "@/lib/abi/gateway";

export default function Loading() {
  return (
    <div className="max-w-[980px]">
      <h1 className="display text-[30px] font-semibold">Payments</h1>
      <p className="mt-2 max-w-[62ch] text-slate">
        Every payment across your gateways. One in screening is holding funds in the contract
        for up to {ago(GATEWAY_TIMEOUT_SECONDS)}, after which it settles to you or goes back to the
        payer. There is no third outcome.
      </p>
      <DashboardSkeleton />
    </div>
  );
}

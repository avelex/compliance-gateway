import { DashboardSkeleton } from "@/components/dashboard-skeleton";

export default function Loading() {
  return (
    <div>
      <div className="flex items-end justify-between gap-6">
        <h1 className="display text-[30px] font-semibold">Gateways</h1>
        <div className="h-9 w-32 animate-pulse rounded-xs bg-rule" />
      </div>
      <p className="mt-2 max-w-[62ch] text-slate">
        Each gateway is a contract you own. Payments land in it, wait for screening, and leave to you
        or back to the payer.
      </p>
      <DashboardSkeleton />
    </div>
  );
}

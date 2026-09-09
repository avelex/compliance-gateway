import { DashboardSkeleton } from "@/components/dashboard-skeleton";

export default function Loading() {
  return (
    <div className="max-w-[880px]">
      <h1 className="display text-[30px] font-semibold">Wallet</h1>
      <p className="mt-2 max-w-[62ch] text-slate">
        Cleared payments land here. It is your organisation&rsquo;s wallet, held
        by Privy — we never take custody of your money, and neither does any
        gateway for longer than a screening window.
      </p>
      <DashboardSkeleton />
    </div>
  );
}

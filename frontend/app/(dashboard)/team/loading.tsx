import { DashboardSkeleton } from "@/components/dashboard-skeleton";

export default function Loading() {
  return (
    <div>
      <h1 className="display text-[30px] font-semibold">Team</h1>
      <p className="mt-2 max-w-[62ch] text-slate">
        Everyone here can approve a change to your compliance policy, and the number below decides
        how many of them have to. This is your own control — we hold no key that can change your
        policy either way.
      </p>
      <DashboardSkeleton />
    </div>
  );
}

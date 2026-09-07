import Link from "next/link";
import { Nav } from "@/components/nav";
import { heartbeatMinutesAgo, heldInScreening, liveness, money } from "@/lib/data";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const state = liveness(heartbeatMinutesAgo);
  const held = heldInScreening();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-rule px-5 py-5 md:w-[212px] md:border-r md:border-b-0 md:py-6">
        <Link href="/gateways" className="display text-[15px] font-semibold tracking-tight">
          ComplianceGateway
        </Link>

        <Nav />

        <div className="mt-6 flex flex-wrap gap-x-10 gap-y-5 md:mt-auto md:block md:space-y-5 md:pt-8">
          <Monitoring state={state} minutesAgo={heartbeatMinutesAgo} />

          <div className="md:border-t md:border-rule md:pt-4">
            <div className="text-[12px] text-slate">Settlement wallet</div>
            <div className="tnum mt-0.5 text-[19px] font-medium tracking-tight">$12,480.50</div>
            <div className="font-mono text-[11.5px] text-slate">0x9E44…7f30</div>

            {/* The number the merchant is actually anxious about. */}
            {held.count > 0 && (
              <div className="mt-3 border-t border-rule pt-3">
                <div className="text-[12px] text-slate">Held in screening</div>
                <div className="tnum mt-0.5 text-[15px] font-medium">
                  {held.byToken.map(([t, sum]) => money(sum, t)).join(" + ")}
                </div>
                <div className="text-[12px] text-slate">
                  {held.count === 1 ? "1 payment" : `${held.count} payments`}, not yours yet
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-6 py-8 md:px-10 md:py-9">{children}</main>
    </div>
  );
}

/**
 * An indicator that can only ever say "fine" is worse than none: after 48 hours of
 * silence every attestation stops validating, and the merchant must see that here.
 */
function Monitoring({
  state,
  minutesAgo,
}: {
  state: "live" | "warning" | "dead";
  minutesAgo: number;
}) {
  const since =
    minutesAgo < 60
      ? `${minutesAgo} minutes ago`
      : `${Math.floor(minutesAgo / 60)} hours ago`;

  if (state === "dead") {
    return (
      <div role="status" className="border-l-2 border-alert bg-alert-wash px-3 py-2.5">
        <div className="text-[13px] font-medium text-alert">Monitoring is dead</div>
        <p className="mt-0.5 max-w-[30ch] text-[12px] text-ink">
          Last heartbeat {since}. Any payment that needs an identity check is being refused
          right now. Gateways set to screening only still work.
        </p>
      </div>
    );
  }

  if (state === "warning") {
    return (
      <div role="status" className="border-l-2 border-ink pl-3">
        <div className="text-[13px] font-medium">Monitoring is late</div>
        <p className="mt-0.5 max-w-[30ch] text-[12px] text-slate">
          Last heartbeat {since}. Identity checks still work; they stop after 48 hours of
          silence.
        </p>
      </div>
    );
  }

  return (
    <div role="status" className="border-l-2 border-rule pl-3">
      <div className="text-[13px]">Monitoring live</div>
      <div className="text-[12px] text-slate">Heartbeat {since}</div>
    </div>
  );
}

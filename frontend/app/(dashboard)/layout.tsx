import Link from "next/link";
import { Nav } from "@/components/nav";
import { AccountMenu } from "@/components/account-menu";
import { heartbeatMinutesAgo, liveness } from "@/lib/data";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const state = liveness(heartbeatMinutesAgo);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-13 shrink-0 items-center justify-between border-b border-rule px-4 md:px-8">
        <Link href="/gateways" className="display text-[15px] font-semibold tracking-tight">
          ComplianceGateway
        </Link>
        <AccountMenu
          org="Meridian Holdings"
          email="alex@meridian.example"
          wallet="0x9E44…7f30"
        />
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="shrink-0 border-b border-rule px-5 py-4 md:w-[212px] md:border-r md:border-b-0 md:py-6">
          <Nav />
        </aside>

        <main className="min-w-0 flex-1 px-6 py-8 md:px-10 md:py-9">
          {state !== "live" && (
            <div className="mb-8">
              <MonitoringAlert state={state} minutesAgo={heartbeatMinutesAgo} />
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * Only surfaces when monitoring is late or dead. Silence means healthy — but silence
 * must never mean broken, so the failing states get more room than a badge ever had.
 */
function MonitoringAlert({
  state,
  minutesAgo,
}: {
  state: "warning" | "dead";
  minutesAgo: number;
}) {
  const since =
    minutesAgo < 60 ? `${minutesAgo} minutes ago` : `${Math.floor(minutesAgo / 60)} hours ago`;

  if (state === "dead") {
    return (
      <div role="status" className="border border-alert bg-alert-wash px-4 py-3">
        <div className="text-[14px] font-medium text-alert">Monitoring is dead</div>
        <p className="mt-1 max-w-[70ch] text-[13px]">
          Last heartbeat {since}. Any payment that needs an identity check is being refused
          right now. Gateways set to screening only still work.
        </p>
      </div>
    );
  }

  return (
    <div role="status" className="border border-rule bg-wash px-4 py-3">
      <div className="text-[14px] font-medium">Monitoring is late</div>
      <p className="mt-1 max-w-[70ch] text-[13px] text-slate">
        Last heartbeat {since}. Identity checks still work; they stop after 48 hours of
        silence.
      </p>
    </div>
  );
}

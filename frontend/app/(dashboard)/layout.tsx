import Link from "next/link";
import { Nav } from "@/components/nav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-rule px-5 py-5 md:w-[212px] md:border-r md:border-b-0 md:py-6">
        <Link href="/gateways" className="display text-[15px] font-semibold tracking-tight">
          ComplianceGateway
        </Link>

        <Nav />

        <div className="mt-6 flex flex-wrap gap-x-10 gap-y-5 md:mt-auto md:block md:space-y-5 md:pt-8">
          <div className="border-l-2 border-blue pl-3">
            <div className="text-[13px]">Monitoring live</div>
            <div className="text-[12px] text-slate">Heartbeat 4 minutes ago</div>
          </div>

          <div className="md:border-t md:border-rule md:pt-4">
            <div className="text-[12px] text-slate">Settlement wallet</div>
            <div className="tnum mt-0.5 text-[19px] font-medium tracking-tight">$12,480.50</div>
            <div className="font-mono text-[11.5px] text-slate">0x9E44…7f30</div>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-6 py-8 md:px-10 md:py-9">{children}</main>
    </div>
  );
}

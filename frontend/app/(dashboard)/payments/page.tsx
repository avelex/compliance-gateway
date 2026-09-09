import { Suspense } from "react";
import { PaymentsTable } from "@/components/payments-table";
import { ago } from "@/lib/data";

// MerchantGateway.TIMEOUT is a contract constant (15 minutes), the same for every
// gateway. This page lists sample payments across gateways, not one loaded gateway,
// so there is nothing to read it from on chain here.
const TIMEOUT_SECONDS = 900;

export default function PaymentsPage() {
  return (
    <div className="max-w-[980px]">
      <h1 className="display text-[30px] font-semibold">Payments</h1>
      <p className="mt-2 max-w-[62ch] text-slate">
        Every payment across your gateways. One in screening is holding funds in the contract
        for up to {ago(TIMEOUT_SECONDS)}, after which it settles to you or goes back to the
        payer. There is no third outcome.
      </p>
      <Suspense fallback={<p className="mt-8 text-slate">Loading payments…</p>}>
        <PaymentsTable />
      </Suspense>
    </div>
  );
}

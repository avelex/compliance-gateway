import { Suspense } from "react";
import { Wizard } from "@/components/wizard";

export default function NewGatewayPage() {
  return (
    <div className="max-w-[720px]">
      <h1 className="display text-[30px] font-semibold">New gateway</h1>
      <p className="mt-2 max-w-[62ch] text-slate">
        Screening of incoming funds is always on. What you choose here is when a payer has to
        prove who they are, and which token you settle in.
      </p>
      <Suspense fallback={<p className="mt-10 text-slate">Loading…</p>}>
        <Wizard />
      </Suspense>
    </div>
  );
}

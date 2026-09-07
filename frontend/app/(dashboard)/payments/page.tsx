import { PaymentsTable } from "@/components/payments-table";

export default function PaymentsPage() {
  return (
    <div className="max-w-[980px]">
      <h1 className="display text-[30px] font-semibold">Payments</h1>
      <p className="mt-2 max-w-[62ch] text-slate">
        Every payment across your gateways. A payment in screening is holding funds in the contract;
        it will settle to you or return to the payer.
      </p>
      <PaymentsTable />
    </div>
  );
}

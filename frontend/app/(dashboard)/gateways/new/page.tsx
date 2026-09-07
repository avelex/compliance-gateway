import { Wizard } from "@/components/wizard";

export default function NewGatewayPage() {
  return (
    <div className="max-w-[720px]">
      <h1 className="display text-[30px] font-semibold">New gateway</h1>
      <p className="mt-2 max-w-[62ch] text-slate">
        Two decisions and a deployment. Screening of incoming funds is always on; identity checks are
        what you choose here.
      </p>
      <Wizard />
    </div>
  );
}

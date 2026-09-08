import { LoginGate } from "@/components/login-gate";
import { ApprovalPanel } from "@/components/approval-panel";

export default async function ApprovePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <LoginGate>
      <div className="mx-auto max-w-[880px] px-6 py-12">
        <h1 className="display text-[30px] font-semibold">Approve a policy change</h1>
        <p className="mt-2 max-w-[58ch] text-slate">
          Someone on your team wants to change what a gateway asks payers to prove. Nothing has
          been sent yet.
        </p>
        <ApprovalPanel id={id} />
      </div>
    </LoginGate>
  );
}

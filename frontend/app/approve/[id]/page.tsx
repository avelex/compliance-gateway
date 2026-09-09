import { Providers } from "@/app/providers";
import { LoginGate } from "@/components/login-gate";
import { ApprovalPanel } from "@/components/approval-panel";

// Same reasoning as the dashboard layout: everything here sits behind LoginGate, and a
// build-time prerender fails whenever NEXT_PUBLIC_PRIVY_APP_ID isn't set yet.
export const dynamic = "force-dynamic";

export default async function ApprovePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    // PrivyProvider lives in the dashboard layout, and this route is outside that group —
    // without its own Providers, LoginGate's usePrivy() throws "must be used within a
    // `PrivyProvider`" and the approval link is a crash, not a page. Mounted here rather
    // than in the root layout so /checkout (the payer's screen) keeps carrying no Privy.
    <Providers>
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
    </Providers>
  );
}

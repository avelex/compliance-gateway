"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui";

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const { getAccessToken, user } = usePrivy();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If somehow they already have it, fast-forward (defensive)
  if (user?.customMetadata?.organizationId) {
    onComplete();
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Organization name is required.");

    setLoading(true);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ organizationName: name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create organization");

      // Wait a moment for the server's update to propagate before completing
      setTimeout(onComplete, 500);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-[46ch] px-6 pt-24">
      <h1 className="display text-[30px] font-semibold">Set up your organisation</h1>
      <p className="mt-2 text-slate">
        Before you can deploy gateways, give your organisation a name. An on-chain wallet will be automatically created to hold your cleared funds securely.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-6">
        <div>
          <label className="text-[13px] font-medium">Organisation Name</label>
          <div className="mt-2">
            <input 
              type="text"
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              disabled={loading} 
              placeholder="Acme Corp" 
              className="flex min-h-9 w-full rounded-xs border border-rule bg-white px-3 py-1 text-[14px] shadow-sm transition-colors focus-visible:border-blue focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue disabled:cursor-not-allowed disabled:bg-wash disabled:text-slate"
            />
          </div>
        </div>

        {error && <p className="text-[13px] text-red-500">{error}</p>}

        <Button disabled={loading}>{loading ? "Creating..." : "Complete setup"}</Button>
      </form>
    </div>
  );
}

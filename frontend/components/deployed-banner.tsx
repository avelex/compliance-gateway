"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

/** The end of the primary task should coincide with its payoff, not with a silent redirect. */
export function DeployedBanner() {
  const params = useSearchParams();
  const [shown, setShown] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (params.get("deployed") === "1") setShown(true);
  }, [params]);

  useEffect(() => {
    if (shown) box.current?.focus();
  }, [shown]);

  if (!shown) return null;

  return (
    <div
      ref={box}
      tabIndex={-1}
      role="status"
      className="mb-7 flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border border-rule bg-wash px-4 py-3.5 outline-none"
    >
      <div>
        <div className="text-[14px] font-medium">Gateway deployed</div>
        <p className="mt-0.5 max-w-[52ch] text-[13px] text-slate">
          It is live on Base Sepolia and ready to take payments. Copy the payment link below
          to start taking them.
        </p>
      </div>
      <button
        onClick={() => setShown(false)}
        className="text-[13px] text-slate underline underline-offset-2 hover:text-ink"
      >
        Dismiss
      </button>
    </div>
  );
}

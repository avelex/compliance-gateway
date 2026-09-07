"use client";

import { useEffect, useState } from "react";
import { ago, RECLAIM_SECONDS } from "@/lib/data";

/**
 * A screening payment is the merchant's most anxious moment: money has left the
 * customer and not arrived. A pulsing dot is not an answer — the elapsed time is.
 */
export function Elapsed({ since }: { since: number }) {
  const [seconds, setSeconds] = useState(since);

  // Start ticking only after mount, so server and client render the same first frame.
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const reclaimable = seconds >= RECLAIM_SECONDS;

  return (
    <span className="text-[12px] text-slate">
      {reclaimable
        ? "Past the window — the payer can take it back at any time"
        : `In screening ${ago(seconds)}`}
    </span>
  );
}

"use client";

import { useState } from "react";

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-stretch gap-2">
      <div className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap border border-rule bg-white px-3 py-2.5 font-mono text-[12.5px]">
        {url}
      </div>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        }}
        className="shrink-0 rounded-xs bg-ink px-4 text-[13px] font-medium text-white transition-colors hover:bg-blue-deep"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}

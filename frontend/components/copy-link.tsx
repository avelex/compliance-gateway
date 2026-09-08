"use client";

import { useId, useRef, useState } from "react";

export function CopyLink({ url, label = "Payment link" }: { url: string; label?: string }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setResult("copied");
      setTimeout(() => setResult("idle"), 2400);
    } catch {
      // Never report a success that did not happen — select the text so the
      // keyboard shortcut still works.
      setResult("failed");
      input.current?.select();
    }
  }

  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="flex items-stretch gap-2">
        <input
          id={id}
          ref={input}
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 border border-rule bg-white px-3 py-2.5 font-mono text-[12.5px] outline-none focus-visible:border-ink"
        />
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-xs bg-ink px-4 text-[13px] font-medium text-white transition-colors hover:bg-blue-deep"
        >
          Copy link
        </button>
      </div>

      <p role="status" className="mt-2 min-h-[18px] text-[12.5px]">
        {result === "copied" && <span className="text-slate">Link copied</span>}
        {result === "failed" && (
          <span className="text-alert">
            Your browser blocked the clipboard. The link is selected — copy it from the field.
          </span>
        )}
      </p>
    </div>
  );
}

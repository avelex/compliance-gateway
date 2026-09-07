"use client";

import { useId } from "react";

/**
 * Uses the native popover API so light-dismiss, Escape and focus handling come from
 * the platform rather than from a hand-rolled dropdown.
 */
export function AccountMenu({
  org,
  email,
  wallet,
}: {
  org: string;
  email: string;
  wallet: string;
}) {
  const id = useId().replace(/:/g, "");

  return (
    <>
      <button
        popoverTarget={id}
        className="flex items-center gap-2 rounded-xs py-1 pr-1 pl-2 text-[13px] text-white transition-colors hover:bg-white/12"
      >
        <span className="hidden sm:inline">{org}</span>
        <span className="flex size-7 items-center justify-center rounded-full border border-white/38">
          <AccountIcon />
        </span>
        <span className="sr-only">Account menu</span>
      </button>

      <div
        id={id}
        popover="auto"
        className="fixed top-[52px] right-4 bottom-auto left-auto m-0 w-[248px] border border-rule bg-paper p-0 text-ink shadow-[0_8px_24px_-12px_rgba(5,7,14,0.25)] md:right-8"
      >
        <div className="border-b border-rule px-4 py-3">
          <div className="text-[13.5px] font-medium">{org}</div>
          <div className="text-[12.5px] text-slate">{email}</div>
        </div>
        <dl className="border-b border-rule px-4 py-3">
          <dt className="text-[12px] text-slate">Signed in with</dt>
          <dd className="font-mono text-[12.5px]">{wallet}</dd>
        </dl>
        <button className="w-full px-4 py-2.5 text-left text-[13px] transition-colors hover:bg-wash">
          Sign out
        </button>
      </div>
    </>
  );
}

function AccountIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <circle cx="8" cy="5.6" r="2.6" />
      <path d="M2.9 13.4a5.3 5.3 0 0 1 10.2 0" />
    </svg>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/wallet", label: "Wallet" },
  { href: "/gateways", label: "Gateways" },
  { href: "/payments", label: "Payments" },
  { href: "/attestations", label: "Attestations" },
  { href: "/team", label: "Team" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex flex-row gap-6 md:flex-col md:gap-0">
      {items.map((i) => {
        const active = path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={`py-1.5 text-[13.5px] transition-colors md:-ml-5 md:border-l-2 md:pl-[18px] ${
              active
                ? "font-medium text-ink md:border-ink"
                : "text-slate hover:text-ink md:border-transparent"
            }`}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

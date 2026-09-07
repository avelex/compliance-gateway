import Link from "next/link";
import type { Status } from "@/lib/data";

export function Hex({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`font-mono text-[12.5px] tracking-tight ${className}`}>{children}</span>;
}

const STATUS: Record<Status, { label: string; mark: React.ReactNode; text: string }> = {
  screening: {
    label: "Screening",
    text: "text-blue",
    mark: <span className="breathe block size-2 rounded-full bg-blue" />,
  },
  settled: {
    label: "Settled",
    text: "text-ink",
    mark: <span className="block size-2 bg-ink" />,
  },
  returned: {
    label: "Returned",
    text: "text-slate",
    mark: <span className="hatch block size-2 border border-rule" />,
  },
};

export function StatusMark({ status }: { status: Status }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-2 ${s.text}`}>
      {s.mark}
      {s.label}
    </span>
  );
}

export function Button({
  children,
  href,
  variant = "primary",
  className = "",
  ...rest
}: {
  children: React.ReactNode;
  href?: string;
  variant?: "primary" | "quiet";
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  // A disabled control the merchant stares at during a deploy must still be readable:
  // opacity on a blue fill lands near 2:1.
  const base =
    "inline-flex min-h-9 items-center justify-center rounded-xs px-3.5 py-1.5 text-[13px] font-medium transition-colors disabled:pointer-events-none";
  const look =
    variant === "primary"
      ? "bg-blue text-white hover:bg-blue-deep disabled:bg-rule disabled:text-slate"
      : "border border-rule text-ink hover:border-ink disabled:text-slate";
  const cn = `${base} ${look} ${className}`;
  if (href) return <Link href={href} className={cn}>{children}</Link>;
  return <button className={cn} {...rest}>{children}</button>;
}

/** Names what went wrong and how to get out of it. Alert colour is reserved for
 *  the system failing — never for a payment that was returned. */
export function ErrorNote({
  children,
  onRetry,
  retryLabel = "Try again",
}: {
  children: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div role="alert" className="border border-alert bg-alert-wash px-4 py-3">
      <p className="max-w-[54ch] text-[13px] text-ink">{children}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-[13px] text-alert underline underline-offset-2"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}

/** overflow-x-auto is unreachable without a mouse unless it can take focus. */
export function ScrollRegion({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-scroll-region
      role="region"
      aria-label={label}
      tabIndex={0}
      className={`overflow-x-auto ${className}`}
    >
      {children}
    </div>
  );
}

export function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-3.5">
      <dt className="text-[12.5px] text-slate">{label}</dt>
      <dd className="mt-1 text-[13.5px]">{children}</dd>
    </div>
  );
}

export function Th({ children, right = false }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th
      scope="col"
      className={`border-b border-ink pb-2 pr-6 text-[12.5px] font-medium text-slate last:pr-0 ${right ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  right = false,
  className = "",
}: {
  children?: React.ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <td className={`border-b border-rule py-3 pr-6 align-top last:pr-0 ${right ? "text-right" : ""} ${className}`}>{children}</td>
  );
}

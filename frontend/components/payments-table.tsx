"use client";

import { useState } from "react";
import { byslug, money, payments, short, type Status } from "@/lib/data";
import { StatusMark, Td, Th } from "@/components/ui";

const FILTERS: { v: Status | "all"; label: string }[] = [
  { v: "all", label: "All" },
  { v: "screening", label: "Screening" },
  { v: "settled", label: "Settled" },
  { v: "returned", label: "Returned" },
];

export function PaymentsTable() {
  const [status, setStatus] = useState<Status | "all">("all");
  const [gate, setGate] = useState("all");
  const [spin, setSpin] = useState(false);

  const rows = payments.filter(
    (p) => (status === "all" || p.status === status) && (gate === "all" || p.gateway === gate),
  );

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-rule pb-4">
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.v}
              onClick={() => setStatus(f.v)}
              aria-pressed={status === f.v}
              className={`h-8 rounded-xs px-3 text-[13px] transition-colors ${
                status === f.v ? "bg-ink text-white" : "text-slate hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <select
          value={gate}
          onChange={(e) => setGate(e.target.value)}
          className="h-8 rounded-xs border border-rule bg-white px-2 text-[13px] outline-none focus:border-ink"
        >
          <option value="all">All gateways</option>
          {["0x7a3f", "0x2c91", "0xb84d"].map((s) => (
            <option key={s} value={s}>{byslug(s).name}</option>
          ))}
        </select>

        <button
          onClick={() => {
            setSpin(true);
            setTimeout(() => setSpin(false), 700);
          }}
          className="ml-auto text-[13px] text-slate transition-colors hover:text-ink"
        >
          {spin ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="mt-6 overflow-x-auto"><table className="min-w-[640px]">
        <thead>
          <tr>
            <Th>Time</Th>
            <Th>Payer</Th>
            <Th>Gateway</Th>
            <Th right>Amount</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const g = byslug(p.gateway);
            return (
              <tr key={p.id}>
                <Td className="tnum whitespace-nowrap text-slate">{p.time}</Td>
                <Td className="font-mono text-[12.5px]">{short(p.payer, 10, 6)}</Td>
                <Td>
                  {g.name}
                  <div className="text-[12px] text-slate">{g.token}</div>
                </Td>
                <Td right className="tnum whitespace-nowrap">{money(p.amount, g.token)}</Td>
                <Td className="w-[190px]">
                  <StatusMark status={p.status} />
                  {p.note && <div className="mt-1 text-[12px] text-slate">{p.note}</div>}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table></div>

      {rows.length === 0 && (
        <p className="mt-8 text-slate">No payments match this filter. Clear it to see all of them.</p>
      )}
    </>
  );
}

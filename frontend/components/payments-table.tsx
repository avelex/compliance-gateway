"use client";

import { useId, useState } from "react";
import { useSearchParams } from "next/navigation";
import { byslug, money, payments, short, type Status } from "@/lib/data";
import {
  ErrorNote,
  ScrollRegion,
  StatusMark,
  Td,
  Th,
  TxLink,
} from "@/components/ui";
import { Elapsed } from "@/components/elapsed";

const FILTERS: { v: Status | "all"; label: string }[] = [
  { v: "all", label: "All" },
  { v: "screening", label: "Screening" },
  { v: "settled", label: "Settled" },
  { v: "returned", label: "Returned" },
];

export function PaymentsTable() {
  const gateId = useId();
  const params = useSearchParams();
  const [status, setStatus] = useState<Status | "all">("all");
  const [gate, setGate] = useState("all");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("12:41");

  const filtered = status !== "all" || gate !== "all";
  const rows = payments.filter(
    (p) =>
      (status === "all" || p.status === status) &&
      (gate === "all" || p.gateway === gate),
  );

  async function refresh() {
    setBusy(true);
    setFailed(false);
    try {
      await new Promise((ok, no) =>
        setTimeout(
          () => (params.get("fail") === "refresh" ? no(new Error()) : ok(null)),
          700,
        ),
      );
      setUpdatedAt(
        new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

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
                status === f.v
                  ? "bg-ink text-white"
                  : "text-slate hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor={gateId} className="text-[13px] text-slate">
            Gateway
          </label>
          <select
            id={gateId}
            value={gate}
            onChange={(e) => setGate(e.target.value)}
            className="h-8 rounded-xs border border-rule bg-white px-2 text-[13px] outline-none focus:border-ink"
          >
            <option value="all">All</option>
            {["0x7a3f", "0x2c91", "0xb84d"].map((s) => (
              <option key={s} value={s}>
                {byslug(s).name}
              </option>
            ))}
          </select>
        </div>

        {filtered && (
          <button
            onClick={() => {
              setStatus("all");
              setGate("all");
            }}
            className="text-[13px] text-slate underline underline-offset-2 transition-colors hover:text-ink"
          >
            Clear filters
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className="tnum text-[12.5px] text-slate">
            Updated {updatedAt}
          </span>
          <button
            onClick={refresh}
            disabled={busy}
            className="text-[13px] text-slate transition-colors hover:text-ink disabled:opacity-50"
          >
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {failed && (
        <div className="mt-5">
          <ErrorNote onRetry={refresh}>
            Could not reach the network. The payments below are from {updatedAt}{" "}
            and may be out of date.
          </ErrorNote>
        </div>
      )}

      {rows.length > 0 ? (
        <ScrollRegion label="Payments" className="mt-6">
          <table className="min-w-[720px]">
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
                    <Td className="whitespace-nowrap">
                      <span className="tnum">{p.time}</span>
                      <div className="text-[12px] text-slate">{p.date}</div>
                    </Td>
                    <Td className="font-mono text-[12.5px]">
                      {short(p.payer, 10, 6)}
                    </Td>
                    <Td>
                      <span className="block max-w-[22ch] truncate">
                        {g.name}
                      </span>
                      <div className="text-[12px] text-slate">{g.token}</div>
                    </Td>
                    <Td right className="tnum whitespace-nowrap">
                      {money(p.amount, g.token)}
                    </Td>
                    <Td className="w-[230px]">
                      <StatusMark status={p.status} />
                      {p.openedAgo !== undefined && (
                        <div className="mt-1">
                          <Elapsed since={p.openedAgo} />
                        </div>
                      )}
                      {p.note && (
                        <div className="mt-1 text-[12px] text-slate">
                          {p.note}
                        </div>
                      )}
                      <TxLink tx={p.tx} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollRegion>
      ) : filtered ? (
        <div className="mt-8">
          <p className="text-slate">No payments match this filter.</p>
          <button
            onClick={() => {
              setStatus("all");
              setGate("all");
            }}
            className="mt-2 text-[13px] text-blue underline underline-offset-2 hover:text-blue-deep"
          >
            Show all payments
          </button>
        </div>
      ) : (
        <div className="mt-8 max-w-[52ch]">
          <p className="text-[15px]">No payments yet.</p>
          <p className="mt-1 text-slate">
            Payments appear here the moment a customer opens one of your gateway
            links. Copy a link from a gateway&rsquo;s Overview to take your
            first one.
          </p>
        </div>
      )}
    </>
  );
}

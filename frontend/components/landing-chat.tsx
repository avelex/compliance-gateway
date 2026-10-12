"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeftRight, ArrowUp, Building2, Check, Landmark, type LucideIcon } from "lucide-react";
import { Hex } from "@/components/landing-passport";
import s from "@/app/landing.module.css";

// Hero animation: a counterparty asks, Deflow answers with a document. All values are illustrative.
type Row = { label: string; v: string; mono?: boolean; ok?: boolean; copy?: string };
type Scene = {
  tab: string; icon: LucideIcon; name: string; date: string; q: string; time: string; reply: string; read: string;
  doc: { title: string; amount: string; net: string; rows: Row[] };
};

const SCENES: Scene[] = [
  { tab: "Regulator", icon: Landmark, name: "Bank of Lithuania", date: "Fri 9 Oct · 09:05", q: "Who sent 12 480 USDC on 2026-10-08, how was it screened, and who approved the credit?", time: "09:07", reply: "Here is the Payment Passport.", read: "09:08",
    doc: { title: "Payment Passport", amount: "12 480.00 USDC", net: "Ethereum · 2026-10-08", rows: [
      { label: "ID", v: "PP-20261008", mono: true, copy: "PP-20261008-00412" },
      { label: "Sender", v: "🇪🇪 Mari Tamm" },
      { label: "Checks", v: "4 of 4 passed", ok: true },
      { label: "Approved", v: "J. Kuusk, MLRO" },
      { label: "Proof", v: "4f2a…e91c", mono: true, copy: "4f2a9c1e7b3d5f8a0c2e4b6d8f1a3c5e7b9d0f2a4c6e8b1d3f5a7c9e0b2de91c" } ] } },
  { tab: "Bank", icon: Building2, name: "Hanse Bank AG", date: "Mon 12 Oct · 11:20", q: "Your withdrawal of 86 300 EURC on 2026-10-09: which incoming payments does it settle, and was each one checked?", time: "11:24", reply: "Attached is the Settlement Manifest.", read: "11:25",
    doc: { title: "Settlement Manifest", amount: "86 300.00 EURC", net: "Base · 2026-10-09", rows: [
      { label: "ID", v: "SM-20261009", mono: true, copy: "SM-20261009-00031" },
      { label: "Payments", v: "41 incoming" },
      { label: "Checks", v: "164 of 164 passed", ok: true },
      { label: "Signed", v: "J. Kuusk, MLRO" },
      { label: "Proof", v: "b07d…3a52", mono: true, copy: "b07d2e9a4c1f6b3d8e0a5c7f9b2d4e6a8c0f1b3d5e7a9c2b4d6f8e0a1c3a52" } ] } },
  { tab: "Off-ramp", icon: ArrowLeftRight, name: "Lumen Exchange", date: "Mon 12 Oct · 16:42", q: "Before we pay out 3 150 USDC: was Travel Rule data collected, and does the sender own the wallet?", time: "16:43", reply: "Payment Passport with Travel Rule data.", read: "16:44",
    doc: { title: "Payment Passport", amount: "3 150.00 USDC", net: "Polygon · 2026-10-12", rows: [
      { label: "ID", v: "PP-20261012", mono: true, copy: "PP-20261012-00087" },
      { label: "Sender", v: "🇪🇪 Anna Lepik" },
      { label: "Travel Rule", v: "IVMS101 · collected", ok: true },
      { label: "Wallet", v: "Signed by sender", ok: true },
      { label: "Proof", v: "91ce…07bd", mono: true, copy: "91ce3b7d5a2f8e0c4b6d1a9f3e5c7b0d2a4f6e8c1b3d5a7f9e0c2b4d6a8f07bd" } ] } },
];

const DUR = 9800;
const STILL = 9000; // reduced motion: hold the finished frame, before the fade-out
const N = SCENES.length;

export function LandingChat() {
  const [sc, setSc] = useState(0);
  const [t, setT] = useState(0);
  const [still, setStill] = useState(false);
  const start = useRef(0);

  const go = (i: number) => {
    start.current = Date.now();
    setSc(i);
    setT(0);
  };

  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    setStill(reduced);
    if (reduced) return;
    start.current = Date.now();
    const id = setInterval(() => {
      const el = Date.now() - start.current;
      if (el >= DUR) {
        start.current = Date.now();
        setSc((c) => (c + 1) % N);
        setT(0);
      } else setT(el);
    }, 100);
    return () => clearInterval(id);
  }, []);

  const S = SCENES[sc];
  const at = still ? STILL : t;
  const n = Math.max(0, Math.min(S.reply.length, Math.floor(((at - 2100) / 1400) * S.reply.length)));
  const shown = at < 4700 ? 0 : Math.floor((at - 4700) / 250) + 1;
  const typing = at >= 2100 && at < 3700;
  const Icon = S.icon;

  return (
    <div className={s.chatw}>
      <div className={s.chat} role="img" aria-label={`Example: ${S.name} asks "${S.q}" and Deflow replies with a ${S.doc.title}.`}>
        <div className={s.chh}>
          <div className={s.av}><Icon size={17} strokeWidth={2.5} aria-hidden /></div>
          <span>{S.name}</span>
        </div>
        <div className={s.chb} style={{ opacity: at >= 9400 ? 0 : 1 }}>
          <span className={s.cdate}>{S.date}</span>
          {at < 1300 && (
            <span className={`${s.bub} ${s.them} ${s.dots}`}><i /><i /><i /></span>
          )}
          {at >= 1300 && <span className={`${s.bub} ${s.them}`}>{S.q}</span>}
          {at >= 2100 && <span className={s.cmeta}>{S.time}</span>}
          {at >= 3700 && <span className={`${s.bub} ${s.me}`}>{S.reply}</span>}
          {at >= 4300 && (
            <div className={s.cdoc}>
              <div className={s.cdl}>
                <span className={s.cdlogo}><Image src="/deflow-logo.png" alt="" width={37} height={10} /></span>
                <div>
                  <b>{S.doc.title}</b>
                  <b className={s.cdamt}>{S.doc.amount}</b>
                  <span>{S.doc.net}</span>
                </div>
              </div>
              <div className={s.cdr}>
                {S.doc.rows.map((r, k) => (
                  <div key={r.label} className={s.cdrow}>
                    <span className={s.cdk}>{r.label}</span>
                    {k < shown && (
                      <span className={r.ok ? `${s.cdv} ${s.good}` : s.cdv}>
                        {r.ok && <Check size={12} strokeWidth={2.5} aria-hidden />}
                        {r.copy ? <Hex value={r.copy} label={r.v} /> : <span className={r.mono ? s.mono : ""}>{r.v}</span>}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {at >= 6600 && <span className={`${s.cmeta} ${s.rd}`}>Read {S.read}</span>}
        </div>
        <div className={s.cin}>
          {typing ? (
            <div className={`${s.inp} ${s.on}`}>{S.reply.slice(0, n)}<span className={s.caret} /></div>
          ) : (
            <div className={s.inp}>Message</div>
          )}
          <div className={s.send}><ArrowUp size={15} strokeWidth={2.5} aria-hidden /></div>
        </div>
      </div>
      <div className={s.tabs}>
        {SCENES.map((x, k) => (
          <button key={x.tab} type="button" aria-pressed={k === sc} className={k === sc ? `${s.tab} ${s.cur}` : s.tab} onClick={() => go(k)}>
            <span className={s.bar}><span style={{ width: k === sc && !still ? `${Math.min(100, (t / DUR) * 100)}%` : "0%" }} /></span>
            <span className={s.tl}><span className={s.mono}>0{k + 1}</span>{x.tab}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

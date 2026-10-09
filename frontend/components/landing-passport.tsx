"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ArrowRight, Copy } from "lucide-react";
import s from "@/app/landing.module.css";

// Sample passport for the hero. The values are illustrative, not a real payment.
const ID = "PP-20261008-00412";
const FROM = "0x7a3fE1b2c4D5e6F7089a1B2c3D4e5F60718c91e";
const TO = "0x4e1bA93c27F0d6E5b8C1a4D7e2F3b9C06a5d08d2";
const TX = "0x9c0d5e2f8a1b3c4d6e7f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b77ab";

const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

export function Hex({ value, label = short(value) }: { value: string; label?: string }) {
  const [status, setStatus] = useState("");
  const report = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(""), 1500);
  };
  return (
    <span className={s.hex}>
      <span className={s.mono}>{label}</span>
      <button
        type="button"
        title="Copy"
        aria-label={`Copy ${label}`}
        className={status === "Copied" ? `${s.cp} ${s.ok}` : s.cp}
        onClick={() => {
          // The clipboard API is missing on insecure origins and can reject; say so instead of flashing success.
          if (!navigator.clipboard) return report("Copy is not available here");
          navigator.clipboard.writeText(value).then(() => report("Copied"), () => report("Copy failed"));
        }}
      >
        <Copy size={12} strokeWidth={2} aria-hidden />
      </button>
      <span className={s.sr} role="status">{status}</span>
    </span>
  );
}

export function LandingPassport() {
  const stack = useRef<HTMLDivElement>(null);
  const front = useRef<HTMLDivElement>(null);
  const back1 = useRef<HTMLDivElement>(null);
  const back2 = useRef<HTMLDivElement>(null);
  const holo = useRef<HTMLDivElement>(null);
  const shine = useRef<HTMLDivElement>(null);

  const frame = useRef(0);

  // Direct style writes, not state: a mousemove re-render per frame would be wasted work.
  const apply = (px: number, py: number, on: boolean) => {
    if (front.current) front.current.style.transform = `rotateX(${-py * 10}deg) rotateY(${px * 12}deg) translate3d(${px * 10}px,${py * 8}px,0)`;
    if (back1.current) back1.current.style.transform = `translate3d(${-px * 10}px,${-py * 6}px,0)`;
    if (back2.current) back2.current.style.transform = `translate3d(${-px * 20}px,${-py * 12}px,0)`;
    if (holo.current) holo.current.style.backgroundPosition = `${50 + px * 120}% ${50 + py * 120}%`;
    if (shine.current) {
      shine.current.style.backgroundPosition = `${50 - px * 140}% 0`;
      shine.current.style.opacity = on ? "1" : "0";
    }
  };

  return (
    <div
      ref={stack}
      className={s.stack}
      onMouseMove={(e) => {
        // The tilt is decoration: skip it entirely for visitors who asked for less motion.
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const { clientX, clientY } = e;
        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
          const r = stack.current!.getBoundingClientRect();
          apply((clientX - r.left) / r.width - 0.5, (clientY - r.top) / r.height - 0.5, true);
        });
      }}
      onMouseLeave={() => {
        cancelAnimationFrame(frame.current);
        apply(0, 0, false);
      }}
    >
      <div ref={back2} className={`${s.back} ${s.b2}`} aria-hidden><div /></div>
      <div ref={back1} className={`${s.back} ${s.b1}`} aria-hidden><div /></div>
      <div ref={front} className={s.front}>
        <div className={s.pp}>
          <div className={s.ppl}>
            <div className={s.ppt}>
              <span>Deflow</span>
              <div ref={holo} className={s.holo}>
                <Image src="/deflow-logo.png" alt="" width={46} height={12} />
              </div>
            </div>
            <div className={s.ppn}>Payment Passport</div>
            <div className={s.amt}>
              <b>12 480.00 USDC</b>
              <span>Ethereum · 2026-10-08</span>
            </div>
          </div>
          <div className={s.ppr}>
            <div className={s.row}>
              <Hex value={ID} label={ID} />
              <span className={s["ok-badge"]}>Credited</span>
            </div>
            <div className={s.parties}>
              <div className={s.party}>
                <span className={s.k}>From</span>
                <b>🇪🇪 Mari Tamm</b>
                <Hex value={FROM} />
              </div>
              <ArrowRight size={16} strokeWidth={2} style={{ marginTop: 22, flex: "none" }} aria-hidden />
              <div className={s.party}>
                <span className={s.k}>To</span>
                <b>🇱🇹 Northbank Pay UAB</b>
                <Hex value={TO} />
              </div>
            </div>
            <div className={s.proof}>
              <div className={s.ph}><span className={s.k}>Checks</span><b>4 of 4 passed</b></div>
              <div className={s.seg} aria-hidden><i /><i /><i /><i /></div>
              <div className={s.sub}>
                <div><span className={s.k}>Signed</span>J. Kuusk</div>
                <div><span className={s.k}>Executed</span><Hex value={TX} /></div>
              </div>
            </div>
          </div>
        </div>
        <div ref={shine} className={s.shine} aria-hidden />
      </div>
    </div>
  );
}

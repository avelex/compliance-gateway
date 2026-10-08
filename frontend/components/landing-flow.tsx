"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ArrowRight,
  ArrowUp,
  FileCheck2,
  IdCard,
  KeyRound,
  Landmark,
  ListChecks,
  Lock,
  LockOpen,
  Pause,
  Scale,
  Snowflake,
  Undo2,
  User,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import s from "@/app/landing.module.css";

const cx = (...names: string[]) => names.map((n) => s[n]).join(" ");

type Mode = "without" | "with";

const CFG: [Mode, string, string][] = [
  [
    "without",
    "Without contracts",
    "Funds move as they do today. Deflow watches deposits to your addresses, runs the checks, applies your rules, records the decisions and issues a Payment Passport for each deposit.",
  ],
  [
    "with",
    "With contracts",
    "Adds a hold before credit. Each payer gets a personal deposit address, a smart contract that you own. The money waits there until your signed decision, and it can only go to your pool or back to the payer. Deflow only delivers your decision on-chain; it cannot forge one.",
  ],
];

const OUTCOMES: [string, LucideIcon, string][] = [
  ["credit", Wallet, "Credit to your pool"],
  ["hold", Pause, "Hold"],
  ["freeze", Snowflake, "Freeze"],
  ["return", Undo2, "Return to payer"],
];

/** The money path and the evidence path, plus the configuration that switches the contract on. */
export function LandingFlow() {
  const [mode, setMode] = useState<Mode>("with");
  const on = mode === "with";
  return (
    <div className={s.right}>
      <div className={s["tp-scroll"]} tabIndex={0} aria-label="How Deflow works" data-scroll-region>
        <div className={on ? s.tp : cx("tp", "off")}>
          <div className={cx("tp-lbl", "money")} style={{ gridColumn: 1, gridRow: 1 }}>
            <h3>Money<br />Path</h3>
          </div>
          <Box cls="payer" icon={User} t="Payer" d="Sends to a personal address" arrow="blue" col={2} row={1} />
          <div className={s["tp-contract"]} style={{ gridColumn: "3 / 6", gridRow: 1 }}>
            <div className={s["tp-ch"]}>
              <span>{on ? "Your contract" : "No contract"}</span>
              {on ? <Lock size={18} strokeWidth={1.5} aria-hidden /> : <LockOpen size={18} strokeWidth={1.5} aria-hidden />}
            </div>
            <h3>{on ? "Waits until the evidence is complete" : "Funds move as they do today"}</h3>
            <span className={cx("tp-ar", "blue")}><ArrowRight size={18} strokeWidth={1.5} aria-hidden /></span>
          </div>
          <div className={s["tp-outs"]} style={{ gridColumn: "6 / 8", gridRow: 1 }}>
            {OUTCOMES.map(([k, Icon, t]) => (
              <div key={k} className={cx("tp-o", k)}>
                <Icon size={18} strokeWidth={1.5} aria-hidden />
                <b>{t}</b>
              </div>
            ))}
          </div>
          <div className={s["tp-rel"]} style={{ gridColumn: 5, gridRow: 2 }}>
            {on && (
              <>
                <span className={s["tp-up"]}><ArrowUp size={16} strokeWidth={1.5} aria-hidden /></span>
                <span className={s["tp-ln"]} />
                <span className={s["tp-rl"]}>Releases</span>
                <span className={s["tp-ln"]} />
              </>
            )}
          </div>
          <div className={cx("tp-lbl", "evidence")} style={{ gridColumn: 1, gridRow: 3 }}>
            <h3>Evidence<br />Path</h3>
          </div>
          <Box cls="step" icon={IdCard} t="Travel Rule" d="Before the deposit" arrow="ink" col={2} row={3} />
          <Box cls="step" icon={ListChecks} t="Checks" d="KYT · sanctions · split payments" arrow="ink" col={3} row={3} />
          <Box cls="step" icon={Scale} t="Your rules" d="Approved by your MLRO" arrow="ink" col={4} row={3} />
          <Box cls="decision" icon={KeyRound} t="Signed decision" d="By your officer or your rules" arrow="ink" col={5} row={3} />
          <Box cls="passport" icon={FileCheck2} t="Payment Passport" d="Anyone can verify it" arrow="ink" col={6} row={3} />
          <div className={s["tp-recv"]} style={{ gridColumn: 7, gridRow: 3 }}>
            <div className={s["tp-r"]}>
              <Landmark size={18} strokeWidth={1.5} aria-hidden />
              <div><h4>Off-ramp · bank</h4><p>Accepts the funds</p></div>
            </div>
            <div className={s["tp-r"]}>
              <Scale size={18} strokeWidth={1.5} aria-hidden />
              <div><h4>Regulator</h4><p>Answers the RFI</p></div>
            </div>
          </div>
          <div className={s["tp-br"]} style={{ gridColumn: "2 / 7", gridRow: 4 }}>
            <span className={s["tp-brk"]} />
            <Image src="/deflow-logo.png" alt="Deflow" width={119} height={30} />
          </div>
        </div>
      </div>

      <div className={s.cfg} id="configurations">
        <div className={s["cfg-h"]}>
          <h2 id="cfg-title">Pick a configuration</h2>
          <span>The diagram above follows your choice.</span>
        </div>
        <div className={s["cfg-opts"]} role="radiogroup" aria-labelledby="cfg-title">
          {CFG.map(([k, t, d]) => (
            <label key={k} className={s.opt}>
              <input
                type="radio"
                name="config"
                value={k}
                checked={mode === k}
                onChange={() => setMode(k)}
                className={s.radio}
              />
              <span className={s.rd} />
              <b>{t}</b>
              <span className={s.od}>{d}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function Box({
  cls,
  icon: Icon,
  t,
  d,
  arrow,
  col,
  row,
}: {
  cls: string;
  icon: LucideIcon;
  t: string;
  d: string;
  arrow: "blue" | "ink";
  col: number;
  row: number;
}) {
  return (
    <div className={cx("tp-b", cls)} style={{ gridColumn: col, gridRow: row }}>
      <span className={s["tp-ic"]}><Icon size={18} strokeWidth={1.5} aria-hidden /></span>
      <div>
        <h4>{t}</h4>
        <p>{d}</p>
      </div>
      <span className={cx("tp-ar", arrow)}><ArrowRight size={18} strokeWidth={1.5} aria-hidden /></span>
    </div>
  );
}

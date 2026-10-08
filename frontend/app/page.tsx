import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Schibsted_Grotesk } from "next/font/google";
import { FileCheck2, FileSignature, ListChecks, type LucideIcon } from "lucide-react";
import { LandingFlow } from "@/components/landing-flow";
import s from "./landing.module.css";

export const metadata: Metadata = {
  title: "Deflow — A proof for every deposit and every withdrawal",
  description:
    "Deflow is an evidence layer for stablecoin deposits. It gives regulated crypto businesses a signed proof of how each deposit was checked and decided.",
};

// Loaded here, not in the root layout, so the dashboard never downloads it.
const schibsted = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-schibsted", display: "swap" });

// Read at build time like every NEXT_PUBLIC_ value. Empty means no waitlist button at all,
// never a button that leads nowhere.
const WAITLIST_URL = process.env.NEXT_PUBLIC_WAITLIST_URL ?? "";

const cx = (...names: string[]) => names.map((n) => s[n]).join(" ");

const DOCS: [LucideIcon, string, string, string][] = [
  [FileCheck2, "Payment Passport", "per deposit", "Checks and their sources, rule and list versions, the officer’s decision, signed by you."],
  [FileSignature, "Settlement Manifest", "per withdrawal", "Which checked deposits make up the amount you withdraw."],
  [ListChecks, "Audit Export", "per period", "Rule versions, calibrations and decision statistics, so the logic can be reproduced."],
];
const PROBLEM = [
  ["An RFI answer is assembled by hand from five systems", "The Payment Passport is ready when the request arrives"],
  ["A KYT score says “risky”, not why the deposit was accepted", "The checks, the rules and the person who decided are on record"],
  ["Payer data arrives after the deposit", "Travel Rule data is collected before the deposit"],
  ["A withdrawal is explained after the fact", "A Settlement Manifest comes with every withdrawal"],
];
const WHY = [
  ["A decision, not a score.", "KYT tools return a risk score. Deflow records which checks ran, under which rules and list versions, and who decided."],
  ["One pack, not five systems.", "The RFI answer is assembled when the decision is made, not by hand afterwards."],
  ["Your keys, your funds.", "Deflow never holds funds or signs transactions. With contracts, the contract carries out only your signed decision."],
];
const HOW = [
  ["Who decides.", "Routine credits and holds are made automatically under your rules. Everything else goes to an officer, who signs the decision personally."],
  ["Quiet freezes.", "On-chain, a freeze looks like any other check in progress, so nobody outside learns about it. A frozen deposit can never be sent back to the payer."],
];
const NOT = [
  ["That funds are clean.", "It records which checks ran, under which rules, who decided, and what happened to the money."],
  ["To hold funds or sign transactions.", "You sign. Deflow never takes custody."],
  ["To be a KYT provider.", "It runs the checks you choose, with the providers you choose."],
  ["To decide.", "Your officer or your rules decide. Deflow recommends."],
];

export default function Landing() {
  return (
    <div className={`${schibsted.variable} ${s.root}`}>
      <header className={s.hdr}>
        <div className={s.wrap}>
          <Link href="/" aria-label="Deflow home">
            <Image src="/deflow-logo.png" alt="Deflow" width={87} height={22} priority />
          </Link>
          <nav className={s.nav}>
            <a href="#problem">Problem</a>
            <a href="#why">Why Deflow</a>
            <a href="#how">How it works</a>
            <a href="#evidence">Evidence pack</a>
            <Link href="/gateways" className={s.tag}>Beta</Link>
          </nav>
        </div>
      </header>

      <main>
        <section className={cx("wrap", "fold")}>
          <div className={s.top}>
            <div className={s.hero}>
              <h1>A proof for every deposit and every withdrawal.</h1>
              <div className={s.side}>
                <p className={s.lead}>
                  Deflow is an evidence layer for stablecoin deposits.
                  <br />
                  It gives regulated crypto businesses a signed proof of how each deposit was checked and decided.
                </p>
                <p className={s.aud}>For processors, exchanges, off-ramps and custodians.</p>
                {WAITLIST_URL && (
                  <a className={s.btn} href={WAITLIST_URL} target="_blank" rel="noopener noreferrer">
                    Join the waitlist
                  </a>
                )}
              </div>
            </div>
            <LandingFlow />
          </div>

          <div className={s.pack} id="evidence">
            <h2>Evidence pack</h2>
            <div className={s.docs}>
              {DOCS.map(([Icon, name, scope, detail]) => (
                <article className={s.doc} key={name}>
                  <div className={s["doc-h"]}>
                    <Icon size={20} strokeWidth={1.5} aria-hidden />
                    <span>{scope}</span>
                  </div>
                  <h3>{name}</h3>
                  <p>{detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={s.sec} id="problem">
          <div className={cx("wrap", "sec-h")}>
            <h2>Problem</h2>
            <table className={s.cmp}>
              <thead>
                <tr>
                  <th className={s.lbl}>Today</th>
                  <th className={s.lbl}>With Deflow</th>
                </tr>
              </thead>
              <tbody>
                {PROBLEM.map(([today, withDeflow]) => (
                  <tr key={today}>
                    <td>{today}</td>
                    <td>{withDeflow}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <Section id="why" title="Why Deflow"><Points items={WHY} n={3} numbered /></Section>
        <Section id="how" title="How it works"><Points items={HOW} n={2} /></Section>
        <Section id="not" title="What Deflow does not claim"><Points items={NOT} n={2} ink /></Section>
      </main>

      <footer className={s.ftr}>
        <div className={s.wrap}>
          <Image src="/deflow-logo.png" alt="Deflow" width={71} height={18} />
          <span>Evidence layer for stablecoin deposits</span>
        </div>
      </footer>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className={s.sec} id={id}>
      <div className={cx("wrap", "sec-h")}>
        <h2>{title}</h2>
        {children}
      </div>
    </section>
  );
}

function Points({ items, n, numbered, ink }: { items: string[][]; n: number; numbered?: boolean; ink?: boolean }) {
  return (
    <div className={s.cols} style={{ "--n": n } as React.CSSProperties}>
      {items.map(([title, detail], i) => (
        <div className={ink ? cx("pt", "k") : s.pt} key={title}>
          {numbered && <span className={s.fn}>{String(i + 1).padStart(2, "0")}</span>}
          <h3>{title}</h3>
          <p>{detail}</p>
        </div>
      ))}
    </div>
  );
}

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Schibsted_Grotesk } from "next/font/google";
import {
  ArrowLeftRight,
  Check,
  Download,
  FileCheck2,
  FileSignature,
  IdCard,
  KeyRound,
  Landmark,
  ListChecks,
  Lock,
  Pause,
  Scale,
  Snowflake,
  Undo2,
  User,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { LandingPassport } from "@/components/landing-passport";
import s from "./landing.module.css";

export const metadata: Metadata = {
  title: "Deflow — A proof for every deposit and every withdrawal",
  description:
    "Deflow is an evidence layer for stablecoin deposits. It gives regulated crypto businesses a signed proof of how each deposit was checked and decided.",
};

// Loaded here, not in the root layout, so the dashboard never downloads it.
const schibsted = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-schibsted", display: "swap" });

// Read at build time like every NEXT_PUBLIC_ value. The external form wins; the email is the
// fallback. With neither set, no request button renders at all, never one that leads nowhere.
// Deflow itself collects no pilot or waitlist data.
const WAITLIST_URL = process.env.NEXT_PUBLIC_WAITLIST_URL ?? "";
const PILOT_EMAIL = process.env.NEXT_PUBLIC_PILOT_EMAIL ?? "";
const REQUEST_HREF =
  WAITLIST_URL ||
  (PILOT_EMAIL &&
    `mailto:${PILOT_EMAIL}?subject=${encodeURIComponent("Deflow pilot request")}&body=${encodeURIComponent(
      "Work email:\nCompany:\nCASP licence country:\n",
    )}`);

const cx = (...names: string[]) => names.map((n) => s[n]).join(" ");

const OUTS: [LucideIcon, string, string][] = [
  [Wallet, "Credit", "var(--green-600)"],
  [Pause, "Hold", "var(--ink-700)"],
  [Snowflake, "Freeze", "var(--red-600)"],
  [Undo2, "Return", "var(--amber-600)"],
];
const STEPS: [LucideIcon, string, string][] = [
  [ListChecks, "Checks", "var(--ink-800)"],
  [Scale, "Your rules", "var(--ink-800)"],
  [KeyRound, "Signed decision", "var(--blue-500)"],
  [FileCheck2, "Payment Passport", "var(--ink-950)"],
];
const DOCS: [LucideIcon, string, string, string, string[]][] = [
  [FileCheck2, "Per payment", "Payment Passport", "For the off-ramp, the bank and the regulator.",
    ["Originator and beneficiary", "Checks, scores and list dates", "Policy version and signer", "Executed transaction"]],
  [FileSignature, "Per withdrawal", "Settlement Manifest", "Shows which passported payments make up a withdrawal from your pool.",
    ["Payments included", "Passport references", "Withdrawal transaction"]],
  [Download, "Per period", "Audit Export", "Every decision for a period, in a format your auditor can work with.",
    ["All passports and decisions", "Policy changes", "Holds, freezes and returns"]],
];
const CONTROL: [LucideIcon, string, string][] = [
  [Lock, "Your contract", "Deployed per payer and owned by you."],
  [KeyRound, "Your key", "Every decision is signed by your officer, or by your policy key under rules your MLRO approved."],
  [ListChecks, "Your providers", "Deflow calls the KYT and sanctions sources you already use."],
  [Scale, "Your rules", "Policies are versioned. Every passport cites the version it was decided under."],
];
const STATS = [
  ["3–4 weeks", "Pilot length"],
  ["2–3 RFIs", "Answered with passports"],
  ["USDC, EURC", "On EVM networks"],
];

// Repeats of the logo pass alt="" so a screen reader announces the name once per landmark.
const Logo = ({ h, alt = "Deflow" }: { h: number; alt?: string }) => (
  <Image src="/deflow-logo.png" alt={alt} width={Math.round((h * 830) / 210)} height={h} />
);

export default function Landing() {
  return (
    <div className={`${schibsted.variable} ${s.root}`}>
      <header>
        <div className={s.stripe} aria-hidden><div /><div /><div /></div>
        <div className={s.hdr}>
          <div className={s.wrap}>
            <Link href="/" aria-label="Deflow home"><Logo h={28} /></Link>
            <nav className={s.nav} aria-label="Sections">
              <a href="#how">How it works</a>
              <a href="#evidence">Evidence</a>
              <a href="#control">Control</a>
              <a href="#pilot">Pilot</a>
              <Link href="/gateways" className={s.tag}>Beta</Link>
              {REQUEST_HREF && <a href="#pilot" className={s.btn}>Request a pilot</a>}
            </nav>
          </div>
        </div>
      </header>

      <main>
        <section className={cx("wrap", "hero")}>
          <div className={s.copy}>
            <h1>A proof for every deposit and every withdrawal.</h1>
            <p className={s.lead}>
              Deflow is an evidence layer for stablecoin deposits.
              <br />
              It gives regulated crypto businesses a signed proof of how each deposit was checked and decided.
            </p>
            <p className={s.aud}>For processors, exchanges, off-ramps and custodians.</p>
            <div className={s.ctas}>
              {REQUEST_HREF && <a href="#pilot" className={cx("btn", "lg")}>Request a pilot</a>}
              <a href="#how" className={cx("btn", "lg", "sec")}>How it works</a>
            </div>
          </div>
          <LandingPassport />
        </section>

        <section className={s.manifest} id="manifest">
          <div className={cx("wrap", "band")}>
            <div className={s.rule}><Logo h={22} alt="" /></div>
            <div className={s.cols}>
              <h2 className={s.claim}>Every stablecoin deposit you receive has to be explained sooner or later.</h2>
              <div className={s.mtext}>
                <p>
                  To a counterparty, a bank or a regulator. Deflow runs the compliance checks you choose, applies rules
                  approved by your MLRO, and records a decision signed by your compliance officer or made automatically
                  under your rules.
                </p>
                <p><b>Each deposit gets a Payment Passport its recipient can verify independently, ready before the next party asks.</b></p>
              </div>
            </div>
            <div className={cx("rule", "t")}><Logo h={22} alt="" /></div>
          </div>
        </section>

        <section className={s.how} id="how">
          <div className={cx("wrap", "band")}>
            <Head title="How it works">
              Each payment waits in your contract while Deflow collects the evidence. You decide, and the contract executes only what you signed.
            </Head>
            <div className={s["dg-box"]} tabIndex={0} role="region" aria-label="How Deflow works" data-scroll-region>
              <p className={s.sr}>
                Money path: the payer pays into your contract, which holds the payment until you decide, then credits,
                holds, freezes or returns it. Evidence path: Travel Rule data, checks, your rules, your signed decision,
                which instructs the contract, and a Payment Passport for the off-ramp, the bank and the regulator.
              </p>
              <div className={s.dg} aria-hidden>
                <div className={s.lbl} style={{ gridColumn: "1 / 12", gridRow: 1, color: "var(--blue-700)" }}>Money path</div>
                <Blk icon={User} label="Payer" bg="var(--blue-800)" at={[1, 2]} />
                <Ar at={[2, 2]} blue />
                <div className={s.contract} style={{ gridColumn: "3 / 8", gridRow: 2 }}>
                  <div><span>Your contract</span><Lock size={16} strokeWidth={2} aria-hidden /></div>
                  Holds the payment until you decide
                </div>
                <Ar at={[8, 2]} blue />
                <div className={s.outs} style={{ gridColumn: "9 / 12", gridRow: 2 }}>
                  {OUTS.map(([Icon, label, bg]) => (
                    <div className={s.out} style={{ background: bg }} key={label}>
                      <Icon size={14} strokeWidth={2} aria-hidden />{label}
                    </div>
                  ))}
                </div>
                <div className={s.rel} style={{ gridColumn: 7, gridRow: 3 }}><i /><span>Instructs</span><i /></div>
                <div className={s.lbl} style={{ gridColumn: "1 / 6", gridRow: 3, alignSelf: "end" }}>Evidence path</div>
                <Blk icon={IdCard} label="Travel Rule" bg="var(--ink-800)" at={[1, 4]} />
                {STEPS.map(([Icon, label, bg], i) => [
                  <Ar at={[2 + i * 2, 4]} key={`a${label}`} />,
                  <Blk icon={Icon} label={label} bg={bg} at={[3 + i * 2, 4]} key={label} />,
                ])}
                <Ar at={[10, 4]} />
                <div className={s.recv} style={{ gridColumn: 11, gridRow: 4 }}>
                  <div><ArrowLeftRight size={14} strokeWidth={2} aria-hidden />Off-ramp</div>
                  <div><Landmark size={14} strokeWidth={2} aria-hidden />Bank</div>
                  <div><Scale size={14} strokeWidth={2} aria-hidden />Regulator</div>
                </div>
                <div className={s.note} style={{ gridColumn: "1 / 12", gridRow: 5 }}>
                  Deflow holds no funds and signs no transactions.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={s.evidence} id="evidence">
          <div className={cx("wrap", "band")}>
            <Head title="Evidence pack">
              Deflow does not claim funds are clean. It records which checks ran, under which rules, who decided and
              what the contract executed.
            </Head>
            <div className={s.cards}>
              {DOCS.map(([Icon, scope, name, detail, items], i) => (
                <article className={s.card} key={name}>
                  <div className={i === 0 ? cx("card-h", "blue") : s["card-h"]}>
                    <div><span className={s.lbl}>{scope}</span><Icon size={20} strokeWidth={2} aria-hidden /></div>
                    <h3>{name}</h3>
                  </div>
                  <div className={s["card-b"]}>
                    <p>{detail}</p>
                    <ul>
                      {items.map((item) => (
                        <li key={item}><Check size={14} strokeWidth={2} aria-hidden />{item}</li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={s.control} id="control">
          <div className={cx("wrap", "band", "cols")} style={{ "--min": "320px" } as React.CSSProperties}>
            <Head title="Keys and funds stay with you.">Deflow holds no funds and signs no transactions.</Head>
            <div className={s.tiles}>
              {CONTROL.map(([Icon, title, detail]) => (
                <div className={s.tile} key={title}>
                  <Icon size={20} strokeWidth={2} aria-hidden />
                  <h3>{title}</h3>
                  <p>{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={s.pilot} id="pilot">
          <div className={cx("wrap", "band", "cols")} style={{ "--min": "340px" } as React.CSSProperties}>
            <Head title="Run it on real payments for 3–4 weeks.">
              We start with a Settlement Manifest over your last 90 days of deposits, then run alongside your flow in shadow mode, with funds moving as they do today, and answer 2–3 real RFIs with Payment Passports.
              <span className={s.stats}>
                {STATS.map(([value, label]) => (
                  <span key={value}><b>{value}</b>{label}</span>
                ))}
              </span>
            </Head>
            {REQUEST_HREF && (
              <div className={s.req}>
                <h3>Request a pilot</h3>
                <p>
                  Send us your work email, company and CASP licence country. We sign an NDA and a DPA before you share
                  any payment data.
                </p>
                <a
                  className={cx("btn", "lg")}
                  href={REQUEST_HREF}
                  {...(WAITLIST_URL && { target: "_blank", rel: "noopener noreferrer" })}
                >
                  Send request
                </a>
                <small>We reply within one or two working days.</small>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className={s.ftr}>
        <div className={s.wrap}>
          <Logo h={22} />
          <span>Not legal advice. Pilot terms are hypotheses. © 2026 Deflow</span>
        </div>
      </footer>
    </div>
  );
}

function Head({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={s["s-h"]}>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}

function Blk({ icon: Icon, label, bg, at }: { icon: LucideIcon; label: string; bg: string; at: [number, number] }) {
  return (
    <div className={s.blk} style={{ background: bg, gridColumn: at[0], gridRow: at[1], minHeight: at[0] === 1 ? 76 : undefined }}>
      <Icon size={16} strokeWidth={2} aria-hidden />
      {label}
    </div>
  );
}

function Ar({ at, blue }: { at: [number, number]; blue?: boolean }) {
  return <div className={blue ? cx("ar", "blue") : s.ar} style={{ gridColumn: at[0], gridRow: at[1] }} aria-hidden />;
}

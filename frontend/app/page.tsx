import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui";

export const metadata: Metadata = {
  title: "Deflow",
  description: "A check before funds are credited, and a proof for every payment and every withdrawal.",
};

// Read at build time like every NEXT_PUBLIC_ value. Empty means no waitlist button at all,
// never a button that leads nowhere.
const WAITLIST_URL = process.env.NEXT_PUBLIC_WAITLIST_URL ?? "";

const FLOW = [
  { title: "Checkout", detail: "Travel Rule data and a wallet signature, before the payer pays." },
  { title: "Contract", detail: "Holds the payment. The processor owns it." },
  { title: "Deflow checks", detail: "The processor's KYT, sanctions lists, split payments." },
  { title: "Decision", detail: "Signed by the processor with its own key." },
];

const PROOFS = [
  {
    name: "Payment Passport",
    scope: "per payment",
    detail: "Checks and their sources, rule and list versions, the officer's decision, signed by the processor.",
  },
  {
    name: "Settlement Manifest",
    scope: "per withdrawal",
    detail: "Which verified deposits make up the amount sent to the off-ramp.",
  },
  {
    name: "Audit Export",
    scope: "per period",
    detail: "Rule versions, calibrations and decision statistics, so the logic can be replayed.",
  },
];

const CONFIGS = [
  {
    name: "With contracts",
    parts: "Contracts, recommendations and the evidence pack",
    detail: "Payments wait in the processor's contract until the processor signs a decision.",
  },
  {
    name: "Without contracts",
    parts: "Recommendations and the evidence pack",
    detail: "Funds move as they do today. Deflow watches deposits and builds the proofs alongside.",
  },
];

/** A mark on the 2px spine, punched out of it with the paper ring — same geometry as the
 *  checkout's screening ledger. */
const SPINE_MARK = "absolute -left-[26px] top-[6px] size-2 shadow-[0_0_0_4px_var(--color-paper)]";

export default function Landing() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-13 shrink-0 items-center justify-between border-b border-rule px-4 md:px-8">
        <Link href="/" className="display text-[15px] font-semibold">
          Deflow
        </Link>
        <Button href="/gateways" variant="quiet">
          Beta
        </Button>
      </header>

      <main className="mx-auto grid w-full max-w-[1200px] flex-1 content-center gap-10 px-6 py-10 md:px-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16 lg:py-6">
        <section className="lg:self-center">
          <h1 className="display max-w-[18ch] text-[30px] font-semibold lg:text-[38px]">
            A check before credit. A proof for every payment and every withdrawal.
          </h1>
          <p className="mt-5 max-w-[52ch] text-[15px]">
            Each incoming payment waits in the processor&rsquo;s contract while Deflow runs the
            checks. The processor signs the decision, the contract executes only what is signed,
            and the proof is ready before an off-ramp, a bank or a regulator asks for it.
          </p>
          <p className="mt-4 max-w-[52ch] text-slate">
            For MiCA-authorised processors and small exchanges that accept USDC or EURC on EVM
            networks.
          </p>

          {WAITLIST_URL && (
            <div className="mt-7">
              <Button href={WAITLIST_URL} external>
                Join the waitlist
              </Button>
              <p className="mt-2 max-w-[44ch] text-[12.5px] text-slate">
                We are pairing with three processors and their off-ramps for a shadow-mode pilot.
              </p>
            </div>
          )}
        </section>

        <section aria-label="How Deflow works" className="min-w-0">
          <ol className="border-l-2 border-ink pl-5">
            {FLOW.map((step) => (
              <li key={step.title} className="relative pb-3">
                <span className={`${SPINE_MARK} rounded-full bg-blue`} />
                <div className="sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-3">
                  <span className="block text-[15px] font-medium">{step.title}</span>
                  <span className="block text-[13px] text-slate">{step.detail}</span>
                </div>
              </li>
            ))}
            <li className="relative">
              <span className={`${SPINE_MARK} bg-ink`} />
              <ul className="grid gap-3 sm:grid-cols-3">
                <Outcome mark="size-3 bg-ink" title="Credit to the pool">
                  The pool takes money only from contracts.
                </Outcome>
                <Outcome mark="size-2.5 rounded-full bg-blue" title="Freeze">
                  Held in the contract, refund blocked. On chain it reads as a check in progress.
                </Outcome>
                <Outcome mark="hatch size-3 border border-ink" title="Refund">
                  Approved by an officer. Never on sanctions.
                </Outcome>
              </ul>
            </li>
          </ol>
          <p className="mt-4 max-w-[72ch] text-[13px] text-slate">
            Keys and money stay with the processor. Deflow signs no transactions and holds no
            funds.
          </p>

          <div className="mt-6 grid gap-8 border-t border-ink pt-5 sm:grid-cols-2">
            <div>
              <h2 className="text-[15px] font-medium">Three proofs</h2>
              <dl className="mt-3 space-y-3">
                {PROOFS.map((p) => (
                  <div key={p.name}>
                    <dt className="text-[13.5px] font-medium">
                      {p.name} <span className="font-normal text-slate">{p.scope}</span>
                    </dt>
                    <dd className="mt-0.5 text-[12.5px] text-slate">{p.detail}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <h2 className="text-[15px] font-medium">Pick a configuration</h2>
              <dl className="mt-3 space-y-3">
                {CONFIGS.map((c) => (
                  <div key={c.name}>
                    <dt className="text-[13.5px] font-medium">{c.name}</dt>
                    <dd className="mt-0.5 text-[12.5px] text-slate">
                      {c.parts}. {c.detail}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 max-w-[46ch] text-[12.5px] text-slate">
                Deflow does not claim funds are clean. It records which checks passed, under which
                rules, who decided and what the contract did.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Outcome({ mark, title, children }: { mark: string; title: string; children: React.ReactNode }) {
  return (
    <li>
      <div className="flex items-center gap-2">
        <span className={`shrink-0 ${mark}`} />
        <span className="text-[13.5px] font-medium">{title}</span>
      </div>
      <p className="mt-0.5 text-[12.5px] text-slate">{children}</p>
    </li>
  );
}

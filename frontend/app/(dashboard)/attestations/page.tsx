import { attestations, byslug, short } from "@/lib/data";

const LEVEL = { 1: "Selfie check", 2: "Passport check" } as const;

export default function AttestationsPage() {
  return (
    <div className="max-w-[880px]">
      <h1 className="display text-[30px] font-semibold">Attestations</h1>
      <p className="mt-2 max-w-[64ch] text-slate">
        What a verified payer looks like to you: a number, a level, an expiry date. No name, no
        country, no document. Wallets under one number belong to one person — and that number is
        yours alone, so nobody can match it against another merchant&rsquo;s.
      </p>

      <div className="mt-10 space-y-9">
        {attestations.map((a) => {
          const revoked = a.wallets.every((w) => w.revoked);
          return (
            <article key={a.nullifier}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-ink pb-2">
                <h2 className="font-mono text-[13px] break-all">{short(a.nullifier, 18, 10)}</h2>
                <span className="text-[12.5px] text-slate">{byslug(a.gateway).name}</span>
              </div>

              {a.note && <p className="mt-2.5 text-[13px] text-slate">{a.note}</p>}

              <ul className={`mt-3 border-l-2 pl-4 ${revoked ? "hatch border-slate" : "border-blue"}`}>
                {a.wallets.map((w) => (
                  <li
                    key={w.address}
                    className="ml-2 grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-0.5 bg-paper py-2 sm:grid-cols-[1fr_140px_150px]"
                  >
                    <span className={`font-mono text-[12.5px] ${w.revoked ? "text-slate line-through" : ""}`}>
                      {short(w.address, 12, 8)}
                    </span>
                    <span className={`text-[13px] ${w.revoked ? "text-slate" : ""}`}>{LEVEL[w.level]}</span>
                    <span className="text-[12.5px] text-slate">
                      {w.revoked ? "Revoked" : `Expires ${w.expires}`}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </div>
  );
}

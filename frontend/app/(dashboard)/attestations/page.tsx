import { attestations, byslug, short } from "@/lib/data";

const LEVEL = { 1: "Selfie check", 2: "Passport check" } as const;

export default function AttestationsPage() {
  return (
    <div className="max-w-[880px]">
      <h1 className="display text-[30px] font-semibold">Attestations</h1>
      <p className="mt-2 max-w-[64ch] text-slate">
        This is everything you learn about a verified payer: a number, a level, an expiry date.
        Wallets sharing a number are one person. The number is yours alone, so no other merchant
        can match it against theirs.
      </p>

      {attestations.length === 0 && (
        <div className="mt-10 max-w-[52ch]">
          <p className="text-[15px]">No attestations yet.</p>
          <p className="mt-1 text-slate">
            A row appears here the first time a payer completes an identity check on one of your
            gateways. Gateways set to screening only never create any.
          </p>
        </div>
      )}

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

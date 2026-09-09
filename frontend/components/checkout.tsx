"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BaseError,
  UserRejectedRequestError,
  decodeEventLog,
  getAbiItem,
  type Address,
  type Hex,
} from "viem";
import { parseAmount, parseGate, toUnits } from "@/lib/checkout-link";
import { nextStep, requiredLevel } from "@/lib/checkout-state";
import { remaining } from "@/lib/spend";
import {
  FACTORY_DEPLOY_BLOCK,
  REGISTRY,
  TOKENS,
  baseSepolia,
  connectWallet,
  hasInjectedWallet,
  publicClient,
  walletClient,
} from "@/lib/chain";
import { loadGateway, type OnChainGateway } from "@/lib/gateways";
import { PAYMENT_STATUS, gatewayAbi, type PaymentStatus } from "@/lib/abi/gateway";
import { erc20Abi } from "@/lib/abi/erc20";
import { registryAbi } from "@/lib/abi/registry";
import { SYMBOL, money, policySentence, short } from "@/lib/data";
import { toContractPolicy } from "@/lib/policy";
import { POLL_EVERY_MS } from "@/lib/verify";
import { ErrorNote } from "@/components/ui";
import { VerifyStep } from "@/components/verify-step";

const ZERO32 = `0x${"0".repeat(64)}` as Hex;
const PAYMENT_SETTLED = getAbiItem({ abi: gatewayAbi, name: "PaymentSettled" });

type Busy = "connect" | "approve" | "pay" | "reclaim" | null;

/** What payments(id) says. `units` comes from the chain, so it survives a reload. */
type Payment = { status: PaymentStatus; openedAt: bigint; units: bigint };

/** waitForTransactionReceipt resolves on a mined revert rather than throwing, so
 *  every write has to look. The hash goes in the message: the payer can check it. */
const reverted = (hash: Hex) =>
  new Error(`The transaction was rejected on chain. Nothing was sent. Transaction ${hash}`);

/** Everything the payer's wallet contributes. `null` means "not read yet". */
type WalletReads = {
  /** The level `verified` was read at. A read is stale the moment the amount
   *  crosses the policy threshold and asks for a different one. */
  level: number;
  allowance: bigint;
  verified: boolean;
  spend: { windowStart: bigint; amount: bigint } | null;
};

type Load =
  | { kind: "loading" }
  | { kind: "ok"; gateway: OnChainGateway }
  | { kind: "missing" }
  | { kind: "unreachable" };

/** A rejected signature is a decision, not a failure. viem wraps the cause, so walk it. */
const rejected = (e: unknown) =>
  e instanceof BaseError
    ? Boolean(e.walk((x) => x instanceof UserRejectedRequestError))
    : e instanceof UserRejectedRequestError;

const message = (e: unknown) =>
  e instanceof BaseError ? e.shortMessage : e instanceof Error ? e.message : String(e);

export function Checkout() {
  const params = useSearchParams();
  const gate = parseGate(params.get("gate"));
  const fromLink = parseAmount(params.get("amount"));

  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [amount, setAmount] = useState(fromLink);
  const [locked, setLocked] = useState(fromLink !== "");

  const [account, setAccount] = useState<Address | null>(null);
  const [reads, setReads] = useState<WalletReads | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  // VerifyStep asks on every tick of its own clock; the read behind `refresh` is a
  // multicall, so it gets its own floor rather than trusting the caller's cadence.
  const lastPoll = useRef(0);
  const pollVerification = useCallback(() => {
    const now = Date.now();
    if (now - lastPoll.current < POLL_EVERY_MS) return;
    lastPoll.current = now;
    setRefresh((n) => n + 1);
  }, []);

  const [busy, setBusy] = useState<Busy>(null);
  // True while VerifyStep has a live widget session open — an iframe a reload or an
  // amount edit would tear out mid-capture. Reported by VerifyStep from an effect.
  const [verifyBusy, setVerifyBusy] = useState(false);
  // Where the message belongs on screen: a reclaim failure shown at the top of the
  // page is a failure the payer never sees.
  const [error, setError] = useState<{ where: "action" | "reclaim"; text: string } | null>(null);

  /** Set the moment pay() leaves the wallet, before the receipt is read. Once this is
   *  set the Pay button never comes back: the money may already have moved. `outcome`
   *  is what we know about it — a mined revert is certain, anything else is not. */
  const [broadcast, setBroadcast] = useState<{ hash: Hex; outcome: "unknown" | "reverted" } | null>(null);

  // The id is kept in the query string, so a reload during screening still finds the
  // payment — the property the payments(id) polling design was chosen for.
  const [paid, setPaid] = useState<{ id: Hex; openedAt: bigint | null } | null>(() => {
    const id = params.get("payment");
    return id && /^0x[0-9a-fA-F]{64}$/.test(id) ? { id: id as Hex, openedAt: null } : null;
  });
  const [payment, setPayment] = useState<Payment | null>(null);
  const [pollFails, setPollFails] = useState(0);
  /** Refunded means two different things. Saying the wrong one accuses the payer. */
  const [refundCause, setRefundCause] = useState<"screening" | "reclaim" | "unknown">("unknown");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const g = load.kind === "ok" ? load.gateway : null;
  const units = toUnits(amount);
  const level = g && units !== null ? requiredLevel(g.policy, units) : 0;

  useEffect(() => {
    if (!gate) return;
    let alive = true;
    loadGateway(gate).then((r) => {
      if (!alive) return;
      // Three answers, not two: an unreachable chain must never be reported as a
      // gateway that does not exist.
      setLoad(r.ok ? { kind: "ok", gateway: r.gateway } : r.missing ? { kind: "missing" } : { kind: "unreachable" });
    });
    return () => {
      alive = false;
    };
  }, [gate]);

  // Everything the payer's wallet contributes, in one batch. Re-runs when the
  // amount crosses the policy threshold, because that changes the level asked for.
  useEffect(() => {
    if (!g || !account) return;
    let alive = true;
    (async () => {
      try {
        const [allowance, verified, nullifier] = await publicClient.multicall({
          contracts: [
            { address: TOKENS[g.token], abi: erc20Abi, functionName: "allowance", args: [account, g.address] },
            { address: REGISTRY, abi: registryAbi, functionName: "isValid", args: [g.address, account, level] },
            { address: REGISTRY, abi: registryAbi, functionName: "nullifierOf", args: [g.address, account] },
          ],
          allowFailure: false,
        });
        // spent is keyed by nullifier; with no attestation there is no counter.
        const s =
          nullifier === ZERO32
            ? null
            : await publicClient.readContract({
                address: g.address,
                abi: gatewayAbi,
                functionName: "spent",
                args: [nullifier],
              });
        if (!alive) return;
        setReadError(null);
        setReads({ level, allowance, verified, spend: s ? { windowStart: s[0], amount: s[1] } : null });
      } catch (e) {
        if (alive) setReadError(message(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [g, account, level, refresh]);

  const done = payment?.status === "settled" || payment?.status === "refunded";

  // The verdict and the reclaim deadline both live in payments(id), and unlike an
  // event subscription that read survives a reload.
  useEffect(() => {
    if (!g || !paid || done) return;
    let alive = true;
    const read = async () => {
      try {
        const p = await publicClient.readContract({
          address: g.address,
          abi: gatewayAbi,
          functionName: "payments",
          args: [paid.id],
        });
        if (!alive) return;
        const status = PAYMENT_STATUS[Number(p[3])] ?? "none";
        setPollFails(0);
        setPayment({ status, openedAt: p[1], units: p[4] });
      } catch {
        // A blip after a verdict tells us nothing new, but a run of them before the
        // first read would otherwise leave the payer watching a spinner forever.
        if (alive) setPollFails((n) => n + 1);
      }
    };
    read();
    const t = setInterval(read, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [g, paid, done]);

  // reclaim() sets Refunded and emits nothing (MerchantGateway.sol:109); only
  // _processReport emits PaymentSettled. So a Refunded payment carrying no such log
  // was taken back by the payer, and calling that a compliance rejection is a lie —
  // including after a reload, where a local flag would be gone.
  //
  // This lives in its own effect on purpose. Run inside the poll it would lose a race
  // with its own setPayment: that flips `done`, React tears the poll effect down, and
  // the cleanup marks the in-flight request stale before it ever resolves.
  const needsCause = payment?.status === "refunded" && refundCause === "unknown";

  useEffect(() => {
    // FACTORY_DEPLOY_BLOCK is the only floor we can trust — no gateway predates the
    // factory — and it falls back to 0n when unset, which many providers reject
    // outright. No trustworthy floor means no scan, and no scan means "unknown".
    if (!g || !paid || !needsCause || FACTORY_DEPLOY_BLOCK === 0n) return;
    let alive = true;
    publicClient
      .getLogs({
        address: g.address,
        event: PAYMENT_SETTLED,
        args: { id: paid.id },
        fromBlock: FACTORY_DEPLOY_BLOCK,
        toBlock: "latest",
      })
      .then((logs) => {
        if (alive) setRefundCause(logs.length > 0 ? "screening" : "reclaim");
      })
      .catch(() => {
        // Unknown stays unknown. The screen says less rather than something untrue.
      });
    return () => {
      alive = false;
    };
  }, [g, paid, needsCause]);

  // openedAt from the chain when we have it, from the local clock at pay time when we
  // do not: the reclaim button must be reachable even when the poll is failing.
  const openedAt = payment?.openedAt ?? paid?.openedAt ?? null;
  const showReclaim =
    paid !== null && openedAt !== null && !done && payment?.status !== "none";

  useEffect(() => {
    if (!showReclaim) return;
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [showReclaim]);

  if (!gate)
    return (
      <Dead
        heading="This payment link is broken"
        body="The link does not name a gateway we can read. Ask the merchant for a new one."
      />
    );
  if (load.kind === "missing")
    return (
      <Dead
        heading="There is no gateway at this address"
        body="Nothing has been sent. Ask the merchant for a new link."
      />
    );
  if (load.kind === "unreachable")
    return (
      <Dead
        heading="We could not reach the chain"
        body="Nothing has been sent. Reload to try again."
      />
    );
  if (!g) return null;

  const fresh = reads && reads.level === level ? reads : null;

  const step = fresh
    ? nextStep({
        policy: g.policy,
        amount: units,
        allowance: fresh.allowance,
        verified: fresh.verified,
        connected: true,
      })
    : null;

  // openedAt is a bigint from the ABI, timeoutSeconds a number: both into Number space.
  const left = openedAt !== null ? Math.max(0, Number(openedAt) + g.timeoutSeconds - now) : 0;

  // remaining() wants base units; Policy.threshold is human units.
  const limit =
    level > 0 && fresh?.spend
      ? remaining(
          fresh.spend,
          toContractPolicy(g.policy).threshold,
          BigInt(Math.floor(Date.now() / 1000)),
        )
      : null;

  async function write(kind: "approve" | "pay" | "reclaim", run: (w: ReturnType<typeof walletClient>, a: Address) => Promise<void>) {
    if (!account) return;
    setError(null);
    setBusy(kind);
    try {
      await run(walletClient(account), account);
    } catch (e) {
      // A rejected signature returns quietly to the previous step.
      if (!rejected(e)) setError({ where: kind === "reclaim" ? "reclaim" : "action", text: message(e) });
    } finally {
      setBusy(null);
    }
  }

  const connect = async () => {
    setError(null);
    setBusy("connect");
    try {
      setAccount(await connectWallet());
    } catch (e) {
      if (!rejected(e)) setError({ where: "action", text: message(e) });
    } finally {
      setBusy(null);
    }
  };

  const approve = () =>
    write("approve", async (w, a) => {
      if (units === null) return;
      const hash = await w.writeContract({
        address: TOKENS[g.token],
        abi: erc20Abi,
        functionName: "approve",
        args: [g.address, units],
        account: a,
        chain: baseSepolia,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") throw reverted(hash);
      setRefresh((n) => n + 1);
    });

  const pay = () =>
    write("pay", async (w, a) => {
      if (units === null) return;
      const hash = await w.writeContract({
        address: g.address,
        abi: gatewayAbi,
        functionName: "pay",
        args: [units],
        account: a,
        chain: baseSepolia,
      });
      setBroadcast({ hash, outcome: "unknown" });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      // A mined revert resolves rather than throwing. Reverts here are ordinary:
      // too little token, CumulativeThreshold, a lost race on verification.
      if (receipt.status === "reverted") {
        setBroadcast({ hash, outcome: "reverted" });
        throw reverted(hash);
      }
      // pay() returns the id, but a return value is not available to an external
      // caller. Read it back out of the receipt.
      const opened = receipt.logs
        .filter((l) => l.address.toLowerCase() === g.address.toLowerCase())
        .map((l) => {
          try {
            return decodeEventLog({ abi: gatewayAbi, ...l, strict: false });
          } catch {
            return null;
          }
        })
        .find((e) => e?.eventName === "PaymentOpened");
      if (!opened) throw new Error("The payment went through but we could not read its id");
      const id = (opened.args as { id: Hex }).id;
      setPaid({ id, openedAt: BigInt(Math.floor(Date.now() / 1000)) });
      const url = new URL(window.location.href);
      url.searchParams.set("payment", id);
      window.history.replaceState(null, "", url);
      setRefresh((n) => n + 1);
    });

  const reclaim = () =>
    write("reclaim", async (w, a) => {
      if (!paid) return;
      const hash = await w.writeContract({
        address: g.address,
        abi: gatewayAbi,
        functionName: "reclaim",
        args: [paid.id],
        account: a,
        chain: baseSepolia,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") throw reverted(hash);
      setRefundCause("reclaim");
    });

  const pollError = pollFails >= 3 && payment === null;
  const settling = paid !== null && payment === null && !pollError;
  /** Broadcast, then something went wrong before we had an id. */
  const stranded = paid === null && busy === null ? broadcast : null;
  const value = payment ? Number(payment.units) / 1e6 : 0;

  const verdict =
    payment === null || payment.status === "none"
      ? null
      : payment.status === "pending"
        ? {
            state: "running" as const,
            detail: "About a minute. If it does not pass, your money comes back on its own.",
          }
        : payment.status === "settled"
          ? { state: "clear" as const, detail: "Cleared the merchant's risk ceiling." }
          : {
              state: "stopped" as const,
              detail:
                refundCause === "reclaim"
                  ? "No verdict arrived. You took your money back before one did."
                  : refundCause === "screening"
                    ? "Above this merchant's risk ceiling."
                    : "No verdict was recorded against this payment.",
            };

  return (
    <div className="mx-auto max-w-[560px] px-6 pt-14 pb-24">
      <header>
        <h1 className="display text-[26px] font-semibold">Pay {short(g.address, 6, 4)}</h1>
        <p className="mt-1.5 text-[13px] text-slate">
          Base Sepolia, in {g.token}. Your money is held by the gateway contract, never by the
          merchant and never by us.
        </p>
      </header>

      {/* Rule 1: requirements are on screen before the amount is typed. */}
      <section className="mt-7 border border-rule bg-wash p-4">
        <h2 className="text-[13.5px] font-medium">What this merchant asks for</h2>
        <p className="mt-2 text-[13px]">{policySentence(g.policy, g.token)}</p>
        <p className="mt-3 border-t border-rule pt-3 text-[12.5px] text-slate">
          Your documents go to the verification provider and nowhere else. This merchant never sees
          them, and neither do we.
        </p>
      </section>

      <section className="mt-8">
        <label htmlFor="amount" className="text-[13.5px] font-medium">Amount</label>
        <div className="mt-2 flex h-14 items-center rounded-xs border border-rule focus-within:border-ink">
          <span className="pl-4 pr-1 text-[22px] text-slate">{SYMBOL[g.token]}</span>
          <input
            id="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            inputMode="decimal"
            readOnly={locked}
            disabled={
              busy !== null || broadcast !== null || (paid !== null && payment?.status !== "none") || verifyBusy
            }
            className="tnum h-full w-full bg-transparent pr-2 text-[22px] outline-none disabled:text-slate"
          />
          <span className="pr-4 text-[13px] text-slate">{g.token}</span>
        </div>

        {verifyBusy && (
          <p className="mt-2.5 text-[12.5px] text-slate">
            The amount cannot change while a check is open.
          </p>
        )}

        {locked && broadcast === null && (paid === null || payment?.status === "none") && (
          <button
            onClick={() => setLocked(false)}
            className="mt-2.5 text-[13px] text-blue underline underline-offset-2 hover:text-blue-deep"
          >
            Pay a different amount
          </button>
        )}

        {/* Rule 2: the daily allowance is shown only once there is a number to show. */}
        {limit && (
          <p className="mt-2.5 text-[12.5px] text-slate">
            <span className="tnum">{money(Number(limit.left) / 1e6, g.token)}</span> left today
            before a {g.policy.levelAbove === 2 ? "passport" : "selfie"} check is needed. Resets at{" "}
            {new Date(Number(limit.resetsAt) * 1000).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            .
          </p>
        )}
      </section>

      <section className="mt-8 space-y-3">
        {error?.where === "action" && stranded === null && (
          <ErrorNote onRetry={() => setError(null)} retryLabel="Dismiss">{error.text}</ErrorNote>
        )}

        {busy === "approve" && <Waiting label="Confirming the approval" detail="One block on Base." />}
        {busy === "pay" && <Waiting label="Confirming the payment" detail="One block on Base." />}
        {settling && busy === null && (
          <Waiting label="Reading the payment" detail="One moment." />
        )}

        {/* Once a payment transaction is broadcast the Pay button must not come back. */}
        {stranded && (
          <ErrorNote>
            {stranded.outcome === "reverted"
              ? "The transaction was rejected on chain. No money left your wallet. Reload the page to try again."
              : "The payment transaction was sent and we could not read what happened to it, so we cannot tell you whether the money moved. Check it on an explorer before paying again."}{" "}
            Transaction {stranded.hash}.
          </ErrorNote>
        )}

        {pollError && (
          <ErrorNote onRetry={() => setPollFails(0)} retryLabel="Try reading it again">
            We could not read this payment back from the chain, so we cannot tell you where it
            stands. Your money is in the gateway contract and only a verdict or you can move it.
            Reference {broadcast?.hash ?? paid?.id}.
          </ErrorNote>
        )}

        {payment?.status === "none" && (
          <Note>
            We cannot find this payment on this gateway. Check the link, or the gateway it names.
          </Note>
        )}

        {/* A stale or foreign ?payment= id answers to nothing on chain. Let the payer
            pay rather than stranding them, but never drop the id: a lagging RPC node
            can read a real payment as "none" for a block or two, and the id is the
            only route back to the reclaim button. */}
        {busy === null && broadcast === null && (paid === null || payment?.status === "none") && (
          <>
            {!account && !hasInjectedWallet() && (
              <Note>
                This page needs a browser wallet, and there is not one here. Open the link in a
                wallet browser or install one.
              </Note>
            )}

            {!account && hasInjectedWallet() && <Action onClick={connect}>Connect wallet</Action>}

            {account && readError && (
              <ErrorNote onRetry={() => setRefresh((n) => n + 1)}>
                We could not read your wallet against this gateway. Nothing has been sent. {readError}
              </ErrorNote>
            )}

            {account && !readError && !fresh && (
              <Waiting label="Reading your wallet" detail="One moment." />
            )}

            {step?.kind === "amount" && <Note>Type an amount to pay.</Note>}

            {step?.kind === "unverified" && step.level === 2 && account && (
              <VerifyStep
                gate={g.address}
                wallet={account}
                level={2}
                verified={fresh?.verified ?? false}
                onPoll={pollVerification}
                onBusyChange={setVerifyBusy}
              />
            )}

            {step?.kind === "unverified" && step.level === 1 && (
              <Note>
                This merchant asks payers for a selfie check before paying this amount. That part is
                not built yet — access to World ID Selfie Check has not been granted. Nothing has
                been sent, and your wallet has not been charged.
              </Note>
            )}

            {step?.kind === "approve" && (
              <>
                <Action onClick={approve}>Allow {g.token} to be spent</Action>
                <Note>
                  This allows {SYMBOL[g.token]}
                  {amount} and no more, and the payment spends all of it. A later payment asks for
                  its own approval.
                </Note>
              </>
            )}

            {step?.kind === "pay" && (
              <>
                <Action onClick={pay}>
                  Pay {SYMBOL[g.token]}
                  {amount}
                </Action>
                <Note>Your money is held by the gateway contract until screening finishes.</Note>
              </>
            )}
          </>
        )}
      </section>

      {(verdict || showReclaim) && (
        <section className="mt-10">
          <h2 className="text-[15px] font-medium">Screening</h2>

          {verdict && (
            <ol className="mt-4 border-l-2 border-ink pl-5">
              <Check title="Where the funds came from" state={verdict.state} detail={verdict.detail} />
            </ol>
          )}

          {showReclaim && (
            <div className="mt-6 flex items-center justify-between gap-4 border-t border-rule pt-4">
              <p className="max-w-[38ch] text-[12.5px] text-slate">
                If no verdict arrives, take your money back yourself. Nobody can hold it.
              </p>
              <button
                disabled={left > 0 || busy === "reclaim"}
                onClick={reclaim}
                className="h-9 shrink-0 rounded-xs border border-rule px-3.5 text-[13px] transition-colors enabled:hover:border-ink disabled:text-slate"
              >
                {left > 0
                  ? `Take it back in ${String(Math.floor(left / 60))}:${String(left % 60).padStart(2, "0")}`
                  : "Take my money back"}
              </button>
            </div>
          )}

          {error?.where === "reclaim" && (
            <div className="mt-3">
              <ErrorNote onRetry={() => setError(null)} retryLabel="Dismiss">{error.text}</ErrorNote>
            </div>
          )}

          {done && payment && (
            <div
              className={`mt-7 border-l-2 pl-5 ${payment.status === "settled" ? "border-blue" : "hatch border-ink"}`}
            >
              <div className="bg-paper">
                <h3 className="display text-[21px] font-semibold">
                  {payment.status === "settled"
                    ? "Paid"
                    : refundCause === "reclaim"
                      ? "You took it back"
                      : "Returned to your wallet"}
                </h3>
                <p className="mt-1.5 max-w-[46ch] text-[13px] text-slate">
                  {payment.status === "settled"
                    ? `${money(value, g.token)} reached the merchant. Nothing about you reached them.`
                    : refundCause === "reclaim"
                      ? `${money(value, g.token)} is back in your wallet. No verdict arrived, and the merchant was never paid.`
                      : refundCause === "screening"
                        ? `${money(value, g.token)} is back where it started. The merchant was never paid and never learned anything about you.`
                        : `${money(value, g.token)} is back in your wallet. The merchant was never paid.`}
                </p>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Dead({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="mx-auto max-w-[560px] px-6 pt-14 pb-24">
      <h1 className="display text-[26px] font-semibold">{heading}</h1>
      <p className="mt-2 max-w-[46ch] text-[13px] text-slate">{body}</p>
    </div>
  );
}

function Action({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-12 w-full rounded-xs bg-blue text-[14.5px] font-medium text-white transition-colors hover:bg-blue-deep"
    >
      {children}
    </button>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-2.5 text-[12.5px] text-slate">{children}</p>;
}

function Waiting({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex h-12 items-center gap-3 border border-rule px-4">
      <span className="breathe size-2 shrink-0 rounded-full bg-blue" />
      <span className="text-[14px]">{label}</span>
      <span className="ml-auto text-[12.5px] text-slate">{detail}</span>
    </div>
  );
}

function Check({
  title,
  state,
  detail,
}: {
  title: string;
  state: "clear" | "running" | "stopped";
  detail: string;
}) {
  const mark =
    state === "running" ? (
      <span className="breathe absolute -left-[26px] top-[7px] size-2 rounded-full bg-blue shadow-[0_0_0_4px_var(--color-paper)]" />
    ) : state === "clear" ? (
      <span className="absolute -left-[26px] top-[7px] size-2 bg-ink shadow-[0_0_0_4px_var(--color-paper)]" />
    ) : (
      <span className="hatch absolute -left-[26px] top-[7px] size-2 border border-ink shadow-[0_0_0_4px_var(--color-paper)]" />
    );

  return (
    <li className="relative pb-6 last:pb-0">
      {mark}
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[15px] font-medium">{title}</span>
        <span className={`text-[13px] ${state === "running" ? "text-blue" : "text-slate"}`}>
          {state === "clear" ? "Clear" : state === "running" ? "Screening" : "Not cleared"}
        </span>
      </div>
      <p className="mt-1 max-w-[44ch] text-[13px] text-slate">{detail}</p>
    </li>
  );
}

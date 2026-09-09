"use client";

import QRCode from "qrcode";
import { useEffect, useId, useState } from "react";
import { buildCheckoutUrl, parseAmount } from "@/lib/checkout-link";
import { SYMBOL, type Token } from "@/lib/data";
import { CopyLink } from "./copy-link";

export function InvoiceLink({
  gate,
  token,
  origin,
}: {
  gate: string;
  token: Token;
  origin: string;
}) {
  const id = useId();
  const [amount, setAmount] = useState("");
  const [qr, setQr] = useState("");

  const url = buildCheckoutUrl(origin, gate, amount);
  // An amount the payer would have to retype is not in the link, and saying so
  // beats letting the merchant discover it after sending the link out.
  const dropped = amount.trim() !== "" && parseAmount(amount) === "";

  useEffect(() => {
    let live = true;
    QRCode.toString(url, { type: "svg", margin: 0, color: { dark: "#05070E", light: "#0000" } })
      .then((svg) => live && setQr(svg))
      .catch(() => live && setQr(""));
    return () => {
      live = false;
    };
  }, [url]);

  return (
    <div className="mt-4 flex flex-col gap-6 bg-wash p-5 sm:flex-row">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="text-[13px] font-medium">
          Ask for an amount
        </label>
        <div className="mt-2 flex h-11 max-w-[220px] items-center border border-rule bg-white focus-within:border-ink">
          <span className="pl-3 pr-1 text-[15px] text-slate">{SYMBOL[token]}</span>
          <input
            id={id}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="Any amount"
            className="tnum h-full w-full bg-transparent pr-2 text-[15px] outline-none"
          />
          <span className="pr-3 text-[12.5px] text-slate">{token}</span>
        </div>
        <p className="mt-2 min-h-[18px] text-[12.5px] text-slate">
          {dropped
            ? "That is not an amount this token can carry, so the link asks for any amount."
            : "Leave it empty and the payer chooses."}
        </p>

        <div className="mt-4">
          <CopyLink url={url} />
        </div>
      </div>

      <div
        role="img"
        aria-label={`QR code for this payment link`}
        className="size-[104px] shrink-0 self-start [&>svg]:size-full"
        dangerouslySetInnerHTML={{ __html: qr }}
      />
    </div>
  );
}

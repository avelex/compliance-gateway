import { describe, expect, it } from "vitest";
import { buildCheckoutUrl, parseAmount, parseGate, toUnits } from "./checkout-link";

const GATE = "0x2c91ae7f04B8Dd635A0c1E9f27b4A5d8e310c64B";

describe("parseGate", () => {
  it("accepts a checksummed address", () => {
    expect(parseGate(GATE)).toBe(GATE);
  });

  it("accepts a lowercase address and checksums it", () => {
    expect(parseGate(GATE.toLowerCase())).toBe(GATE);
  });

  it("rejects a missing param", () => {
    expect(parseGate(null)).toBeNull();
    expect(parseGate(undefined)).toBeNull();
    expect(parseGate("")).toBeNull();
  });

  it("rejects anything that is not an address", () => {
    expect(parseGate("0x123")).toBeNull();
    expect(parseGate("not-an-address")).toBeNull();
    expect(parseGate(`${GATE}00`)).toBeNull();
  });
});

describe("parseAmount", () => {
  it("keeps a whole number", () => {
    expect(parseAmount("250")).toBe("250");
  });

  it("keeps up to six decimal places", () => {
    expect(parseAmount("250.123456")).toBe("250.123456");
  });

  it("trims surrounding whitespace", () => {
    expect(parseAmount("  250 ")).toBe("250");
  });

  it("rejects a seventh decimal place, because the token has six", () => {
    expect(parseAmount("250.1234567")).toBe("");
  });

  it("rejects zero, which pay() reverts on", () => {
    expect(parseAmount("0")).toBe("");
    expect(parseAmount("0.000000")).toBe("");
  });

  it("rejects letters, two dots, and negatives", () => {
    expect(parseAmount("abc")).toBe("");
    expect(parseAmount("1.2.3")).toBe("");
    expect(parseAmount("-5")).toBe("");
  });

  it("rejects a missing param", () => {
    expect(parseAmount(null)).toBe("");
    expect(parseAmount(undefined)).toBe("");
  });
});

describe("toUnits", () => {
  it("scales to six decimals", () => {
    expect(toUnits("250")).toBe(250_000_000n);
    expect(toUnits("0.5")).toBe(500_000n);
    expect(toUnits("250.123456")).toBe(250_123_456n);
  });

  it("returns null for anything parseAmount rejects", () => {
    expect(toUnits("abc")).toBeNull();
    expect(toUnits("0")).toBeNull();
    expect(toUnits("")).toBeNull();
  });
});

describe("buildCheckoutUrl", () => {
  it("carries the gate", () => {
    expect(buildCheckoutUrl("https://pay.example", GATE, "")).toBe(
      `https://pay.example/checkout?gate=${GATE}`,
    );
  });

  it("carries the amount when there is one", () => {
    expect(buildCheckoutUrl("https://pay.example", GATE, "250")).toBe(
      `https://pay.example/checkout?gate=${GATE}&amount=250`,
    );
  });

  it("omits an amount the payer would have to retype anyway", () => {
    expect(buildCheckoutUrl("https://pay.example", GATE, "0")).toBe(
      `https://pay.example/checkout?gate=${GATE}`,
    );
    expect(buildCheckoutUrl("https://pay.example", GATE, "abc")).toBe(
      `https://pay.example/checkout?gate=${GATE}`,
    );
  });

  it("does not double the slash on an origin that has one", () => {
    expect(buildCheckoutUrl("https://pay.example/", GATE, "")).toBe(
      `https://pay.example/checkout?gate=${GATE}`,
    );
  });

  it("round-trips through the parsers", () => {
    const url = new URL(buildCheckoutUrl("https://pay.example", GATE, "250"));
    expect(parseGate(url.searchParams.get("gate"))).toBe(GATE);
    expect(parseAmount(url.searchParams.get("amount"))).toBe("250");
  });
});

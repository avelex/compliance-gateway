import { describe, expect, it } from "vitest";
import { decodeEventLog, decodeFunctionResult, encodeFunctionData } from "viem";
import { gatewayAbi } from "./gateway";
import { erc20Abi } from "./erc20";
import { registryAbi } from "./registry";

const GATE = "0x2c91ae7f04B8Dd635A0c1E9f27b4A5d8e310c64B" as const;
const PAYER = "0x71Ba904Ce7f2018d6a35BC4907ef12d8a04C361B" as const;
const ID = "0x4f1a000000000000000000000000000000000000000000000000000000000000" as const;

describe("gatewayAbi", () => {
  it("encodes pay(uint256) with the selector the contract exposes", () => {
    // keccak256("pay(uint256)") = 0xc290d691... → selector 0xc290d691
    expect(encodeFunctionData({ abi: gatewayAbi, functionName: "pay", args: [250_000_000n] }))
      .toBe(`0xc290d691${(250_000_000).toString(16).padStart(64, "0")}`);
  });

  it("encodes reclaim(bytes32)", () => {
    expect(encodeFunctionData({ abi: gatewayAbi, functionName: "reclaim", args: [ID] }))
      .toMatch(/^0x/);
  });

  it("decodes the payments getter in the struct's declaration order", () => {
    // payer, openedAt, maxRisk, status(Pending=1), amount
    const data = ("0x" +
      PAYER.slice(2).padStart(64, "0") +
      (0x68bd5f00).toString(16).padStart(64, "0") +
      (50).toString(16).padStart(64, "0") +
      (1).toString(16).padStart(64, "0") +
      (250_000_000).toString(16).padStart(64, "0")) as `0x${string}`;

    const out = decodeFunctionResult({ abi: gatewayAbi, functionName: "payments", data });
    expect(out).toEqual([PAYER, 0x68bd5f00n, 50, 1, 250_000_000n]);
  });

  it("decodes the spent getter as (windowStart, amount)", () => {
    const data = ("0x" +
      (0x68bd5f00).toString(16).padStart(64, "0") +
      (250_000_000).toString(16).padStart(64, "0")) as `0x${string}`;

    const out = decodeFunctionResult({ abi: gatewayAbi, functionName: "spent", data });
    expect(out).toEqual([0x68bd5f00n, 250_000_000n]);
  });

  it("decodes a PaymentOpened log, which is the only way to learn the payment id", () => {
    const event = gatewayAbi.find(
      (e) => e.type === "event" && e.name === "PaymentOpened",
    );
    expect(event).toBeDefined();

    const decoded = decodeEventLog({
      abi: gatewayAbi,
      eventName: "PaymentOpened",
      topics: [
        // keccak256("PaymentOpened(bytes32,address,uint256)")
        "0xf8d5c6a26af0e135691d01a9276709a34926ae18af7db8ad1149a6b1f9e1b86d",
        ID,
        `0x${PAYER.slice(2).toLowerCase().padStart(64, "0")}`,
      ] as [`0x${string}`, `0x${string}`, `0x${string}`],
      data: `0x${(250_000_000).toString(16).padStart(64, "0")}`,
      strict: false,
    });
    expect(decoded.args).toMatchObject({ id: ID, amount: 250_000_000n });
  });

  it("keeps the reads the dashboard already relies on", () => {
    for (const name of ["owner", "token", "payoutTo", "policy", "setPolicy", "TIMEOUT"]) {
      expect(gatewayAbi.some((e) => "name" in e && e.name === name)).toBe(true);
    }
  });
});

describe("erc20Abi", () => {
  it("encodes allowance and approve", () => {
    expect(
      encodeFunctionData({ abi: erc20Abi, functionName: "allowance", args: [PAYER, GATE] }),
    ).toMatch(/^0x/);
    expect(
      encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [GATE, 1n] }),
    ).toMatch(/^0x/);
  });

  it("keeps balanceOf", () => {
    expect(erc20Abi.some((e) => e.name === "balanceOf")).toBe(true);
  });
});

describe("registryAbi", () => {
  it("encodes isValid and nullifierOf", () => {
    expect(
      encodeFunctionData({ abi: registryAbi, functionName: "isValid", args: [GATE, PAYER, 1] }),
    ).toMatch(/^0x/);
    expect(
      encodeFunctionData({ abi: registryAbi, functionName: "nullifierOf", args: [GATE, PAYER] }),
    ).toMatch(/^0x/);
  });
});

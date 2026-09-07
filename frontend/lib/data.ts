export type Token = "USDC" | "EURC";
export type Status = "screening" | "settled" | "returned";

export type Policy = {
  levelBelow: 0 | 1 | 2;
  levelAbove: 0 | 1 | 2;
  threshold: number; // token units, 6 decimals
  maxRisk: number;
};

export type Gateway = {
  address: string;
  slug: string;
  name: string;
  token: Token;
  policy: Policy;
  payoutTo: string;
  deployedAt: string;
  deployedBlock: number;
};

export const SYMBOL: Record<Token, string> = { USDC: "$", EURC: "€" };

export const gateways: Gateway[] = [
  {
    address: "0x7a3fD1c48B2eF90aA1c7B5d3E6c0912fA48b7c19",
    slug: "0x7a3f",
    name: "Aperture Store",
    token: "USDC",
    policy: { levelBelow: 0, levelAbove: 0, threshold: 0, maxRisk: 80 },
    payoutTo: "0x9E44aC0b71fD2c8e5B0a3f7C41dE96b2A8517f30",
    deployedAt: "6 Sep 2026, 14:02",
    deployedBlock: 18446291,
  },
  {
    address: "0x2c91Ae7f04B8dD635a0C1e9F27b4A5D8e310C64b",
    slug: "0x2c91",
    name: "Meridian Issuance",
    token: "USDC",
    policy: { levelBelow: 1, levelAbove: 2, threshold: 1000, maxRisk: 50 },
    payoutTo: "0x9E44aC0b71fD2c8e5B0a3f7C41dE96b2A8517f30",
    deployedAt: "5 Sep 2026, 09:47",
    deployedBlock: 18398110,
  },
  {
    address: "0xb84D6cE2790aF5138B4e0d7C6a19F32bD5470E8a",
    slug: "0xb84d",
    name: "Lauriston Legal",
    token: "EURC",
    policy: { levelBelow: 1, levelAbove: 2, threshold: 1000, maxRisk: 50 },
    payoutTo: "0x9E44aC0b71fD2c8e5B0a3f7C41dE96b2A8517f30",
    deployedAt: "5 Sep 2026, 11:15",
    deployedBlock: 18399840,
  },
];

export type Payment = {
  id: string;
  gateway: string; // slug
  time: string;
  payer: string;
  amount: number;
  status: Status;
  note?: string;
};

export const payments: Payment[] = [
  { id: "0x4f1a", gateway: "0x2c91", time: "12:41:07", payer: "0x3D19bC7a5E048f21c9B6027Ae4f5138cD90a7B62", amount: 250, status: "screening" },
  { id: "0x91c7", gateway: "0x7a3f", time: "12:38:52", payer: "0xC0ffee2547aB19d3E8b04F72A61c5d9308bE47a1", amount: 84.5, status: "returned", note: "Funds provenance above risk ceiling" },
  { id: "0xa20d", gateway: "0x2c91", time: "12:33:18", payer: "0x71Ba904cE7f2018D6a35bC4907eF12d8a04C361b", amount: 1450, status: "settled" },
  { id: "0x0e63", gateway: "0xb84d", time: "12:29:44", payer: "0x5f80D2a9B317cE64018aF7d2951bC03e7A46d281", amount: 2100, status: "settled" },
  { id: "0xd8b4", gateway: "0x7a3f", time: "12:21:03", payer: "0x2A97fB1d0Ce8347a5019bD6E2c74f0813aB59d40", amount: 39.99, status: "settled" },
  { id: "0x33fe", gateway: "0x2c91", time: "12:14:55", payer: "0x71Ba904cE7f2018D6a35bC4907eF12d8a04C361b", amount: 620, status: "settled" },
  { id: "0x7cc1", gateway: "0xb84d", time: "11:58:30", payer: "0x8dE4Ba07f19C2035aE7b16D4c0958f2Ab3701Ec9", amount: 480, status: "returned", note: "Funds provenance above risk ceiling" },
  { id: "0x1b09", gateway: "0x7a3f", time: "11:52:12", payer: "0x2A97fB1d0Ce8347a5019bD6E2c74f0813aB59d40", amount: 129, status: "settled" },
];

export type Attestation = {
  nullifier: string;
  gateway: string; // slug
  wallets: { address: string; level: 1 | 2; expires: string; revoked?: boolean }[];
  note?: string;
};

export const attestations: Attestation[] = [
  {
    nullifier: "0x9c41d7f0a83b2e56104cf7d9b2085ea31f6c4d720a95b8e3fd1027cb64a9e5f8",
    gateway: "0x2c91",
    wallets: [
      { address: "0x71Ba904cE7f2018D6a35bC4907eF12d8a04C361b", level: 2, expires: "5 Mar 2027" },
      { address: "0x5f80D2a9B317cE64018aF7d2951bC03e7A46d281", level: 2, expires: "6 Mar 2027" },
    ],
    note: "One document, two wallets. Same person.",
  },
  {
    nullifier: "0x2e70b19d4c86f503a71e0d29bf4c863507ad1e94f2b06c85d3719ea0428cf61d",
    gateway: "0x2c91",
    wallets: [
      { address: "0x8dE4Ba07f19C2035aE7b16D4c0958f2Ab3701Ec9", level: 2, expires: "4 Mar 2027", revoked: true },
      { address: "0xC0ffee2547aB19d3E8b04F72A61c5d9308bE47a1", level: 2, expires: "4 Mar 2027", revoked: true },
    ],
    note: "Revoked by monitoring — both wallets died together.",
  },
  {
    nullifier: "0x51ba39e08d7c246f1039ba5e7c802df614a97b30c5e28f1749d0b6a3ec810527",
    gateway: "0xb84d",
    wallets: [{ address: "0x3D19bC7a5E048f21c9B6027Ae4f5138cD90a7B62", level: 1, expires: "5 Sep 2027" }],
  },
];

export const byslug = (slug: string) => gateways.find((g) => g.slug === slug)!;

export const money = (n: number, t: Token) =>
  `${SYMBOL[t]}${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function policyLine(p: Policy, t: Token) {
  if (p.levelAbove === 0 && p.levelBelow === 0) return "Screening only";
  return `ID above ${money(p.threshold, t)}`;
}

export function policySentence(p: Policy, t: Token) {
  if (p.levelAbove === 0 && p.levelBelow === 0)
    return "Every payment is screened for where the funds came from. Nobody is asked to identify themselves.";
  const below = p.levelBelow === 1 ? "a selfie check" : "a passport check";
  const above = p.levelAbove === 2 ? "a passport check" : "a selfie check";
  return `Under ${money(p.threshold, t)}, payers complete ${below}. At or above it, ${above}.`;
}

export const short = (a: string, head = 6, tail = 4) => `${a.slice(0, head)}…${a.slice(-tail)}`;

export const gatewayAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "token", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "payoutTo", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  {
    type: "function", name: "policy", stateMutability: "view", inputs: [],
    outputs: [
      { name: "levelBelow", type: "uint8" },
      { name: "levelAbove", type: "uint8" },
      { name: "threshold", type: "uint256" },
      { name: "maxRisk", type: "uint8" },
    ],
  },
  {
    type: "function", name: "setPolicy", stateMutability: "nonpayable",
    inputs: [{
      name: "p", type: "tuple",
      components: [
        { name: "levelBelow", type: "uint8" },
        { name: "levelAbove", type: "uint8" },
        { name: "threshold", type: "uint256" },
        { name: "maxRisk", type: "uint8" },
      ],
    }],
    outputs: [],
  },
  { type: "function", name: "TIMEOUT", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint64" }] },
  {
    type: "function", name: "pay", stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [{ name: "id", type: "bytes32" }],
  },
  {
    type: "function", name: "reclaim", stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "bytes32" }], outputs: [],
  },
  {
    // Solidity flattens a public mapping getter into the struct's fields, in
    // declaration order (libs/Merchant.sol). Status: 0 None, 1 Pending, 2 Settled, 3 Refunded.
    type: "function", name: "payments", stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [
      { name: "payer", type: "address" },
      { name: "openedAt", type: "uint64" },
      { name: "maxRisk", type: "uint8" },
      { name: "status", type: "uint8" },
      { name: "amount", type: "uint256" },
    ],
  },
  {
    // Keyed by nullifier, not by wallet.
    type: "function", name: "spent", stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [
      { name: "windowStart", type: "uint64" },
      { name: "amount", type: "uint256" },
    ],
  },
  {
    type: "event", name: "PaymentOpened",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "payer", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event", name: "PaymentSettled",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "ok", type: "bool", indexed: false },
    ],
  },
] as const;

/** libs/Merchant.sol: enum Status { None, Pending, Settled, Refunded }. */
export const PAYMENT_STATUS = ["none", "pending", "settled", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[number];

/** MerchantGateway.TIMEOUT — a Solidity constant, so it is the same for every gateway.
 *  Prefer OnChainGateway.timeoutSeconds where a gateway has actually been read; this is
 *  for screens that show sample payments belonging to no deployed gateway. */
export const GATEWAY_TIMEOUT_SECONDS = 900;

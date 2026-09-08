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
] as const;

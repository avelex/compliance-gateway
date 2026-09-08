export const factoryAbi = [
  {
    type: "function",
    name: "deploy",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "merchConfig",
        type: "tuple",
        components: [
          { name: "merchant", type: "address" },
          { name: "payoutTo", type: "address" },
          { name: "token", type: "address" },
          {
            name: "policy",
            type: "tuple",
            components: [
              { name: "levelBelow", type: "uint8" },
              { name: "levelAbove", type: "uint8" },
              { name: "threshold", type: "uint256" },
              { name: "maxRisk", type: "uint8" },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: "gate", type: "address" }],
  },
  {
    type: "event",
    name: "GatewayDeployed",
    inputs: [{ name: "gate", type: "address", indexed: true }],
  },
] as const;

export const registryAbi = [
  {
    type: "function", name: "isValid", stateMutability: "view",
    inputs: [
      { name: "gate", type: "address" },
      { name: "wallet", type: "address" },
      { name: "minLevel", type: "uint8" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function", name: "nullifierOf", stateMutability: "view",
    inputs: [
      { name: "gate", type: "address" },
      { name: "wallet", type: "address" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

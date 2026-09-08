import type { Address } from "viem";
import { gatewayAbi } from "./abi/gateway";
import { factoryAbi } from "./abi/factory";
import { publicClient, FACTORY, FACTORY_DEPLOY_BLOCK, tokenOf } from "./chain";
import { fromContractPolicy } from "./policy";
import type { Policy, Token } from "./data";

export type OnChainGateway = {
  address: Address;
  token: Token;
  policy: Policy;
  payoutTo: Address;
};

export async function readGateway(address: Address): Promise<OnChainGateway> {
  const c = { address, abi: gatewayAbi } as const;
  const [token, payoutTo, policy] = await publicClient.multicall({
    contracts: [
      { ...c, functionName: "token" },
      { ...c, functionName: "payoutTo" },
      { ...c, functionName: "policy" },
    ],
    allowFailure: false,
  });
  const symbol = tokenOf(token as string);
  if (!symbol) throw new Error(`Gateway ${address} settles an unknown token ${token}`);
  return {
    address,
    token: symbol,
    payoutTo: payoutTo as Address,
    policy: fromContractPolicy({
      levelBelow: policy[0] as number,
      levelAbove: policy[1] as number,
      threshold: policy[2] as bigint,
      maxRisk: policy[3] as number,
    }),
  };
}

export async function listGateways(owner: Address): Promise<OnChainGateway[]> {
  if (!FACTORY) throw new Error("NEXT_PUBLIC_FACTORY_ADDRESS is not set");

  const logs = await publicClient.getLogs({
    address: FACTORY,
    event: factoryAbi[1],
    fromBlock: FACTORY_DEPLOY_BLOCK,
    toBlock: "latest",
  });
  const addresses = [...new Set(logs.map((l) => l.args.gate as Address))];
  if (addresses.length === 0) return [];

  const owners = await publicClient.multicall({
    contracts: addresses.map((address) => ({ address, abi: gatewayAbi, functionName: "owner" as const })),
  });

  const mine = addresses.filter(
    (_, i) =>
      owners[i].status === "success" &&
      (owners[i].result as string).toLowerCase() === owner.toLowerCase(),
  );
  // GatewayFactory.deploy is permissionless and takes `merchant` from the caller's
  // struct, so anyone can deploy a gateway naming someone else as owner. One such
  // gateway with a junk token address makes readGateway throw; with Promise.all that
  // would wedge the victim's whole list forever, so an unreadable gateway is skipped.
  const read = await Promise.allSettled(mine.map(readGateway));
  return read.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}

/** Distinguishes "there is no such gateway" from "we could not read it". The gateway
 *  screens must not tell a merchant their gateway does not exist because an RPC blipped
 *  (frontend/PRODUCT.md principle 3). */
export async function loadGateway(
  address: Address,
): Promise<{ ok: true; gateway: OnChainGateway } | { ok: false; missing: boolean }> {
  try {
    return { ok: true, gateway: await readGateway(address) };
  } catch {
    try {
      const code = await publicClient.getCode({ address });
      return { ok: false, missing: !code || code === "0x" };
    } catch {
      // We could not even establish whether anything is deployed there.
      return { ok: false, missing: false };
    }
  }
}

import { describe, it, expect } from "vitest";
import { pickOrgWallet } from "./org-wallet";

const login = { address: "0xAAAa000000000000000000000000000000000000", walletClientType: "privy" };
const org = { address: "0xBBBb000000000000000000000000000000000000", walletClientType: "privy" };
const injected = { address: "0xCCCc000000000000000000000000000000000000", walletClientType: "metamask" };

describe("pickOrgWallet", () => {
  it("picks the org wallet by address, not by position", () => {
    // The merchant can have several Privy wallets — a leftover login wallet and the one their
    // quorum owns. "The first privy wallet" picks arbitrarily and signs from the wrong address.
    expect(pickOrgWallet([login, org], org.address)?.address).toBe(org.address);
    expect(pickOrgWallet([org, login], org.address)?.address).toBe(org.address);
  });

  it("matches case-insensitively", () => {
    expect(pickOrgWallet([org], org.address.toLowerCase())?.address).toBe(org.address);
  });

  it("returns nothing when the org wallet is not in the browser's list yet", () => {
    // Freshly created server-side: the client's user object has not been refreshed. This must
    // read as "not yet", never as "use whatever else is lying around".
    expect(pickOrgWallet([login], org.address)).toBeUndefined();
  });

  it("returns nothing when the address is not known yet", () => {
    expect(pickOrgWallet([login, org], undefined)).toBeUndefined();
  });

  it("never returns an injected wallet", () => {
    expect(pickOrgWallet([injected], injected.address)).toBeUndefined();
  });
});

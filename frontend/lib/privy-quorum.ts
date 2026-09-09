import { getPrivy } from "./privy-server";

/** Deterministic per merchant. The quorum is looked up by name, not stored anywhere: we have
 *  no database, and the merchant's DID is the only stable key we own. */
export const quorumName = (did: string) => `CG team ${did.replace(/^did:privy:/, "")}`;

export type MerchantQuorum = { quorumId: string; organizationId: string; threshold: number };

/** Reads. Returns undefined rather than creating.
 *
 *  Split from ensure* on purpose: /team and /api/privy/set-policy run before a merchant has
 *  deployed anything, and a create on those paths would name their organisation after a
 *  placeholder they never typed — permanently, since the name is the lookup key. */
export async function findMerchantQuorum(did: string): Promise<MerchantQuorum | undefined> {
  const privy = getPrivy();
  const name = quorumName(did);
  // Organizations are listable and carry the quorum id, so one list resolves both.
  for await (const org of privy.organizations().list()) {
    if (org.display_name === name) {
      const quorum = await privy.keyQuorums().get(org.default_key_quorum_id);
      return {
        quorumId: org.default_key_quorum_id,
        organizationId: org.id,
        threshold: quorum.authorization_threshold ?? 1,
      };
    }
  }
  return undefined;
}

// Guards concurrent ensure calls for the same merchant (e.g. two tabs deploying at once):
// without this, both would see findMerchantQuorum() return nothing and both would create,
// leaving lookup to arbitrarily pick one of two pairs on the next list() call.
// ponytail: in-process map, sufficient only because this app runs as one long-lived process
// (SPEC §8) — would not hold across serverless instances, switch to a DB-backed lock then.
const inFlight = new Map<string, Promise<MerchantQuorum>>();

/** Creates the merchant's key quorum and organization, or returns the existing pair.
 *  Call this from the deploy route only — it is the one place a merchant has told us a name.
 *
 *  Order is fixed by the API: organizations().create requires default_key_quorum_id, so the
 *  quorum must exist first (SPEC §6).
 *
 *  Starts at 1-of-1 and cannot start higher: a quorum holds user_ids, and a second employee's
 *  DID does not exist until they have logged in themselves. The Team screen raises it later. */
export async function ensureMerchantQuorum(did: string): Promise<MerchantQuorum> {
  const existing = await findMerchantQuorum(did);
  if (existing) return existing;

  const pending = inFlight.get(did);
  if (pending) return pending;

  const create = (async (): Promise<MerchantQuorum> => {
    const privy = getPrivy();
    const quorum = await privy.keyQuorums().create({
      user_ids: [did],
      authorization_threshold: 1,
      display_name: quorumName(did),
    });
    // ponytail: if organizations().create throws here, the quorum above is orphaned —
    // keyQuorums() has no list(), so findMerchantQuorum can only see it via an organization
    // and a retry will create a second pair. Accepted: the orphan is inert (no wallet, no
    // policy, no cost), the merchant gets a working pair on retry, cleanup is a Privy-dashboard
    // chore. Fix if @privy-io/node ever exposes keyQuorums().list().
    const organization = await privy.organizations().create({
      default_key_quorum_id: quorum.id,
      display_name: quorumName(did),
    });

    return { quorumId: quorum.id, organizationId: organization.id, threshold: 1 };
  })();

  inFlight.set(did, create);
  try {
    return await create;
  } finally {
    inFlight.delete(did);
  }
}

export async function quorumMembers(quorumId: string): Promise<string[]> {
  const quorum = await getPrivy().keyQuorums().get(quorumId);
  return quorum.user_ids ?? [];
}

export type OrgWallet = { walletId: string; address: `0x${string}` };

/** The wallet the merchant's quorum owns. Looked up by owner, not stored: same reasoning as
 *  findMerchantQuorum — there is no database, and `owner_id` is a fact Privy already keeps. */
export async function findOrgWallet(quorumId: string): Promise<OrgWallet | undefined> {
  for await (const w of getPrivy().wallets().list()) {
    if (w.owner_id === quorumId) return { walletId: w.id, address: w.address as `0x${string}` };
  }
  return undefined;
}

// Same guard, same reason as `inFlight` above: two tabs onboarding at once must not create two
// wallets for one quorum, because findOrgWallet would then pick between them arbitrarily. Unlike
// `inFlight`, a duplicate here is not inert — see the ordering note in ensureOrgWallet below.
const walletInFlight = new Map<string, Promise<OrgWallet>>();

/** Creates the organization wallet, or returns the existing one.
 *
 *  `owner_id` is the whole point: a wallet owned by the merchant's key quorum is an organization
 *  wallet in Privy's own sense (SPEC §6), it is visible to every member of that quorum in their
 *  own browser, and no key of ours can move it. Verified against the live API — a wallet created
 *  this way signed tx 0xb904472415596a149d4e7dc97c877a86967390afba11d4b77729affac5f0f099 from a
 *  member's browser with the platform paying gas.
 *
 *  `walletInFlight` is checked before the `findOrgWallet` read starts, not after it resolves:
 *  two concurrent callers both awaiting that read would otherwise both find nothing and both
 *  proceed to create, and findOrgWallet would then pick arbitrarily between the two wallets it
 *  created — one of which owns none of the merchant's gateways. Checking first closes that
 *  window: the second caller joins the first's in-flight promise instead of racing it. */
export async function ensureOrgWallet(quorumId: string, organizationId: string): Promise<OrgWallet> {
  const pending = walletInFlight.get(quorumId);
  if (pending) return pending;

  const create = (async (): Promise<OrgWallet> => {
    const existing = await findOrgWallet(quorumId);
    if (existing) return existing;
    const wallet = await getPrivy().wallets().create({ chain_type: "ethereum", owner_id: quorumId });
    await getPrivy().wallets().assignEntity(wallet.id, { type: "organization", id: organizationId });
    return { walletId: wallet.id, address: wallet.address as `0x${string}` };
  })();

  walletInFlight.set(quorumId, create);
  try {
    return await create;
  } finally {
    walletInFlight.delete(quorumId);
  }
}

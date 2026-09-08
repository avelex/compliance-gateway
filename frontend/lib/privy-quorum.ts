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

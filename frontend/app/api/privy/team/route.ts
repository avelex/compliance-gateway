import { NextResponse } from "next/server";
import { APIError } from "@privy-io/node";
import { getPrivy, requireMerchant, Unauthorized, Misconfigured } from "@/lib/privy-server";
import { findMerchantQuorum, quorumMembers } from "@/lib/privy-quorum";

async function caller(req: Request) {
  try {
    return { merchant: await requireMerchant(req) };
  } catch (e) {
    if (e instanceof Unauthorized)
      return { response: NextResponse.json({ error: e.message }, { status: 401 }) };
    if (e instanceof Misconfigured)
      return { response: NextResponse.json({ error: "Privy is not configured." }, { status: 503 }) };
    throw e;
  }
}

export async function GET(req: Request) {
  const { merchant, response } = await caller(req);
  if (response) return response;
  try {
    const team = await findMerchantQuorum(merchant.did);
    // No gateway deployed yet means no quorum yet. That is a state, not an error: one person,
    // one approval, and the screen says so.
    if (!team) {
      return NextResponse.json({ quorumId: null, threshold: 1, members: [merchant.did] });
    }
    return NextResponse.json({
      quorumId: team.quorumId,
      threshold: team.threshold,
      members: await quorumMembers(team.quorumId),
    });
  } catch (e) {
    const message = e instanceof APIError ? e.message : "Your team could not be read.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const { merchant, response } = await caller(req);
  if (response) return response;

  let addUserId: unknown, threshold: unknown;
  try {
    ({ addUserId, threshold } = (await req.json()) as { addUserId?: unknown; threshold?: unknown });
  } catch {
    return NextResponse.json({ error: "The request body is not valid JSON." }, { status: 400 });
  }

  const token = req.headers.get("authorization")!.slice(7);

  try {
    const team = await findMerchantQuorum(merchant.did);
    if (!team) {
      return NextResponse.json(
        { error: "Deploy a gateway first — that is when your team is created." },
        { status: 409 },
      );
    }
    const members = await quorumMembers(team.quorumId);

    const next =
      typeof addUserId === "string" && /^did:privy:[A-Za-z0-9]+$/.test(addUserId)
        ? [...new Set([...members, addUserId])]
        : members;

    const wanted = typeof threshold === "number" ? threshold : team.threshold;
    // A threshold above the member count would lock the quorum permanently: no set of
    // signatures could satisfy it, and lowering it back needs a satisfying set.
    if (!Number.isInteger(wanted) || wanted < 1 || wanted > next.length) {
      return NextResponse.json(
        { error: `Approvals required must be between 1 and ${next.length}.` },
        { status: 400 },
      );
    }
    // Lowering needs signatures from the quorum as it currently stands — two people at once,
    // which nothing here can collect. Refuse it in words rather than as a Privy 401.
    if (wanted < team.threshold) {
      return NextResponse.json(
        { error: "Lowering the number of approvals needs everyone to sign at once, which this dashboard cannot do yet." },
        { status: 409 },
      );
    }
    // Adding a member once two approvals are already required is the same problem: the new
    // membership list needs a satisfying set of signatures from the *current* quorum, which
    // this dashboard has no flow for.
    if (next.length !== members.length && team.threshold > 1) {
      return NextResponse.json(
        { error: "Adding someone once two approvals are required needs everyone to sign at once, which this dashboard cannot do yet." },
        { status: 409 },
      );
    }

    // The service wrapper signs for us from the caller's token. The raw `_update` takes a
    // signature string instead — do not reach for it.
    const updated = await getPrivy().keyQuorums().update(team.quorumId, {
      user_ids: next,
      authorization_threshold: wanted,
      authorization_context: { user_jwts: [token] },
    });
    return NextResponse.json({
      threshold: updated.authorization_threshold ?? wanted,
      members: updated.user_ids ?? next,
    });
  } catch (e) {
    const message = e instanceof APIError ? e.message : "Your team could not be updated.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { APIError } from "@privy-io/node";
import { requireMerchant, Unauthorized, Misconfigured } from "@/lib/privy-server";
import { ensureMerchantQuorum, ensureOrgWallet } from "@/lib/privy-quorum";

export async function POST(req: Request) {
  let merchant;
  try {
    merchant = await requireMerchant(req);
  } catch (e) {
    if (e instanceof Unauthorized) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof Misconfigured) return NextResponse.json({ error: "Privy is not configured." }, { status: 503 });
    throw e;
  }

  let organizationName: unknown;
  try {
    ({ organizationName } = await req.json());
  } catch {
    return NextResponse.json({ error: "The request body is not valid JSON." }, { status: 400 });
  }

  if (typeof organizationName !== "string" || !organizationName.trim()) {
    return NextResponse.json({ error: "Organization name is required." }, { status: 400 });
  }

  try {
    const team = await ensureMerchantQuorum(merchant.did, organizationName.trim());
    const wallet = await ensureOrgWallet(team.quorumId, team.organizationId);
    return NextResponse.json({ success: true, organizationId: team.organizationId, walletAddress: wallet.address });
  } catch (e) {
    const message = e instanceof APIError ? e.message : "Your organization could not be created.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

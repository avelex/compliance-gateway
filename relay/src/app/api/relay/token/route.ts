import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { sessionUserId } from "@/lib/sessionUserId";
import { createApplicant, mintAccessToken } from "@/lib/sumsub";
import { allow } from "@/lib/rateLimit";

const SESSION_ID_SECRET = process.env.SESSION_ID_SECRET ?? "";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allow(ip)) {
    return NextResponse.json({}, { status: 429 });
  }

  const { gate, wallet } = (await req.json()) as { gate?: string; wallet?: string };
  if (!gate || !wallet || !isAddress(gate) || !isAddress(wallet)) {
    return NextResponse.json({ error: "gate and wallet must be addresses" }, { status: 400 });
  }

  const uid = sessionUserId(SESSION_ID_SECRET, gate, wallet);

  try {
    await createApplicant(uid);
    const token = await mintAccessToken(uid);
    return NextResponse.json({ token });
  } catch {
    return NextResponse.json({ error: "Verification provider is unavailable." }, { status: 502 });
  }
}

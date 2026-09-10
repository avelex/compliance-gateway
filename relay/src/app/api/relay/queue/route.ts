import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { enqueue, snapshot } from "@/lib/queue";

const RELAY_FETCH_TOKEN = process.env.RELAY_FETCH_TOKEN ?? "";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { kind?: string; gate?: string; wallet?: string; level?: number };
  if (!body.kind || !body.gate || !body.wallet || body.level === undefined) {
    return NextResponse.json({ error: "kind, gate, wallet and level are required" }, { status: 400 });
  }
  if (!isAddress(body.gate) || !isAddress(body.wallet)) {
    return NextResponse.json({ error: "gate and wallet must be addresses" }, { status: 400 });
  }

  enqueue({ kind: body.kind, gate: body.gate, wallet: body.wallet, level: body.level });
  return NextResponse.json({}, { status: 202 });
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${RELAY_FETCH_TOKEN}`) {
    return NextResponse.json({}, { status: 401 });
  }

  const minuteParam = req.nextUrl.searchParams.get("minute");
  const minute = Number(minuteParam);
  if (!minuteParam || !Number.isFinite(minute)) {
    return NextResponse.json({ error: "minute is required" }, { status: 400 });
  }

  return NextResponse.json({ minute, items: snapshot(minute) });
}

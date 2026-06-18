import { NextRequest, NextResponse } from "next/server";
import { encryptLink } from "@/lib/linkToken";

export async function POST(req: NextRequest) {
  const { payload, ttlMs } = await req.json();
  return NextResponse.json({ token: encryptLink(payload, ttlMs) });
}

import { NextRequest, NextResponse } from "next/server";
import { decryptLink } from "@/lib/linkToken";

export async function POST(req: NextRequest) {
  const { token } = await req.json();
  const result = decryptLink<{
    callId: string;
    subscription: unknown;
    sdp: RTCSessionDescriptionInit;
  }>(token);
  if (!result.valid) {
    return NextResponse.json(result, { status: 403 });
  }
  const { subscription, ...rest } = result.data;
  return NextResponse.json({ valid: true, data: rest });
}

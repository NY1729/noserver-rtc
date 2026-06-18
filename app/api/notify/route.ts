import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { decryptLink } from "@/lib/linkToken";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export async function POST(req: NextRequest) {
  const { token, payload } = await req.json();

  const result = decryptLink<{ subscription: PushSubscriptionJSON }>(token);
  if (!result.valid) {
    return NextResponse.json({ error: result.reason }, { status: 403 });
  }

  try {
    await webpush.sendNotification(
      result.data.subscription as any,
      JSON.stringify(payload),
    );
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.statusCode === 404 || err?.statusCode === 410) {
      return NextResponse.json(
        { error: "subscription expired" },
        { status: 410 },
      );
    }
    console.error(err);
    return NextResponse.json({ error: "send failed" }, { status: 500 });
  }
}

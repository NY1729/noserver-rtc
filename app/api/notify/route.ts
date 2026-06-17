import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const secret = req.headers.get("x-poc-secret");

  if (
    process.env.NEXT_PUBLIC_APP_ORIGIN &&
    origin !== process.env.NEXT_PUBLIC_APP_ORIGIN
  ) {
    return NextResponse.json({ error: "forbidden origin" }, { status: 403 });
  }
  if (process.env.POC_SECRET && secret !== process.env.POC_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { subscription, payload } = await req.json();
  if (!subscription?.endpoint) {
    return NextResponse.json(
      { error: "invalid subscription" },
      { status: 400 },
    );
  }

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
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

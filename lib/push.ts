export async function subscribeToPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("このブラウザはWeb Pushに対応していません");
  }
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  // 既存subscriptionがあれば再利用(毎回新規生成しない)
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing.toJSON();

  if (Notification.permission !== "granted") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("通知が許可されませんでした");
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  });

  return subscription.toJSON();
}

export async function sendPush(subscription: unknown, payload: unknown) {
  const res = await fetch("/api/notify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-poc-secret": process.env.NEXT_PUBLIC_POC_SECRET!,
    },
    body: JSON.stringify({ subscription, payload }),
  });
  if (!res.ok) throw new Error(`push送信に失敗しました (${res.status})`);
}

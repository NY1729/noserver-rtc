"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { subscribeToPush, sendPush } from "@/lib/push";
import {
  createPeerConnection,
  createFullOffer,
  createFullAnswer,
  attachDebugLogging,
  attachLocalMedia,
} from "@/lib/webrtc";

type ConnState = "idle" | "connecting" | "connected" | "error";

const dotClass: Record<ConnState, string> = {
  idle: "bg-zinc-300",
  connecting: "bg-amber-600 animate-pulse",
  connected: "bg-green-600",
  error: "bg-red-600",
};

function CallPageInner() {
  const incomingData = useSearchParams().get("data");
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const pendingCallIdRef = useRef<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const politeRef = useRef(false);
  const makingOfferRef = useRef(false);
  const readyForRenegotiationRef = useRef(false);

  const [connState, setConnState] = useState<ConnState>("idle");
  const [statusText, setStatusText] = useState("未接続");
  const [link, setLink] = useState("");
  const [channelOpen, setChannelOpen] = useState(false);
  const [mediaEnabled, setMediaEnabled] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [copied, setCopied] = useState(false);

  const appendLog = (text: string) => {
    console.log(text);
    setLog((prev) => [...prev, text]);
  };

  const setupPeerConnection = (
    pc: RTCPeerConnection,
    label: string,
    polite: boolean,
  ) => {
    politeRef.current = polite;
    attachDebugLogging(pc, label);

    pc.ontrack = (event) => {
      appendLog(`[${label}] remote track受信`);
      if (remoteVideoRef.current)
        remoteVideoRef.current.srcObject = event.streams[0];
    };

    pc.onnegotiationneeded = async () => {
      if (!readyForRenegotiationRef.current) return;
      const dc = dcRef.current;
      if (!dc || dc.readyState !== "open") return;
      try {
        makingOfferRef.current = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        dc.send(
          JSON.stringify({
            type: "renegotiate-offer",
            sdp: pc.localDescription,
          }),
        );
        appendLog(`[${label}] renegotiateオファーを送信`);
      } catch (err) {
        appendLog(
          `[${label}] negotiationneededエラー: ${(err as Error).message}`,
        );
      } finally {
        makingOfferRef.current = false;
      }
    };
  };

  const setupDataChannel = (dc: RTCDataChannel) => {
    dc.onopen = () => {
      appendLog("[datachannel] open");
      setConnState("connected");
      setStatusText("接続済み");
      setChannelOpen(true);
      readyForRenegotiationRef.current = true;
    };
    dc.onclose = () => {
      appendLog("[datachannel] closed");
      setConnState("idle");
      setStatusText("切断されました");
      setChannelOpen(false);
    };
    dc.onerror = () => {
      setConnState("error");
      setStatusText("接続エラー");
    };
    dc.onmessage = async (e) => {
      const msg = JSON.parse(e.data);
      const pc = pcRef.current;
      if (!pc) return;

      if (msg.type === "chat") {
        appendLog(`相手: ${msg.text}`);
        return;
      }
      if (msg.type !== "renegotiate-offer" && msg.type !== "renegotiate-answer")
        return;

      const description = msg.sdp as RTCSessionDescriptionInit;
      const offerCollision =
        description.type === "offer" &&
        (makingOfferRef.current || pc.signalingState !== "stable");

      if (!politeRef.current && offerCollision) {
        appendLog(
          "[negotiation] 衝突を検知、自分のofferを優先します(impolite)",
        );
        return;
      }

      try {
        if (offerCollision) {
          appendLog(
            "[negotiation] 衝突を検知、自分のofferを取り下げます(polite)",
          );
          await Promise.all([
            pc.setLocalDescription({ type: "rollback" }),
            pc.setRemoteDescription(description),
          ]);
        } else {
          await pc.setRemoteDescription(description);
        }

        if (description.type === "offer") {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          dc.send(
            JSON.stringify({
              type: "renegotiate-answer",
              sdp: pc.localDescription,
            }),
          );
          appendLog("[negotiation] renegotiateアンサーを送信");
        } else {
          appendLog("[negotiation] renegotiateアンサーを受信");
        }
      } catch (err) {
        appendLog(`[negotiation] エラー: ${(err as Error).message}`);
      }
    };
    dcRef.current = dc;
  };

  useEffect(() => {
    if (!incomingData) return;
    (async () => {
      try {
        setConnState("connecting");
        setStatusText("応答を作成中");
        const {
          callId,
          subscription: callerSub,
          sdp: offer,
        } = JSON.parse(decodeURIComponent(incomingData));
        appendLog(`[callee] callId=${callId}`);

        const pc = createPeerConnection();
        setupPeerConnection(pc, "callee", false);
        pcRef.current = pc;
        pc.ondatachannel = (e) => setupDataChannel(e.channel);

        const answer = await createFullAnswer(pc, offer);
        appendLog("[callee] answer作成完了、送信します");

        await sendPush(callerSub, { type: "answer", callId, sdp: answer });
        appendLog("[callee] answer送信成功");
        setStatusText("応答を送信しました。接続待ち");
      } catch (err) {
        appendLog(`[callee] エラー: ${(err as Error).message}`);
        setConnState("error");
        setStatusText("エラーが発生しました");
      }
    })();
  }, [incomingData]);

  useEffect(() => {
    if (incomingData) return;
    const handler = async (event: MessageEvent) => {
      const data = event.data;
      if (data?.type !== "answer") return;
      appendLog(`[caller] answer受信 callId=${data.callId}`);
      if (data.callId !== pendingCallIdRef.current || !pcRef.current) return;
      try {
        await pcRef.current.setRemoteDescription(data.sdp);
        appendLog("[caller] setRemoteDescription成功");
        setStatusText("接続確立中");
      } catch (err) {
        appendLog(
          `[caller] setRemoteDescription失敗: ${(err as Error).message}`,
        );
        setConnState("error");
      }
    };
    navigator.serviceWorker?.addEventListener("message", handler);
    return () =>
      navigator.serviceWorker?.removeEventListener("message", handler);
  }, [incomingData]);

  async function startCall() {
    try {
      setConnState("connecting");
      setStatusText("通知を有効化中");
      const mySub = await subscribeToPush();

      const pc = createPeerConnection();
      setupPeerConnection(pc, "caller", true);
      pcRef.current = pc;
      setupDataChannel(pc.createDataChannel("chat"));

      const callId = crypto.randomUUID();
      pendingCallIdRef.current = callId;
      appendLog(`[caller] callId=${callId}`);

      setStatusText("リンクを作成中");
      const offer = await createFullOffer(pc);
      appendLog("[caller] offer作成完了");

      setLink(
        `${location.origin}/?data=${encodeURIComponent(JSON.stringify({ callId, subscription: mySub, sdp: offer }))}`,
      );
      setStatusText("リンクを相手に共有してください");
    } catch (err) {
      appendLog(`[caller] エラー: ${(err as Error).message}`);
      setConnState("error");
      setStatusText("エラーが発生しました");
    }
  }

  async function enableMedia() {
    const pc = pcRef.current;
    if (!pc) return;
    try {
      const stream = await attachLocalMedia(pc);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setMediaEnabled(true);
    } catch (err) {
      appendLog(`[media] エラー: ${(err as Error).message}`);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function send() {
    if (!messageInput) return;
    dcRef.current?.send(JSON.stringify({ type: "chat", text: messageInput }));
    appendLog(`自分: ${messageInput}`);
    setMessageInput("");
  }

  return (
    <div className="min-h-screen bg-white flex justify-center px-4 py-12 text-zinc-900">
      <div className="w-full max-w-[480px] border border-zinc-200 rounded-xl p-7 flex flex-col gap-5">
        <header className="flex items-center gap-3">
          <span
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotClass[connState]}`}
          />
          <div>
            <h1 className="text-base font-semibold m-0">Push Signal</h1>
            <p className="text-[13px] text-zinc-500 mt-0.5">{statusText}</p>
          </div>
        </header>

        {!incomingData && !link && (
          <button
            onClick={startCall}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg px-4 py-2.5"
          >
            通話リンクを作る
          </button>
        )}

        {link && (
          <div className="flex flex-col gap-2">
            <label className="text-xs text-zinc-500">
              このリンクを相手に送ってください
            </label>
            <textarea
              readOnly
              value={link}
              rows={3}
              className="font-mono text-[11px] p-2.5 border border-zinc-200 rounded-lg resize-none text-zinc-700 w-full focus:outline-2 focus:outline-blue-600 focus:outline-offset-1"
            />
            <button
              onClick={copyLink}
              className="bg-white border border-zinc-200 text-zinc-900 text-sm rounded-lg px-4 py-2.5 hover:bg-zinc-50"
            >
              {copied ? "コピーしました" : "リンクをコピー"}
            </button>
          </div>
        )}

        {channelOpen && !mediaEnabled && (
          <button
            onClick={enableMedia}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg px-4 py-2.5"
          >
            カメラ・マイクを有効にする
          </button>
        )}

        <div className={mediaEnabled ? "flex gap-2" : "hidden"}>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-1/2 aspect-video rounded-lg bg-zinc-900 object-cover"
          />
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-1/2 aspect-video rounded-lg bg-zinc-900 object-cover"
          />
        </div>

        <div className="bg-zinc-50 border border-zinc-100 rounded-lg p-3 h-40 overflow-y-auto font-mono text-[11.5px] text-zinc-600 leading-relaxed">
          {log.length === 0 ? (
            <p className="text-zinc-400 m-0">ここに接続ログが表示されます</p>
          ) : (
            log.map((line, i) => <div key={i}>{line}</div>)
          )}
        </div>

        <div className="flex gap-2">
          <input
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={
              channelOpen ? "メッセージを入力" : "接続が完了すると送信できます"
            }
            disabled={!channelOpen}
            className="flex-1 text-sm px-3 py-2.5 border border-zinc-200 rounded-lg disabled:opacity-50 focus:outline-2 focus:outline-blue-600 focus:outline-offset-1"
          />
          <button
            onClick={send}
            disabled={!channelOpen}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg px-4 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            送信
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CallPage() {
  return (
    <Suspense fallback={null}>
      <CallPageInner />
    </Suspense>
  );
}

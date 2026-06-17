const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export function createPeerConnection() {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS });
}

function waitForIceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", check);
  });
}

export async function createFullOffer(
  pc: RTCPeerConnection,
): Promise<RTCSessionDescriptionInit> {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGatheringComplete(pc);
  return { type: pc.localDescription!.type, sdp: pc.localDescription!.sdp };
}

export async function createFullAnswer(
  pc: RTCPeerConnection,
  offer: RTCSessionDescriptionInit,
): Promise<RTCSessionDescriptionInit> {
  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitForIceGatheringComplete(pc);
  return { type: pc.localDescription!.type, sdp: pc.localDescription!.sdp };
}

export function attachDebugLogging(pc: RTCPeerConnection, label: string) {
  pc.oniceconnectionstatechange = () =>
    console.log(`[${label}] ICE state:`, pc.iceConnectionState);
  pc.onconnectionstatechange = () =>
    console.log(`[${label}] Connection state:`, pc.connectionState);
  pc.onicegatheringstatechange = () =>
    console.log(`[${label}] ICE gathering:`, pc.iceGatheringState);
  pc.onsignalingstatechange = () =>
    console.log(`[${label}] Signaling state:`, pc.signalingState);
}

export async function attachLocalMedia(
  pc: RTCPeerConnection,
  constraints: MediaStreamConstraints = { audio: true, video: true },
): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  stream.getTracks().forEach((track) => pc.addTrack(track, stream));
  return stream;
}

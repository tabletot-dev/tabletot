import { BACKEND_WS } from "./api";
import { MIC_WORKLET_SOURCE } from "./micWorklet";
import { floatToInt16, resampleLinear } from "./pcm";
import type { SttMessage } from "./types";

const TARGET_RATE = 16000;
const WORKLET_THRESHOLD = 2048;

export interface SttPressHandle {
  stop(): Promise<void>;
  closed: Promise<void>;
}

export async function startSttPress(
  sessionId: string,
  onMessage: (msg: SttMessage) => void,
): Promise<SttPressHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      noiseSuppression: true,
      echoCancellation: true,
    },
  });

  let ctx: AudioContext;
  try {
    ctx = new AudioContext({ sampleRate: TARGET_RATE });
  } catch {
    ctx = new AudioContext();
  }
  const actualRate = ctx.sampleRate;

  const workletUrl = URL.createObjectURL(
    new Blob([MIC_WORKLET_SOURCE], { type: "application/javascript" }),
  );
  await ctx.audioWorklet.addModule(workletUrl);
  URL.revokeObjectURL(workletUrl);

  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "pcm-worklet", {
    processorOptions: { threshold: WORKLET_THRESHOLD },
  });
  source.connect(node);

  const ws = new WebSocket(`${BACKEND_WS}/voice/stt/${sessionId}`);
  ws.binaryType = "arraybuffer";

  const opened = new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("STT WebSocket error"));
  });

  let closedResolve!: () => void;
  const closed = new Promise<void>((r) => {
    closedResolve = r;
  });

  // Track whether a terminal message was sent so the close handler knows
  // whether to emit a synthetic no_speech (covers any silent-close edge case).
  let terminalReceived = false;

  ws.onmessage = (ev) => {
    if (typeof ev.data !== "string") return;
    try {
      const msg = JSON.parse(ev.data) as SttMessage;
      if (msg.type === "done" || msg.type === "error" || msg.type === "no_speech") {
        terminalReceived = true;
      }
      onMessage(msg);
    } catch {
      // ignore malformed
    }
  };
  ws.onclose = () => {
    closedResolve();
    if (!terminalReceived) {
      onMessage({ type: "no_speech" });
    }
  };

  node.port.onmessage = (ev) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    let samples = new Float32Array(ev.data as ArrayBuffer);
    if (actualRate !== TARGET_RATE) {
      samples = resampleLinear(samples, actualRate, TARGET_RATE);
    }
    const int16 = floatToInt16(samples);
    ws.send(int16.buffer);
  };

  await opened;

  const stop = async () => {
    try {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
    } catch {
      // noop
    }
    stream.getTracks().forEach((t) => t.stop());
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "flush" }));
      }
    } catch {
      // noop
    }
    try {
      await ctx.close();
    } catch {
      // noop
    }
  };

  return { stop, closed };
}

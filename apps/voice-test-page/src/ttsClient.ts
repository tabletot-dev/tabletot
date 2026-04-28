import { BACKEND_WS } from "./api";
import { int16ToFloat, resampleLinear } from "./pcm";
import type { TtsMessage } from "./types";

const SARVAM_TTS_RATE = 24000;

export interface TtsClientHandle {
  /** Stop any in-progress audio immediately (called on PTT press). */
  bargeIn(): void;
  close(): void;
}

export function openTtsClient(
  sessionId: string,
  onMessage: (msg: TtsMessage) => void,
): TtsClientHandle {
  // ctx is mutable — bargeIn() closes and recreates it to drop all pending audio.
  let ctx = new AudioContext();
  let nextStartTime = 0;

  const ws = new WebSocket(`${BACKEND_WS}/voice/tts/${sessionId}`);
  ws.binaryType = "arraybuffer";

  ws.onmessage = (ev) => {
    if (typeof ev.data === "string") {
      try {
        const msg = JSON.parse(ev.data) as TtsMessage;
        onMessage(msg);
      } catch {
        // ignore
      }
      return;
    }

    const buf = ev.data as ArrayBuffer;
    if (buf.byteLength < 2) return;

    const int16 = new Int16Array(buf);
    let floats = int16ToFloat(int16);
    if (ctx.sampleRate !== SARVAM_TTS_RATE) {
      floats = resampleLinear(floats, SARVAM_TTS_RATE, ctx.sampleRate);
    }

    const audioBuffer = ctx.createBuffer(1, floats.length, ctx.sampleRate);
    audioBuffer.copyToChannel(floats, 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime, nextStartTime);
    source.start(startAt);
    nextStartTime = startAt + audioBuffer.duration;
  };

  ws.onerror = () => {
    onMessage({ type: "error", message: "TTS WebSocket error" });
  };

  const bargeIn = () => {
    // Close the current AudioContext — this immediately cancels all scheduled
    // BufferSource nodes and stops any audio in progress. The WS stays open.
    try {
      ctx.close();
    } catch {
      // noop
    }
    ctx = new AudioContext();
    nextStartTime = 0;
  };

  const close = () => {
    try {
      ws.close();
    } catch {
      // noop
    }
    try {
      ctx.close();
    } catch {
      // noop
    }
  };

  return { bargeIn, close };
}

export async function unlockAudioContext(): Promise<void> {
  const ctx = new AudioContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
  await ctx.close();
}

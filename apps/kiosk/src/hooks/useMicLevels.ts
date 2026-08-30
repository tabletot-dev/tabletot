import { useEffect, useRef, useState } from "react";

const IDLE = { levels: [] as number[], rms: 0 };

export function useMicLevels(active: boolean, barCount = 24) {
  const [state, setState] = useState(() => ({ levels: Array(barCount).fill(0), rms: 0 }));
  const raf = useRef<number>();

  useEffect(() => {
    const zero = () => setState({ levels: Array(barCount).fill(0), rms: 0 });
    if (!active) { zero(); return; }

    const reduced =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { zero(); return; }

    let cancelled = false;
    let ctx: AudioContext | undefined;
    let stream: MediaStream | undefined;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const bins = new Uint8Array(analyser.frequencyBinCount);
        const smoothed = new Array(barCount).fill(0);

        const tick = () => {
          analyser.getByteFrequencyData(bins);
          let sum = 0;
          for (let i = 0; i < barCount; i++) {
            const bin = bins[Math.floor((i / barCount) * bins.length)] / 255;
            smoothed[i] = Math.max(bin, smoothed[i] * 0.82); // gentle fall
            sum += bin * bin;
          }
          setState({ levels: [...smoothed], rms: Math.sqrt(sum / barCount) });
          raf.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        if (!cancelled) zero();
      }
    })();

    return () => {
      cancelled = true;
      if (raf.current) cancelAnimationFrame(raf.current);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close()?.catch(() => {});
    };
  }, [active, barCount]);

  return state;
}

void IDLE;

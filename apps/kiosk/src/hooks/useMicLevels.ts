import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Audio-reactive bar levels for the voice dock waveform.
 *
 * Perf note (review I2): the rAF loop must NOT drive React state — a 60 Hz
 * setState re-renders the whole dock (24 spans + strip + chips, none memoised)
 * on a low-end tablet during capture. Instead the loop writes each bar's height
 * straight to the DOM via `barsRef`, and React state carries only a coarse
 * `rms` bucket (0 / 1) for the idle class, updated only when it flips.
 *
 * `levels` stays in the return shape for the inactive / reduced-motion / denied
 * paths (always a zeroed array); the component uses `barsRef` for live bars.
 */
export function useMicLevels(active: boolean, barCount = 24) {
  const [rms, setRms] = useState(0);
  const barsRef = useRef<(HTMLElement | null)[]>([]);
  const raf = useRef<number>();

  // Callback ref the component attaches to every waveform <span>.
  const setBar = useCallback((el: HTMLElement | null, i: number) => {
    barsRef.current[i] = el;
  }, []);

  useEffect(() => {
    if (!active) { setRms(0); return; }

    const reduced =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setRms(0); return; }

    let cancelled = false;
    let ctx: AudioContext | undefined;
    let stream: MediaStream | undefined;
    let lastBucket = -1;

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
            barsRef.current[i]?.style.setProperty("--h", String(Math.max(0.08, smoothed[i])));
          }
          const v = Math.sqrt(sum / barCount);
          const bucket = v < 0.04 ? 0 : 1;
          if (bucket !== lastBucket) { lastBucket = bucket; setRms(bucket); }
          raf.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        if (!cancelled) setRms(0);
      }
    })();

    return () => {
      cancelled = true;
      if (raf.current) cancelAnimationFrame(raf.current);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close()?.catch(() => {});
    };
  }, [active, barCount]);

  return { levels: Array(barCount).fill(0) as number[], rms, barsRef: setBar };
}

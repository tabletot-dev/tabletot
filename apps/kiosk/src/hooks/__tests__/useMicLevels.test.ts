import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useMicLevels } from "@/hooks/useMicLevels";

const stopTrack = vi.fn();
const getUserMedia = vi.fn();

beforeEach(() => {
  stopTrack.mockClear();
  getUserMedia.mockReset();
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal("AudioContext", class {
    createAnalyser() {
      return { fftSize: 0, frequencyBinCount: 16, getByteFrequencyData: (a: Uint8Array) => a.fill(128), connect() {} };
    }
    createMediaStreamSource() { return { connect() {} }; }
    close = vi.fn();
  });
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});

describe("useMicLevels", () => {
  it("returns a zeroed array of barCount length when inactive", () => {
    const { result } = renderHook(() => useMicLevels(false, 24));
    expect(result.current.levels).toHaveLength(24);
    expect(result.current.levels.every((v) => v === 0)).toBe(true);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("acquires a stream when active and releases tracks when it goes inactive", async () => {
    const { rerender } = renderHook(({ a }) => useMicLevels(a, 8), { initialProps: { a: true } });
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ audio: true }));
    rerender({ a: false });
    await waitFor(() => expect(stopTrack).toHaveBeenCalled());
  });

  it("returns zeros without throwing when getUserMedia rejects", async () => {
    getUserMedia.mockRejectedValue(new Error("denied"));
    const { result } = renderHook(() => useMicLevels(true, 12));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    expect(result.current.levels.every((v) => v === 0)).toBe(true);
    expect(result.current.rms).toBe(0);
  });

  it("returns zeros and acquires nothing under prefers-reduced-motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { result } = renderHook(() => useMicLevels(true, 10));
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(result.current.levels).toHaveLength(10);
  });
});

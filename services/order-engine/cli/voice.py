"""Voice CLI — Stage 3 PTT test harness.

Hold SPACE to speak (PTT). Release to finalize and get audio response.
Press Q (or Ctrl+C) to quit.

Usage:
    python -m cli.voice [--url http://localhost:8000] [--restaurant roast-ccx-hyd] [--table T-01]

macOS note: Terminal needs Accessibility permission.
    System Settings → Privacy & Security → Accessibility → enable Terminal (or iTerm2).

Dependencies:
    sounddevice, pynput, websockets, httpx, numpy
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import threading
from typing import Any

import httpx
import numpy as np
import sounddevice as sd
import websockets
from pynput import keyboard as pynput_kb

_SAMPLE_RATE = 16000
_CHANNELS = 1
_CHUNK_FRAMES = 3200   # 100ms at 16kHz × 2 bytes/sample
_TTS_SAMPLE_RATE = 24000  # bulbul:v3 default


# ---------------------------------------------------------------------------
# Session helpers (sync HTTP — called before async loop starts)
# ---------------------------------------------------------------------------


def start_session(base_url: str, restaurant_id: str, table_id: str) -> str:
    with httpx.Client(base_url=base_url, timeout=10) as client:
        resp = client.post(
            "/voice/session/start",
            json={"table_id": table_id, "restaurant_id": restaurant_id},
        )
        resp.raise_for_status()
        return resp.json()["session_id"]


def end_session(base_url: str, session_id: str) -> None:
    try:
        with httpx.Client(base_url=base_url, timeout=5) as client:
            client.post("/voice/session/end", json={"session_id": session_id})
    except Exception:
        pass


# ---------------------------------------------------------------------------
# TTS receiver — persistent WebSocket loop
# ---------------------------------------------------------------------------


async def tts_loop(ws_url: str, session_id: str, stop_event: asyncio.Event) -> None:
    """Connect to /voice/tts/{session_id} and play audio chunks as they arrive."""
    uri = f"{ws_url}/voice/tts/{session_id}"
    try:
        async with websockets.connect(uri) as ws:
            print("[TTS] Connected.")
            while not stop_event.is_set():
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue

                if isinstance(msg, bytes):
                    audio = np.frombuffer(msg, dtype=np.int16).astype(np.float32) / 32768.0
                    sd.play(audio, samplerate=_TTS_SAMPLE_RATE, blocking=False)
                elif isinstance(msg, str):
                    try:
                        data = json.loads(msg)
                    except json.JSONDecodeError:
                        continue
                    t = data.get("type", "")
                    if t == "speech_complete":
                        print("[TTS] Speech done.")
                    elif t == "error":
                        print(f"[TTS] Error: {data.get('message')}")
    except Exception as e:
        if not stop_event.is_set():
            print(f"[TTS] Connection error: {e}")


# ---------------------------------------------------------------------------
# Mic capture — sounddevice callback → asyncio queue
# ---------------------------------------------------------------------------


def _make_mic_stream(audio_queue: asyncio.Queue, loop: asyncio.AbstractEventLoop):
    def callback(indata: np.ndarray, frames: int, time: Any, status: sd.CallbackFlags):
        loop.call_soon_threadsafe(audio_queue.put_nowait, bytes(indata.tobytes()))

    return sd.InputStream(
        samplerate=_SAMPLE_RATE,
        channels=_CHANNELS,
        dtype="int16",
        blocksize=_CHUNK_FRAMES,
        callback=callback,
    )


# ---------------------------------------------------------------------------
# PTT loop — pynput keyboard listener (no root required on macOS)
# ---------------------------------------------------------------------------


async def ptt_loop(
    ws_url: str,
    session_id: str,
    stop_event: asyncio.Event,
) -> None:
    """Detect spacebar hold/release via pynput and stream audio to STT."""
    uri = f"{ws_url}/voice/stt/{session_id}"
    loop = asyncio.get_running_loop()

    # threading.Events are safe to set/clear from pynput's OS thread
    space_held = threading.Event()
    quit_pressed = threading.Event()

    def on_press(key):
        if key == pynput_kb.Key.space:
            space_held.set()
        elif hasattr(key, "char") and key.char == "q":
            quit_pressed.set()

    def on_release(key):
        if key == pynput_kb.Key.space:
            space_held.clear()

    listener = pynput_kb.Listener(on_press=on_press, on_release=on_release)
    listener.start()
    print("[PTT] Hold SPACE to speak. Press Q to quit.")

    ptt_active = False
    audio_queue: asyncio.Queue[bytes] = asyncio.Queue()
    mic_stream = None

    try:
        while not stop_event.is_set():
            if quit_pressed.is_set():
                stop_event.set()
                break

            is_space = space_held.is_set()

            if is_space and not ptt_active:
                # PTT press — start recording
                ptt_active = True
                audio_queue = asyncio.Queue()
                mic_stream = _make_mic_stream(audio_queue, loop)
                mic_stream.start()
                print("[PTT] Recording...")
                asyncio.create_task(_stt_session(uri, audio_queue))

            elif not is_space and ptt_active:
                # PTT release — flush and stop
                ptt_active = False
                if mic_stream is not None:
                    mic_stream.stop()
                    mic_stream.close()
                    mic_stream = None
                await audio_queue.put(b"__FLUSH__")
                print("[PTT] Released.")

            await asyncio.sleep(0.05)
    finally:
        listener.stop()
        if mic_stream is not None:
            mic_stream.stop()
            mic_stream.close()


# ---------------------------------------------------------------------------
# STT session — one per PTT press
# ---------------------------------------------------------------------------


async def _stt_session(uri: str, audio_queue: asyncio.Queue[bytes]) -> None:
    try:
        async with websockets.connect(uri) as ws:
            send_task = asyncio.create_task(_send_audio(ws, audio_queue))
            recv_task = asyncio.create_task(_recv_stt(ws))
            await asyncio.gather(send_task, recv_task)
    except Exception as e:
        print(f"\n[STT] Error: {e}")


async def _send_audio(ws: Any, audio_queue: asyncio.Queue[bytes]) -> None:
    while True:
        chunk = await audio_queue.get()
        if chunk == b"__FLUSH__":
            await ws.send(json.dumps({"type": "flush"}))
            break
        await ws.send(chunk)


def _print_turn_summary(data: dict) -> None:
    """Print LLM response, resolver hits, and order total after each turn."""
    print(f"[Response] {data.get('response', '')}")

    resolver = data.get("resolver", [])
    if resolver:
        print("[Resolver]")
        for r in resolver:
            raw = r.get("raw", "?")
            rtype = r.get("type", "?")
            if rtype == "match":
                applied = "+" if r.get("applied") else "!"
                print(f"  {applied} \"{raw}\" → {r['item']}  [{r['method']}, {r['score']}]")
            elif rtype == "needs_variant":
                variants = ", ".join(r.get("variants", []))
                print(f"  ? \"{raw}\" → {r['item']} needs variant  [{variants}]")
            elif rtype == "ambiguous":
                candidates = ", ".join(r.get("candidates", []))
                print(f"  ? \"{raw}\" → ambiguous  [{candidates}]")
            elif rtype == "no_match":
                suggestions = ", ".join(r.get("suggestions", []))
                sugg_str = f"  suggestions: {suggestions}" if suggestions else ""
                print(f"  ✗ \"{raw}\" → no match{sugg_str}")
            elif rtype == "unavailable":
                print(f"  ✗ \"{raw}\" → {r['item']} unavailable  [{r.get('reason', '')}]")

    order = data.get("order", {})
    items = order.get("items", [])
    total = order.get("total", 0)
    if items:
        print(f"[Order] {len(items)} item(s)  total ₹{total}")


async def _recv_stt(ws: Any) -> None:
    async for msg in ws:
        if isinstance(msg, str):
            try:
                data = json.loads(msg)
            except json.JSONDecodeError:
                continue
            t = data.get("type", "")
            if t == "interim":
                print(f"\r[STT] {data.get('text', '')}    ", end="", flush=True)
            elif t == "final":
                print(f"\n[STT] Final: {data.get('text', '')}")
            elif t == "done":
                _print_turn_summary(data)
                break
            elif t == "error":
                print(f"\n[STT] Error: {data.get('message')}")
                break


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


async def run(base_url: str, restaurant_id: str, table_id: str) -> None:
    ws_url = base_url.replace("http://", "ws://").replace("https://", "wss://")

    print(f"Starting session — restaurant={restaurant_id} table={table_id}")
    session_id = start_session(base_url, restaurant_id, table_id)
    print(f"Session: {session_id}")

    stop_event = asyncio.Event()

    tts_task = asyncio.create_task(tts_loop(ws_url, session_id, stop_event))
    ptt_task = asyncio.create_task(ptt_loop(ws_url, session_id, stop_event))

    try:
        await asyncio.gather(tts_task, ptt_task)
    except asyncio.CancelledError:
        pass
    finally:
        stop_event.set()
        end_session(base_url, session_id)
        print("\nSession ended.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Voice CLI — Stage 3 PTT test harness")
    parser.add_argument("--url", default="http://localhost:8000", help="Backend base URL")
    parser.add_argument("--restaurant", default="roast-ccx-hyd", help="Restaurant ID")
    parser.add_argument("--table", default="T-01", help="Table ID")
    args = parser.parse_args(argv)

    try:
        asyncio.run(run(args.url, args.restaurant, args.table))
    except KeyboardInterrupt:
        print("\nInterrupted.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

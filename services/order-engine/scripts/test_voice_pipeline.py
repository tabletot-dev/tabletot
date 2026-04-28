"""Stage 3 integration test — WAV file injection.

Sends a pre-recorded WAV file through the full voice pipeline:
    WAV PCM → STT → Orchestrator → TTS → output audio file

Usage:
    # Against a running backend:
    python scripts/test_voice_pipeline.py data/conversation_tests/simple_order.wav

    # In-process (no running server needed) — default:
    python scripts/test_voice_pipeline.py data/conversation_tests/simple_order.wav --inprocess

Produces:
    output_audio.pcm  — raw PCM audio from TTS (play with: aplay -r 24000 -f S16_LE output_audio.pcm)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import struct
import sys
import wave
from pathlib import Path


# ---------------------------------------------------------------------------
# WAV helpers
# ---------------------------------------------------------------------------


def read_wav_pcm(path: Path) -> tuple[bytes, int]:
    """Read a WAV file and return (raw_pcm_bytes, sample_rate).

    The WAV must be 16-bit mono. Resampled to 16kHz if needed.
    """
    with wave.open(str(path), "rb") as wf:
        n_channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        framerate = wf.getframerate()
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)

    if sampwidth != 2:
        raise ValueError(f"WAV must be 16-bit PCM, got {sampwidth * 8}-bit")
    if n_channels != 1:
        # Simple stereo → mono downmix
        samples = struct.unpack(f"<{len(raw)//2}h", raw)
        mono = [
            (samples[i] + samples[i + 1]) // 2
            for i in range(0, len(samples) - 1, 2)
        ]
        raw = struct.pack(f"<{len(mono)}h", *mono)

    if framerate != 16000:
        import warnings
        warnings.warn(
            f"WAV sample rate {framerate} Hz — Sarvam STT expects 16000 Hz. "
            "Results may be degraded."
        )

    return raw, framerate


# ---------------------------------------------------------------------------
# In-process test (ASGI client, no running server needed)
# ---------------------------------------------------------------------------


async def run_inprocess(wav_path: Path, restaurant_id: str, table_id: str) -> bool:
    """Run the pipeline in-process using FastAPI's ASGI test interface."""
    import os
    from dotenv import load_dotenv
    load_dotenv()

    if not os.environ.get("SARVAM_API_KEY"):
        print("ERROR: SARVAM_API_KEY not set — set it in .env to run pipeline test")
        return False
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ERROR: ANTHROPIC_API_KEY not set — set it in .env to run pipeline test")
        return False

    from httpx import AsyncClient, ASGITransport
    from backend.main import app

    pcm_bytes, sample_rate = read_wav_pcm(wav_path)
    chunk_size = 3200  # 100ms at 16kHz × 2 bytes/sample = 3200 bytes
    chunks = [pcm_bytes[i : i + chunk_size] for i in range(0, len(pcm_bytes), chunk_size)]
    print(f"WAV: {wav_path.name} | {len(pcm_bytes)} bytes | {len(chunks)} chunks | {sample_rate} Hz")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Start session
        resp = await client.post(
            "/voice/session/start",
            json={"table_id": table_id, "restaurant_id": restaurant_id},
        )
        resp.raise_for_status()
        session_id = resp.json()["session_id"]
        print(f"Session started: {session_id}")

        # Connect to TTS WebSocket and collect audio in background
        tts_chunks: list[bytes] = []
        tts_done = asyncio.Event()
        transcript_result: list[str] = []
        response_result: list[str] = []

        async def run_tts_ws():
            async with client.websocket_connect(f"/voice/tts/{session_id}") as ws:
                while True:
                    msg = await ws.receive()
                    if msg["type"] == "websocket.receive":
                        data = msg.get("bytes")
                        text = msg.get("text")
                        if data:
                            tts_chunks.append(data)
                        elif text:
                            try:
                                parsed = json.loads(text)
                            except json.JSONDecodeError:
                                continue
                            if parsed.get("type") == "speech_complete":
                                print("[TTS] Speech complete.")
                                tts_done.set()
                                break
                            elif parsed.get("type") == "error":
                                print(f"[TTS] Error: {parsed.get('message')}")
                                tts_done.set()
                                break
                    elif msg["type"] in ("websocket.disconnect", "websocket.close"):
                        tts_done.set()
                        break

        tts_task = asyncio.create_task(run_tts_ws())

        # Small delay to let TTS WebSocket connect
        await asyncio.sleep(0.1)

        # Connect to STT WebSocket and stream WAV
        async with client.websocket_connect(f"/voice/stt/{session_id}") as ws:
            print(f"[STT] Sending {len(chunks)} audio chunks...")
            for chunk in chunks:
                await ws.send_bytes(chunk)

            # Send flush signal
            await ws.send_text(json.dumps({"type": "flush"}))
            print("[STT] Flush sent. Waiting for final transcript...")

            # Wait for done/final response
            while True:
                msg = await ws.receive()
                if msg["type"] == "websocket.receive":
                    text = msg.get("text")
                    if text:
                        try:
                            parsed = json.loads(text)
                        except json.JSONDecodeError:
                            continue
                        t = parsed.get("type")
                        if t == "interim":
                            print(f"\r[STT] Interim: {parsed.get('text', '')}    ", end="")
                        elif t == "final":
                            print(f"\n[STT] Final: {parsed.get('text', '')}")
                            transcript_result.append(parsed.get("text", ""))
                        elif t == "done":
                            response_text = parsed.get("response", "")
                            print(f"[Response] {response_text}")
                            response_result.append(response_text)
                            break
                        elif t == "error":
                            print(f"[STT] Error: {parsed.get('message')}")
                            break
                elif msg["type"] in ("websocket.disconnect", "websocket.close"):
                    break

        # Wait for TTS to complete (up to 15 seconds)
        try:
            await asyncio.wait_for(tts_done.wait(), timeout=15.0)
        except asyncio.TimeoutError:
            print("[TTS] Timeout waiting for speech_complete")

        tts_task.cancel()
        try:
            await tts_task
        except (asyncio.CancelledError, Exception):
            pass

        # End session
        await client.post("/voice/session/end", json={"session_id": session_id})

    # Save TTS output
    if tts_chunks:
        output_path = Path("output_audio.pcm")
        output_path.write_bytes(b"".join(tts_chunks))
        total_bytes = sum(len(c) for c in tts_chunks)
        duration_s = total_bytes / (24000 * 2)
        print(f"[TTS] Audio saved to {output_path} ({total_bytes} bytes, ~{duration_s:.1f}s)")
        print(f"      Play: aplay -r 24000 -f S16_LE {output_path}")
    else:
        print("[TTS] No audio chunks received")

    # Verify native script in response (Devanagari range: U+0900–U+097F)
    response_text = response_result[0] if response_result else ""
    has_devanagari = any("\u0900" <= c <= "\u097F" for c in response_text)
    has_telugu = any("\u0C00" <= c <= "\u0C7F" for c in response_text)
    if has_devanagari or has_telugu:
        print("[PASS] Response contains native script (no romanization)")
    elif response_text:
        print(f"[INFO] Response is in Roman script: {response_text!r}")

    success = bool(transcript_result and response_result)
    print(f"\n{'[PASS]' if success else '[FAIL]'} Pipeline test {'passed' if success else 'failed'}")
    return success


# ---------------------------------------------------------------------------
# Against running server
# ---------------------------------------------------------------------------


async def run_remote(
    wav_path: Path,
    base_url: str,
    restaurant_id: str,
    table_id: str,
) -> bool:
    """Run the pipeline against a running backend server."""
    import httpx
    import websockets

    pcm_bytes, _ = read_wav_pcm(wav_path)
    chunk_size = 3200
    chunks = [pcm_bytes[i : i + chunk_size] for i in range(0, len(pcm_bytes), chunk_size)]
    print(f"WAV: {wav_path.name} | {len(pcm_bytes)} bytes | {len(chunks)} chunks")

    ws_base = base_url.replace("http://", "ws://").replace("https://", "wss://")

    async with httpx.AsyncClient(base_url=base_url, timeout=10) as client:
        resp = await client.post(
            "/voice/session/start",
            json={"table_id": table_id, "restaurant_id": restaurant_id},
        )
        resp.raise_for_status()
        session_id = resp.json()["session_id"]
        print(f"Session: {session_id}")

    tts_chunks: list[bytes] = []
    tts_done = asyncio.Event()
    transcript_result: list[str] = []
    response_result: list[str] = []

    async def collect_tts():
        async with websockets.connect(f"{ws_base}/voice/tts/{session_id}") as ws:
            async for msg in ws:
                if isinstance(msg, bytes):
                    tts_chunks.append(msg)
                elif isinstance(msg, str):
                    try:
                        data = json.loads(msg)
                    except json.JSONDecodeError:
                        continue
                    if data.get("type") == "speech_complete":
                        tts_done.set()
                        break

    tts_task = asyncio.create_task(collect_tts())
    await asyncio.sleep(0.2)

    async with websockets.connect(f"{ws_base}/voice/stt/{session_id}") as ws:
        for chunk in chunks:
            await ws.send(chunk)
        await ws.send(json.dumps({"type": "flush"}))

        async for msg in ws:
            if isinstance(msg, str):
                try:
                    data = json.loads(msg)
                except json.JSONDecodeError:
                    continue
                t = data.get("type")
                if t == "interim":
                    print(f"\r[STT] {data.get('text', '')}    ", end="")
                elif t == "final":
                    print(f"\n[STT] Final: {data.get('text', '')}")
                    transcript_result.append(data.get("text", ""))
                elif t == "done":
                    print(f"[Response] {data.get('response', '')}")
                    response_result.append(data.get("response", ""))
                    break

    try:
        await asyncio.wait_for(tts_done.wait(), timeout=15.0)
    except asyncio.TimeoutError:
        print("[TTS] Timeout")

    tts_task.cancel()
    try:
        await tts_task
    except (asyncio.CancelledError, Exception):
        pass

    async with httpx.AsyncClient(base_url=base_url, timeout=5) as client:
        await client.post("/voice/session/end", json={"session_id": session_id})

    if tts_chunks:
        output_path = Path("output_audio.pcm")
        output_path.write_bytes(b"".join(tts_chunks))
        print(f"[TTS] Audio saved: {output_path}")

    success = bool(transcript_result and response_result)
    print(f"\n{'[PASS]' if success else '[FAIL]'} Pipeline test {'passed' if success else 'failed'}")
    return success


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Stage 3 voice pipeline integration test"
    )
    parser.add_argument(
        "wav",
        type=Path,
        help="Path to WAV file (16-bit mono, 16kHz recommended)",
    )
    parser.add_argument(
        "--url",
        default="http://localhost:8000",
        help="Backend URL (ignored with --inprocess)",
    )
    parser.add_argument(
        "--restaurant",
        default="roast-ccx-hyd",
        help="Restaurant ID",
    )
    parser.add_argument(
        "--table",
        default="T-01",
        help="Table ID",
    )
    parser.add_argument(
        "--inprocess",
        action="store_true",
        default=False,
        help="Run in-process using ASGI test client (no running server needed)",
    )
    args = parser.parse_args(argv)

    if not args.wav.exists():
        print(f"ERROR: WAV file not found: {args.wav}")
        return 1

    if args.inprocess:
        success = asyncio.run(
            run_inprocess(args.wav, args.restaurant, args.table)
        )
    else:
        success = asyncio.run(
            run_remote(args.wav, args.url, args.restaurant, args.table)
        )

    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

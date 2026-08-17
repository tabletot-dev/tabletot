"""ElevenLabs STT/TTS smoke test — talks to the real ElevenLabs API directly.

No backend server, no LLM, no DB needed. Tests only the two new handler
classes (voice_agent/elevenlabs_stt_handler.py, elevenlabs_tts_handler.py)
against the live API. This is the Task 2 "live smoke test" from
docs/plans/2026-08-15-elevenlabs-voice-integration.md — specifically
confirming the TTS WebSocket returns real PCM at output_format=pcm_24000
and not MP3-in-disguise (elevenlabs-python#251).

Usage:
    # TTS only (default) — synthesizes a test sentence, saves PCM, checks format
    python scripts/smoke_test_elevenlabs.py

    # STT + TTS — also transcribes a WAV file through ElevenLabsSTTHandler
    python scripts/smoke_test_elevenlabs.py --wav data/conversation_tests/my_recording.wav

Requires ELEVENLABS_API_KEY in .env.

Output:
    elevenlabs_tts_smoke_output.pcm — raw bytes from the TTS WebSocket.
    Play with: ffplay -f s16le -ar 24000 -ac 1 elevenlabs_tts_smoke_output.pcm
           or: aplay -r 24000 -f S16_LE elevenlabs_tts_smoke_output.pcm
"""

from __future__ import annotations

import argparse
import asyncio
import os
import struct
import wave
from pathlib import Path

from dotenv import load_dotenv

# Adam — the plan's placeholder primary voice (decision 5).
_DEFAULT_VOICE_ID = "pNInz6obpgDQGcFmaJgB"
_DEFAULT_TEXT = "नमस्ते, आपका स्वागत है।"  # "Hello, welcome" — checks Hindi + native script


def read_wav_pcm(path: Path) -> bytes:
    """Read a 16-bit mono WAV file and return raw PCM bytes. No resampling."""
    with wave.open(str(path), "rb") as wf:
        n_channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        framerate = wf.getframerate()
        raw = wf.readframes(wf.getnframes())

    if sampwidth != 2:
        raise ValueError(f"WAV must be 16-bit PCM, got {sampwidth * 8}-bit")
    if n_channels != 1:
        samples = struct.unpack(f"<{len(raw)//2}h", raw)
        mono = [(samples[i] + samples[i + 1]) // 2 for i in range(0, len(samples) - 1, 2)]
        raw = struct.pack(f"<{len(mono)}h", *mono)
    if framerate != 16000:
        print(f"WARNING: WAV is {framerate}Hz — Scribe v2 Realtime expects 16000Hz. Results may be degraded.")

    return raw


class _FakeClientWS:
    """Stands in for FastAPI's WebSocket — feeds WAV chunks, then a flush signal.

    Same message shape ElevenLabsSTTHandler already expects from the real
    kiosk client, so no changes to the handler are needed to test it here.
    """

    def __init__(self, pcm_chunks: list[bytes]) -> None:
        import json
        self._json = json
        self._messages = [
            {"type": "websocket.receive", "bytes": c, "text": None} for c in pcm_chunks
        ] + [{"type": "websocket.receive", "bytes": None, "text": json.dumps({"type": "flush"})}]
        self._i = 0

    async def receive(self) -> dict:
        msg = self._messages[self._i]
        self._i += 1
        return msg

    async def send_json(self, data: dict) -> None:
        t = data.get("type")
        if t == "interim":
            print(f"\r[STT interim] {data.get('text', '')}    ", end="", flush=True)
        elif t == "final":
            print(f"\n[STT final]   {data.get('text', '')}")
        elif t == "error":
            print(f"\n[STT error]   {data.get('message', '')}")


def _looks_like_mp3(data: bytes) -> bool:
    """True if the byte header matches MP3 (ID3 tag or an MPEG frame sync)."""
    if data[:3] == b"ID3":
        return True
    if len(data) >= 2 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0:
        return True
    return False


async def run_stt(api_key: str, wav_path: Path) -> None:
    from voice_agent.elevenlabs_stt_handler import ElevenLabsSTTHandler

    pcm = read_wav_pcm(wav_path)
    chunk_size = 3200  # 100ms at 16kHz x 2 bytes/sample
    chunks = [pcm[i : i + chunk_size] for i in range(0, len(pcm), chunk_size)]
    print(f"[STT] {wav_path.name}: {len(pcm)} bytes, {len(chunks)} chunks")

    handler = ElevenLabsSTTHandler(api_key=api_key)
    client_ws = _FakeClientWS(chunks)
    transcript = await handler.transcribe_session(client_ws)  # type: ignore[arg-type]

    print(f"\n[STT] Result: {transcript!r}")
    print(f"[STT] {'PASS' if transcript else 'FAIL'} — {'got a transcript' if transcript else 'no transcript returned'}")


async def run_tts(api_key: str, text: str, voice_id: str) -> None:
    from voice_agent.elevenlabs_tts_handler import ElevenLabsTTSHandler

    handler = ElevenLabsTTSHandler(api_key=api_key)
    await handler.configure(language_code="hi-IN", speaker=voice_id)

    chunks: list[bytes] = []
    async for chunk in handler.speak(text):
        chunks.append(chunk)
    await handler.close()

    audio = b"".join(chunks)
    output_path = Path("elevenlabs_tts_smoke_output.pcm")
    output_path.write_bytes(audio)

    print(f"[TTS] Text: {text!r}")
    print(f"[TTS] Received {len(audio)} bytes across {len(chunks)} chunk(s)")
    print(f"[TTS] Saved to {output_path}")

    if not audio:
        print("[TTS] FAIL — no audio bytes received")
        return

    if _looks_like_mp3(audio):
        print("[TTS] FAIL — output looks like MP3, not raw PCM (elevenlabs-python#251).")
        print("      Do NOT add an MP3 decoder as a workaround — stop and flag back")
        print("      per docs/plans/2026-08-15-elevenlabs-voice-integration.md, Task 2.")
    else:
        duration_s = len(audio) / (24000 * 2)  # 16-bit mono @ 24kHz
        print(f"[TTS] PASS — output looks like raw PCM (~{duration_s:.1f}s of audio at 24kHz).")
        print(f"      Play: ffplay -f s16le -ar 24000 -ac 1 {output_path}")


def main() -> int:
    parser = argparse.ArgumentParser(description="ElevenLabs STT/TTS live smoke test")
    parser.add_argument("--wav", type=Path, default=None, help="WAV file to transcribe (16-bit, mono, 16kHz recommended). Skips STT if omitted.")
    parser.add_argument("--text", default=_DEFAULT_TEXT, help="Text to synthesize for the TTS check.")
    parser.add_argument("--voice-id", default=_DEFAULT_VOICE_ID, help="ElevenLabs voice_id to use for TTS.")
    args = parser.parse_args()

    load_dotenv()
    api_key = os.environ.get("ELEVENLABS_API_KEY", "")
    if not api_key:
        print("ERROR: ELEVENLABS_API_KEY not set — add it to services/order-engine/.env")
        return 1

    if args.wav is not None:
        if not args.wav.exists():
            print(f"ERROR: WAV file not found: {args.wav}")
            return 1
        asyncio.run(run_stt(api_key, args.wav))
        print()

    asyncio.run(run_tts(api_key, args.text, args.voice_id))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

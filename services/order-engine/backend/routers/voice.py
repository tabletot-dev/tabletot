"""FastAPI voice router — Stage 3.

Endpoints:
  GET  /voice/health
  POST /voice/session/start
  POST /voice/session/end
  WS   /voice/stt/{session_id}   — per PTT press
  WS   /voice/tts/{session_id}   — persistent per session
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime

import ssl

import certifi
import websockets
from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

_SSL_CTX = ssl.create_default_context(cafile=certifi.where())

from src.models import Ambiguous, ConfidentMatch, NeedsVariantSelection, NoMatch, Unavailable
from src.orchestrator import ResolverCall
from voice_agent.session_manager import SessionManager
from voice_agent.stt_handler import SarvamSTTHandler

logger = logging.getLogger(__name__)

router = APIRouter()

_SARVAM_STT_HEALTH_URL = (
    "wss://api.sarvam.ai/speech-to-text/ws"
    "?model=saaras:v3"
    "&language-code=unknown"
    "&mode=transcribe"
)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@router.get("/health")
async def health(request: Request) -> dict:
    """Check Sarvam API connectivity."""
    mgr: SessionManager = request.app.state.session_manager
    sarvam_api_key = mgr._sarvam_api_key
    try:
        async with websockets.connect(
            _SARVAM_STT_HEALTH_URL,
            additional_headers={"api-subscription-key": sarvam_api_key},
            open_timeout=3,
            ssl=_SSL_CTX,
        ):
            pass
        return {"status": "ok", "sarvam": "reachable"}
    except Exception as e:
        return {"status": "degraded", "sarvam": "unreachable", "error": str(e)}


# ---------------------------------------------------------------------------
# Session management
# ---------------------------------------------------------------------------


class SessionStartRequest(BaseModel):
    table_id: str
    restaurant_id: str
    client_session_id: str | None = None


class SessionEndRequest(BaseModel):
    session_id: str


@router.post("/session/start")
async def session_start(body: SessionStartRequest, request: Request) -> dict:
    from fastapi import HTTPException

    mgr: SessionManager = request.app.state.session_manager
    try:
        session = await mgr.create_session(body.table_id, body.restaurant_id, body.client_session_id)
    except KeyError:
        raise HTTPException(
            status_code=404,
            detail=f"Restaurant '{body.restaurant_id}' not found in config",
        )
    except Exception as e:
        logger.exception("Failed to create session")
        raise HTTPException(status_code=500, detail=str(e))
    return {"session_id": session.session_id}


@router.post("/session/end")
async def session_end(body: SessionEndRequest, request: Request) -> dict:
    mgr: SessionManager = request.app.state.session_manager
    await mgr.end_session(body.session_id)
    return {"status": "ended"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _serialize_resolver_results(calls: list[ResolverCall]) -> list[dict]:
    """Convert ResolverCall list to JSON-serializable dicts for the CLI."""
    out = []
    for call in calls:
        r = call.result
        if isinstance(r, ConfidentMatch):
            out.append({
                "raw": call.raw_name,
                "type": "match",
                "item": r.item_name,
                "method": r.match_method,
                "score": round(r.score, 1),
                "applied": call.applied_to_order,
            })
        elif isinstance(r, NeedsVariantSelection):
            out.append({
                "raw": call.raw_name,
                "type": "needs_variant",
                "item": r.group_name,
                "variants": [v.name for v in r.variants],
            })
        elif isinstance(r, Ambiguous):
            out.append({
                "raw": call.raw_name,
                "type": "ambiguous",
                "candidates": [
                    c.item_name if isinstance(c, ConfidentMatch) else c.group_name
                    for c in r.candidates
                ],
            })
        elif isinstance(r, NoMatch):
            out.append({
                "raw": call.raw_name,
                "type": "no_match",
                "suggestions": [name for name, _ in r.suggestions[:3]],
            })
        elif isinstance(r, Unavailable):
            out.append({
                "raw": call.raw_name,
                "type": "unavailable",
                "item": r.item_name,
                "reason": r.reason,
            })
    return out


# ---------------------------------------------------------------------------
# STT WebSocket — per PTT press
# ---------------------------------------------------------------------------


def _apply_cart_sync(session: "VoiceSession", items: list[dict]) -> None:  # type: ignore[name-defined]
    """Replace backend order state with the current kiosk touch cart.

    Each item carries {id, name, qty, price}. We resolve the display name
    against the menu index to get the canonical item_id (petpooja external_id)
    so that subsequent voice removals/modifications find the right entry.
    Falls back to a slugified name when the resolver can't match.
    """
    from src.models import ConfidentMatch
    from src.resolver import resolve

    session.orchestrator.order_state.clear()
    for item in items:
        name: str = item.get("name", "")
        qty: int = int(item.get("qty", 1))
        price: int = int(item.get("price", 0))
        if not name:
            continue
        result = resolve(name, session.orchestrator.menu_index, datetime.now())
        if isinstance(result, ConfidentMatch):
            session.orchestrator.order_state.add_item(
                item_id=result.item_id,
                item_name=result.item_name,
                quantity=qty,
                unit_price=result.price or price,
                category=result.category,
            )
        else:
            # Resolver couldn't match — use slugified name so LLM still sees the item
            session.orchestrator.order_state.add_item(
                item_id=name.lower().replace(" ", "_"),
                item_name=name,
                quantity=qty,
                unit_price=price,
                category="",
            )


@router.websocket("/stt/{session_id}")
async def voice_stt(ws: WebSocket, session_id: str) -> None:
    """Per PTT press: proxy audio to Sarvam STT, return transcripts."""
    mgr: SessionManager = ws.app.state.session_manager
    session = mgr.get_session(session_id)

    await ws.accept()

    if session is None:
        await ws.send_json({"type": "error", "message": "Session not found"})
        await ws.close(code=4004)
        return

    # Fix A: accept one optional cart_sync JSON message before audio starts.
    # 500 ms timeout — if nothing arrives (or first frame is already binary audio)
    # we proceed without syncing and the backend order state is unchanged.
    try:
        raw = await asyncio.wait_for(ws.receive(), timeout=0.5)
        if raw.get("type") == "websocket.receive" and raw.get("text"):
            try:
                parsed = json.loads(raw["text"])
                if parsed.get("type") == "cart_sync":
                    _apply_cart_sync(session, parsed.get("items", []))
                    logger.info(
                        "cart_sync applied: %d item(s) session=%s",
                        len(parsed.get("items", [])),
                        session_id,
                    )
            except (json.JSONDecodeError, Exception):
                pass
        # If first frame is binary audio we consumed it — acceptable; Sarvam
        # handles a small amount of missing audio at the start without issue.
    except asyncio.TimeoutError:
        pass

    stt_handler = SarvamSTTHandler(mgr._sarvam_api_key)

    try:
        final_transcript = await stt_handler.transcribe_session(ws)
    except Exception as e:
        logger.exception("STT proxy error for session %s", session_id)
        await ws.send_json({"type": "error", "message": str(e)})
        return

    if final_transcript:
        try:
            result = await asyncio.to_thread(
                session.orchestrator.process_turn,
                final_transcript,
                datetime.now(),
            )
            response_text = result.llm_response.response_text
        except Exception as e:
            logger.exception("Orchestrator error for session %s", session_id)
            await ws.send_json({"type": "error", "message": str(e)})
            return

        # Hand off to TTS endpoint via the session queue
        await session.tts_queue.put(response_text)

        done_message = {
            "type": "done",
            "transcript": final_transcript,
            "response": response_text,
            "resolver": _serialize_resolver_results(result.resolver_results),
            "order": result.order_state_snapshot,
            "client_session_id": session.client_session_id,
        }
        try:
            await ws.send_json(done_message)
        except (WebSocketDisconnect, RuntimeError):
            # Client disconnected before done — log and move on
            logger.warning("STT done message lost — client disconnected session=%s", session_id)
        logger.info(
            "STT turn complete session=%s transcript=%r",
            session_id,
            final_transcript[:60],
        )
    else:
        # Sarvam returned no transcript (silence, timeout, or empty audio).
        # Signal the client so it can reset the PTT button.
        logger.info("STT no speech detected session=%s", session_id)
        try:
            await ws.send_json({"type": "no_speech"})
        except (WebSocketDisconnect, RuntimeError):
            pass  # Client already gone, nothing to do


# ---------------------------------------------------------------------------
# TTS WebSocket — persistent per session
# ---------------------------------------------------------------------------


@router.websocket("/tts/{session_id}")
async def voice_tts(ws: WebSocket, session_id: str) -> None:
    """Persistent per-session: stream TTS audio back to client."""
    mgr: SessionManager = ws.app.state.session_manager
    session = mgr.get_session(session_id)

    await ws.accept()

    if session is None:
        await ws.send_json({"type": "error", "message": "Session not found"})
        await ws.close(code=4004)
        return

    # Lazy TTS init — connect to Sarvam on first client WS connection
    if not session.tts_handler.is_configured:
        config = mgr.get_restaurant_config(session)
        try:
            await session.tts_handler.configure(config.language_code, config.speaker)
            session.tts_handler.start_keepalive()
            logger.info("TTS configured for session %s", session_id)
        except Exception as e:
            logger.exception("TTS configure failed session=%s", session_id)
            await ws.send_json({"type": "error", "message": f"TTS init failed: {e}"})
            return

    try:
        while True:
            # Wait for the next response text queued by the STT endpoint
            text = await session.tts_queue.get()

            if text is None:
                # Shutdown sentinel put by end_session()
                break

            try:
                async for audio_chunk in session.tts_handler.speak(text):
                    try:
                        await ws.send_bytes(audio_chunk)
                    except (WebSocketDisconnect, RuntimeError):
                        logger.info("TTS client disconnected during audio stream session=%s", session_id)
                        break
                else:
                    try:
                        await ws.send_json({"type": "speech_complete"})
                        logger.debug("TTS speech_complete for session %s", session_id)
                    except (WebSocketDisconnect, RuntimeError):
                        logger.info("TTS client disconnected before speech_complete session=%s", session_id)
                        break
            except Exception as e:
                logger.exception("TTS speak error session=%s", session_id)
                try:
                    await ws.send_json({"type": "error", "message": str(e)})
                except (WebSocketDisconnect, RuntimeError):
                    logger.info("TTS client disconnected before error message session=%s", session_id)

    except WebSocketDisconnect:
        logger.info("TTS client disconnected: session=%s", session_id)
    except Exception:
        logger.exception("TTS loop error session=%s", session_id)

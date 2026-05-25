import { useCallback, useEffect, useRef, useState } from "react";
import { endSession, startSession } from "./api";
import { openTtsClient, unlockAudioContext, type TtsClientHandle } from "./ttsClient";
import { startSttPress, type SttPressHandle } from "./sttClient";
import type { OrderSnapshot, ResolverCall, SttMessage, TtsMessage } from "./types";

type PageStatus = "idle" | "starting" | "active" | "ending";
type PressStatus = "idle" | "pressing" | "processing";

export default function App() {
  const [tableId, setTableId] = useState("T-01");
  const [restaurantId, setRestaurantId] = useState("silver-ssc-hyd");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pageStatus, setPageStatus] = useState<PageStatus>("idle");
  const [pressStatus, setPressStatus] = useState<PressStatus>("idle");

  const [interim, setInterim] = useState("");
  const [finalText, setFinalText] = useState("");
  const [response, setResponse] = useState("");
  const [resolver, setResolver] = useState<ResolverCall[]>([]);
  const [order, setOrder] = useState<OrderSnapshot | null>(null);
  const [speech, setSpeech] = useState<"idle" | "speaking">("idle");
  const [errors, setErrors] = useState<string[]>([]);

  const ttsRef = useRef<TtsClientHandle | null>(null);
  const sttRef = useRef<SttPressHandle | null>(null);
  const pressStatusRef = useRef<PressStatus>("idle");
  const pageStatusRef = useRef<PageStatus>("idle");

  useEffect(() => {
    pressStatusRef.current = pressStatus;
  }, [pressStatus]);
  useEffect(() => {
    pageStatusRef.current = pageStatus;
  }, [pageStatus]);

  const addError = (msg: string) => setErrors((prev) => [...prev, msg]);

  const handleTtsMessage = useCallback((msg: TtsMessage) => {
    if (msg.type === "error") addError(`TTS: ${msg.message}`);
  }, []);

  const handleSttMessage = useCallback((msg: SttMessage) => {
    switch (msg.type) {
      case "speech_start":
        setSpeech("speaking");
        break;
      case "speech_end":
        setSpeech("idle");
        break;
      case "interim":
        setInterim(msg.text);
        break;
      case "final":
        setFinalText(msg.text);
        setInterim("");
        break;
      case "done":
        setFinalText(msg.transcript);
        setInterim("");
        setResponse(msg.response);
        setResolver(msg.resolver);
        setOrder(msg.order);
        setPressStatus("idle");
        break;
      case "no_speech":
        setFinalText("Didn't catch that — try again");
        setInterim("");
        setPressStatus("idle");
        setTimeout(() => setFinalText((prev) => prev === "Didn't catch that — try again" ? "" : prev), 2500);
        break;
      case "error":
        addError(`STT: ${msg.message}`);
        setPressStatus("idle");
        break;
    }
  }, []);

  const handleStart = async () => {
    setErrors([]);
    setPageStatus("starting");
    try {
      await unlockAudioContext();
      const id = await startSession(tableId, restaurantId);
      setSessionId(id);
      ttsRef.current = openTtsClient(id, handleTtsMessage);
      setPageStatus("active");
    } catch (e) {
      addError(e instanceof Error ? e.message : String(e));
      setPageStatus("idle");
    }
  };

  const handleEnd = async () => {
    setPageStatus("ending");
    try {
      sttRef.current?.stop();
      ttsRef.current?.close();
      sttRef.current = null;
      ttsRef.current = null;
      if (sessionId) await endSession(sessionId);
    } catch (e) {
      addError(e instanceof Error ? e.message : String(e));
    } finally {
      setSessionId(null);
      setPageStatus("idle");
      setPressStatus("idle");
      setInterim("");
      setFinalText("");
      setResponse("");
      setResolver([]);
      setOrder(null);
      setSpeech("idle");
    }
  };

  const startPress = useCallback(async () => {
    if (pageStatusRef.current !== "active") return;
    if (pressStatusRef.current !== "idle") return;
    if (!sessionId) return;
    // Stop any TTS audio that's still playing before opening the mic.
    ttsRef.current?.bargeIn();
    setPressStatus("pressing");
    setInterim("");
    setFinalText("");
    try {
      const handle = await startSttPress(sessionId, handleSttMessage);
      sttRef.current = handle;
    } catch (e) {
      addError(e instanceof Error ? e.message : String(e));
      setPressStatus("idle");
    }
  }, [sessionId, handleSttMessage]);

  const stopPress = useCallback(async () => {
    if (pressStatusRef.current !== "pressing") return;
    setPressStatus("processing");
    try {
      await sttRef.current?.stop();
    } catch (e) {
      addError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      e.preventDefault();
      void startPress();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      e.preventDefault();
      void stopPress();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [startPress, stopPress]);

  useEffect(() => {
    const onUnload = () => {
      sttRef.current?.stop();
      ttsRef.current?.close();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  const pttDisabled = pageStatus !== "active" || pressStatus === "processing";
  const pttLabel =
    pressStatus === "pressing"
      ? speech === "speaking"
        ? "Listening… (speaking)"
        : "Listening…"
      : pressStatus === "processing"
        ? "Processing…"
        : "Hold to speak (Space)";

  return (
    <div className="page">
      <header>
        <h1>Voice pipeline test</h1>
        <span className={`badge badge-${pageStatus}`}>{pageStatus}</span>
      </header>

      <section className="config">
        <label>
          <span>Table ID</span>
          <input
            value={tableId}
            onChange={(e) => setTableId(e.target.value)}
            disabled={pageStatus !== "idle"}
          />
        </label>
        <label>
          <span>Restaurant ID</span>
          <input
            value={restaurantId}
            onChange={(e) => setRestaurantId(e.target.value)}
            disabled={pageStatus !== "idle"}
          />
        </label>
        {pageStatus === "idle" || pageStatus === "starting" ? (
          <button onClick={handleStart} disabled={pageStatus === "starting"}>
            {pageStatus === "starting" ? "Starting…" : "Start session"}
          </button>
        ) : (
          <button onClick={handleEnd} disabled={pageStatus === "ending"}>
            {pageStatus === "ending" ? "Ending…" : "End session"}
          </button>
        )}
        {sessionId && <code className="session-id">{sessionId}</code>}
      </section>

      <section className="ptt">
        <button
          className={`ptt-button ptt-${pressStatus}`}
          disabled={pttDisabled}
          onMouseDown={startPress}
          onMouseUp={stopPress}
          onMouseLeave={stopPress}
          onTouchStart={(e) => {
            e.preventDefault();
            void startPress();
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            void stopPress();
          }}
        >
          {pttLabel}
        </button>
      </section>

      <section className="pane">
        <h2>Transcript</h2>
        <div className="transcript">
          {finalText && <div className="final">{finalText}</div>}
          {interim && <div className="interim">{interim}</div>}
          {!finalText && !interim && <div className="empty">—</div>}
        </div>
      </section>

      <section className="pane">
        <h2>LLM response</h2>
        <div className="response">{response || <span className="empty">—</span>}</div>
      </section>

      <section className="pane">
        <h2>Resolver</h2>
        {resolver.length === 0 ? (
          <div className="empty">—</div>
        ) : (
          <ul className="resolver">
            {resolver.map((r, i) => (
              <li key={i} className={`row row-${r.type}`}>
                <ResolverRow call={r} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="pane">
        <h2>Order</h2>
        {order && order.items.length > 0 ? (
          <div className="order">
            <ul>
              {order.items.map((item, i) => (
                <li key={i}>
                  {item.quantity} × {item.item_name} @ ₹{item.unit_price} = ₹
                  {item.line_total}
                  {item.modifiers.length > 0 && (
                    <span className="mods"> — {item.modifiers.join(", ")}</span>
                  )}
                  {item.special_notes && (
                    <span className="notes"> ({item.special_notes})</span>
                  )}
                </li>
              ))}
            </ul>
            <div className="total">
              {order.item_count} item(s) · total ₹{order.total}
            </div>
          </div>
        ) : (
          <div className="empty">—</div>
        )}
      </section>

      {errors.length > 0 && (
        <section className="errors">
          <h2>Errors</h2>
          <ul>
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <button onClick={() => setErrors([])}>clear</button>
        </section>
      )}
    </div>
  );
}

function ResolverRow({ call }: { call: ResolverCall }) {
  switch (call.type) {
    case "match":
      return (
        <>
          <span className="glyph">{call.applied ? "+" : "!"}</span>
          <span className="raw">"{call.raw}"</span>
          <span className="arrow">→</span>
          <span className="item">{call.item}</span>
          <span className="meta">
            [{call.method}, {call.score}]
          </span>
        </>
      );
    case "needs_variant":
      return (
        <>
          <span className="glyph">?</span>
          <span className="raw">"{call.raw}"</span>
          <span className="arrow">→</span>
          <span className="item">{call.item}</span>
          <span className="meta">needs variant [{call.variants.join(", ")}]</span>
        </>
      );
    case "ambiguous":
      return (
        <>
          <span className="glyph">?</span>
          <span className="raw">"{call.raw}"</span>
          <span className="arrow">→</span>
          <span className="meta">ambiguous [{call.candidates.join(", ")}]</span>
        </>
      );
    case "no_match":
      return (
        <>
          <span className="glyph">✗</span>
          <span className="raw">"{call.raw}"</span>
          <span className="arrow">→</span>
          <span className="meta">
            no match
            {call.suggestions.length > 0 && ` suggestions: [${call.suggestions.join(", ")}]`}
          </span>
        </>
      );
    case "unavailable":
      return (
        <>
          <span className="glyph">✗</span>
          <span className="raw">"{call.raw}"</span>
          <span className="arrow">→</span>
          <span className="item">{call.item}</span>
          <span className="meta">unavailable ({call.reason})</span>
        </>
      );
  }
}

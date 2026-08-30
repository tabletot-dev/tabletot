# Voice Channel Redesign — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. Execute one
> task at a time, in order. Every task ends with a passing `pnpm --dir
> apps/kiosk test` run and a commit. Do not start Task N+1 until Task N is
> committed and green. REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`
> (fresh subagent per task) or `superpowers:executing-plans` (inline, batched).

**Goal:** Rebuild the kiosk voice channel (handoff screens 06 Listening /
07 Recommendation / 08 Informational) to the v1.0 design system and the three
client mockups, without touching the frozen voice pipeline.

**Architecture:** A derived `voicePhase` (`dock` | `answer` | `closed`) selects
between a bottom-docked recording overlay (06, menu visible behind) and a
full-screen conversation view (07/08, new `"voice-conversation"` `ScreenType`).
`VoiceConversationPanel` stays mounted as the host of all frozen STT/TTS code
and lifts `handleToggle` + `pressStatus` up to `Index.tsx`. New presentational
components + one read-only `useMicLevels` audio hook. The dead `ListeningScreen`
is deleted.

**Tech Stack:** React 18 + Vite + TS, vanilla CSS
(`apps/kiosk/src/styles/tabletot.css`), framer-motion, vitest +
@testing-library/react. Package manager **pnpm**. Dev port **8080**.

**Spec:** `docs/plans/2026-08-30-voice-channel-redesign-spec.md` — read it
alongside this plan.

## Global Constraints

Every task implicitly includes this section.

**FROZEN — never edit, in any task:**
- anything in `apps/kiosk/src/lib/voice/*`
- `handleVoiceDone` in `apps/kiosk/src/pages/Index.tsx`
- inside `VoiceConversationPanel.tsx` / `VoiceOrderButton.tsx`: the
  `startSession` / `openTtsClient` / `startSttPress` call sequence,
  `handleSttMessage`, the `handleToggle` recording state machine, every `useRef`,
  and `ttsHandle.bargeIn()`. Additive props and JSX restructuring around this
  logic are allowed; changing the logic, refs, or call order is not.

**Design tokens — exact, from `src/styles/tokens.css`:** `--tt-ink #111310`,
`--tt-ink-60 #43483F`, `--tt-action #F36C31` (fill only, white label),
`--tt-action-press #D95A22`, `--tt-paper #FFFFFF`, `--tt-field #EDECE6`,
`--tt-line #C9C7BF`, `--tt-disabled #8A8E87`, `--tt-veg #0E7A3C`,
`--tt-on-dark #E7E5DE`, `--tt-on-dark-70 #CFCCC4`, `--tt-line-dark #6A6E67`.
Type: `--tt-font-display` (Sora) / `--tt-font-text` (Manrope);
`--tt-size-{display,heading,dish,cta,body,meta}`. Spacing `--tt-space-1..7` =
8/12/16/24/32/48/64. Radii 8/12/18/999 = `--tt-radius-{badge,chip,card,pill}`.
Elevation: **2px solid border only. Zero `box-shadow`. Zero `backdrop-filter`.**
Every colour is a `var(--tt-*)` — no raw hex.

**Data — build only what exists** (`MenuItem = {id,name,price,category,tags[],
is_veg,description?,image?}`; `Turn = {role,text,matchedItems?}`): no macro row
(08), no dish meta line (07). Not drawn.

**Chips:** presentational. `"Add both"` (07 rec only) → `onAddItem` for each
matched item. Every other chip → `onRequestSpeak()` (starts a capture → 06). No
pipeline or backend edit.

**Branch:** `kiosk-v1-sprint-6-7`. Do not push.

---

## File Structure

**New:**
| File | Responsibility |
|---|---|
| `src/hooks/useMicLevels.ts` | Read-only `AnalyserNode` → `{levels:number[], rms:number}` for the waveform. Second mic stream, never feeds STT. |
| `src/hooks/__tests__/useMicLevels.test.ts` | |
| `src/components/voice/EarlierStrip.tsx` | Collapsed-history one-liner; `light`/`dark` variant; tap → `onExpand`. |
| `src/components/voice/__tests__/EarlierStrip.test.tsx` | |
| `src/components/voice/VoiceAnswerCard.tsx` | Ink-header composite card. `rec` (dish rows) / `info` (text + footnote) variant. |
| `src/components/voice/__tests__/VoiceAnswerCard.test.tsx` | |
| `src/components/voice/VoiceDockPanel.tsx` | Screen 06 — bottom overlay: status row, `EarlierStrip`, waveform, live transcript, chips. |
| `src/components/voice/__tests__/VoiceDockPanel.test.tsx` | |
| `src/components/voice/VoiceConversationScreen.tsx` | Screens 07/08 — full-screen shell: header, `EarlierStrip`, `YOU SAID` cards, `VoiceAnswerCard`, speak-dock. |
| `src/components/voice/__tests__/VoiceConversationScreen.test.tsx` | |

**Rewritten:**
| File | Change |
|---|---|
| `src/components/VoiceConversationPanel.tsx` | Keeps ALL frozen code. New props: `onPressStatusChange`, `onToggleRef` (or a render-prop) to lift `handleToggle`/`pressStatus`. Renders `VoiceDockPanel` when `voicePhase === "dock"`, `null` otherwise. Old JSX (`.tt-voice-conversation-*`, `.tt-voice-chat-*`, `.tt-voice-recommendation-*`, `.tt-voice-frequency-meter`, `.tt-voice-stop-btn`) removed. |

**Modified:**
| File | Change |
|---|---|
| `src/pages/Index.tsx` | Derive `voicePhase`; add `case "voice-conversation"`; place `VoiceConversationPanel` as an always-mounted host on the menu; wire the lifted toggle to `VoiceConversationScreen`. |
| `src/hooks/useDeviceNavigation.ts` | `ScreenType`: `+ "voice-conversation"`, `- "listening"`. |
| `src/styles/tabletot.css` | New `.tt-voice-dock-*`, `.tt-voice-convo-*`, `.tt-voice-answer-*`, `.tt-voice-earlier-*`, `.tt-voice-wave-*` blocks in the `.tt-*` section. Delete the old `.tt-voice-conversation-*`, `.tt-voice-chat-*`, `.tt-voice-recommendation-*`, `.tt-voice-prompt-grid`, `.tt-voice-frequency-meter`, `.tt-voice-input-status`, `.tt-voice-live-dot`, `.tt-voice-stop-btn`, `.tt-voice-sheet-*`, `.tt-voice-orb`, `.tt-voice-ring*`, `.tt-voice-wave` rules. Keep `.tt-voice-ptt-*` (the dock button). |

**Deleted:**
| File |
|---|
| `src/components/screens/ListeningScreen.tsx` |
| `src/components/screens/__tests__/ListeningScreen.test.tsx` |

---

## Task 1: `useMicLevels` audio hook

**Files:**
- Create: `src/hooks/useMicLevels.ts`
- Create: `src/hooks/__tests__/useMicLevels.test.ts`

**Interfaces:**
- Produces: `useMicLevels(active: boolean, barCount?: number): { levels: number[]; rms: number }`
  - `levels`: `barCount` (default 24) numbers in `[0,1]`, updated per animation
    frame while `active`.
  - `rms`: `[0,1]` overall loudness; caller shows an idle ripple when
    `rms < 0.04`.
  - When `active` is `false`, or `getUserMedia` rejects, or
    `prefers-reduced-motion`: returns `{ levels: Array(barCount).fill(0), rms: 0 }`
    and starts no loop / acquires no stream.

- [ ] **Step 1: Write the failing test**

```ts
// src/hooks/__tests__/useMicLevels.test.ts
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
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --dir apps/kiosk test -- useMicLevels`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/hooks/useMicLevels.ts
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
      ctx?.close().catch(() => {});
    };
  }, [active, barCount]);

  return state;
}

void IDLE;
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --dir apps/kiosk test -- useMicLevels`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add apps/kiosk/src/hooks/useMicLevels.ts apps/kiosk/src/hooks/__tests__/useMicLevels.test.ts
git commit -m "feat(kiosk): useMicLevels — read-only audio-reactive bar levels"
```

---

## Task 2: `EarlierStrip` component

**Files:**
- Create: `src/components/voice/EarlierStrip.tsx`
- Create: `src/components/voice/__tests__/EarlierStrip.test.tsx`
- Modify: `src/styles/tabletot.css`

**Interfaces:**
- Produces:
  ```ts
  interface EarlierStripProps {
    turns: { role: "user" | "ai"; text: string }[];
    tone?: "light" | "dark";   // default "light"
    onExpand: () => void;
  }
  ```
  Renders nothing when `turns.length === 0`. Otherwise one row: the label
  `EARLIER`, the first user turn's `text` truncated to ~48 chars, and
  `· N more` where `N = turns.length - 1` (min 0). The whole row is a
  `<button>` firing `onExpand`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/voice/__tests__/EarlierStrip.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import EarlierStrip from "@/components/voice/EarlierStrip";

const turns = [
  { role: "user" as const, text: "How many calories in the avocado toast?" },
  { role: "ai" as const, text: "About 520 kcal." },
  { role: "user" as const, text: "And the cold brew?" },
];

describe("EarlierStrip", () => {
  it("renders nothing with no turns", () => {
    const { container } = render(<EarlierStrip turns={[]} onExpand={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the first user line and a count of the rest", () => {
    render(<EarlierStrip turns={turns} onExpand={() => {}} />);
    expect(screen.getByText(/calories in the avocado toast/i)).toBeInTheDocument();
    expect(screen.getByText(/·\s*2 more/)).toBeInTheDocument();
  });

  it("fires onExpand when tapped", () => {
    const onExpand = vi.fn();
    render(<EarlierStrip turns={turns} onExpand={onExpand} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`pnpm --dir apps/kiosk test -- EarlierStrip`).

- [ ] **Step 3: Implement the component**

```tsx
// src/components/voice/EarlierStrip.tsx
interface EarlierStripProps {
  turns: { role: "user" | "ai"; text: string }[];
  tone?: "light" | "dark";
  onExpand: () => void;
}

const truncate = (s: string, n = 48) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export default function EarlierStrip({ turns, tone = "light", onExpand }: EarlierStripProps) {
  if (turns.length === 0) return null;
  const firstUser = turns.find((t) => t.role === "user")?.text ?? turns[0].text;
  const more = Math.max(0, turns.length - 1);
  return (
    <button type="button" className={`tt-voice-earlier tt-voice-earlier--${tone}`} onClick={onExpand}>
      <span className="tt-voice-earlier-label">Earlier</span>
      <span className="tt-voice-earlier-text">"{truncate(firstUser)}"</span>
      {more > 0 && <span className="tt-voice-earlier-more">· {more} more</span>}
    </button>
  );
}
```

- [ ] **Step 4: Add CSS** — append to the `.tt-*` section of `tabletot.css`:

```css
/* ─── Voice · collapsed history strip ───────────────────────────── */
.tt-voice-earlier {
  display: flex;
  align-items: baseline;
  gap: var(--tt-space-2);
  width: 100%;
  padding: var(--tt-space-2) var(--tt-space-3);
  border: 2px solid var(--tt-line);
  border-radius: var(--tt-radius-chip);
  background: transparent;
  font-family: var(--tt-font-text);
  font-size: var(--tt-size-meta);
  text-align: left;
}
.tt-voice-earlier--dark { border-color: var(--tt-line-dark); color: var(--tt-on-dark-70); }
.tt-voice-earlier-label {
  flex: none;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--tt-action);
}
.tt-voice-earlier-text {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.tt-voice-earlier--light .tt-voice-earlier-text { color: var(--tt-ink-60); }
.tt-voice-earlier-more { flex: none; font-weight: 700; }
```

- [ ] **Step 5: Run — expect PASS** (`pnpm --dir apps/kiosk test -- EarlierStrip`).

- [ ] **Step 6: Commit**

```bash
git add apps/kiosk/src/components/voice/EarlierStrip.tsx apps/kiosk/src/components/voice/__tests__/EarlierStrip.test.tsx apps/kiosk/src/styles/tabletot.css
git commit -m "feat(kiosk): EarlierStrip — collapsed voice-history row"
```

---

## Task 3: `VoiceAnswerCard` component

**Files:**
- Create: `src/components/voice/VoiceAnswerCard.tsx`
- Create: `src/components/voice/__tests__/VoiceAnswerCard.test.tsx`
- Modify: `src/styles/tabletot.css`

**Interfaces:**
- Consumes: `MenuItem` from `@/data/menu`; `DietMark` from `@/components/DietMark`;
  `itemImageBackground` from `@/lib/menuImages`.
- Produces:
  ```ts
  interface VoiceAnswerCardProps {
    text: string;                       // the ai turn's text -> ink header band
    items: MenuItem[];                  // matchedItems; [] => info variant
    getQuantity: (id: string) => number;
    onAddItem: (item: MenuItem) => void;
    onUpdateQuantity: (id: string, delta: number) => void;
    onSelectItem: (item: MenuItem) => void;
  }
  ```
  - `items.length > 0` → **rec variant**: ink header (`.tt-voice-answer-head`,
    coral avatar + `text`) + white body with `items.slice(0,3)` rows
    (`.tt-voice-answer-row`, `--tt-line` dividers). Each row: thumb button
    (`itemImageBackground`), `DietMark`, name, price, and either a coral
    `Add` button (`onAddItem`) or a stepper (`−` `qty` `+`) when
    `getQuantity(id) > 0`.
  - `items.length === 0` → **info variant**: ink header (coral avatar +
    "Tabletot answered") + white body with `text` large (Sora) + a muted
    footnote "Kitchen estimate — ask a staff member for anything
    allergy-critical."

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/voice/__tests__/VoiceAnswerCard.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import VoiceAnswerCard from "@/components/voice/VoiceAnswerCard";
import type { MenuItem } from "@/data/menu";

const item = (over: Partial<MenuItem> = {}): MenuItem => ({
  id: "a", name: "Avocado Toast", price: 390, category: "Breakfast",
  tags: [], is_veg: true, ...over,
});
const base = {
  getQuantity: () => 0,
  onAddItem: vi.fn(),
  onUpdateQuantity: vi.fn(),
  onSelectItem: vi.fn(),
};

describe("VoiceAnswerCard", () => {
  it("rec variant renders one row per item, capped at 3", () => {
    render(<VoiceAnswerCard {...base} text="Two dairy-free picks." items={[item({id:"a"}), item({id:"b",name:"Cold Brew"}), item({id:"c",name:"Latte"}), item({id:"d",name:"Mocha"})]} />);
    expect(screen.getByText("Two dairy-free picks.")).toBeInTheDocument();
    expect(screen.getByText("Avocado Toast")).toBeInTheDocument();
    expect(screen.queryByText("Mocha")).not.toBeInTheDocument();
  });

  it("rec variant: Add fires onAddItem; stepper shows when qty > 0", () => {
    const onAddItem = vi.fn();
    const { rerender } = render(<VoiceAnswerCard {...base} onAddItem={onAddItem} text="x" items={[item()]} />);
    fireEvent.click(screen.getByRole("button", { name: /add avocado toast|^add$/i }));
    expect(onAddItem).toHaveBeenCalledTimes(1);
    rerender(<VoiceAnswerCard {...base} getQuantity={() => 2} text="x" items={[item()]} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("info variant: text + footnote, no dish rows", () => {
    render(<VoiceAnswerCard {...base} text="About 520 kcal a portion." items={[]} />);
    expect(screen.getByText(/About 520 kcal/)).toBeInTheDocument();
    expect(screen.getByText(/ask a staff member/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^add$/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**.

- [ ] **Step 3: Implement**

```tsx
// src/components/voice/VoiceAnswerCard.tsx
import DietMark from "@/components/DietMark";
import { itemImageBackground } from "@/lib/menuImages";
import type { MenuItem } from "@/data/menu";

interface VoiceAnswerCardProps {
  text: string;
  items: MenuItem[];
  getQuantity: (id: string) => number;
  onAddItem: (item: MenuItem) => void;
  onUpdateQuantity: (id: string, delta: number) => void;
  onSelectItem: (item: MenuItem) => void;
}

export default function VoiceAnswerCard({
  text, items, getQuantity, onAddItem, onUpdateQuantity, onSelectItem,
}: VoiceAnswerCardProps) {
  const isRec = items.length > 0;
  return (
    <article className="tt-voice-answer">
      <header className="tt-voice-answer-head">
        <span className="tt-voice-answer-avatar" aria-hidden="true" />
        <p className="tt-voice-answer-head-text">{isRec ? text : "Tabletot answered"}</p>
      </header>
      <div className="tt-voice-answer-body">
        {isRec ? (
          items.slice(0, 3).map((it) => {
            const qty = getQuantity(it.id);
            return (
              <div className="tt-voice-answer-row" key={it.id}>
                <button
                  type="button"
                  className="tt-voice-answer-thumb"
                  style={{ background: itemImageBackground(it) }}
                  onClick={() => onSelectItem(it)}
                  aria-label={`View ${it.name}`}
                />
                <div className="tt-voice-answer-meta">
                  <p className="tt-voice-answer-name">
                    <DietMark isVeg={it.is_veg} compact /> {it.name}
                  </p>
                  <p className="tt-voice-answer-price">₹{it.price}</p>
                </div>
                {qty > 0 ? (
                  <div className="tt-voice-answer-stepper" aria-label={`${it.name} quantity`}>
                    <button type="button" onClick={() => onUpdateQuantity(it.id, -1)} aria-label={`Decrease ${it.name}`}>−</button>
                    <span>{qty}</span>
                    <button type="button" onClick={() => onUpdateQuantity(it.id, 1)} aria-label={`Increase ${it.name}`}>+</button>
                  </div>
                ) : (
                  <button type="button" className="tt-voice-answer-add" onClick={() => onAddItem(it)}>
                    Add
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <>
            <p className="tt-voice-answer-text">{text}</p>
            <p className="tt-voice-answer-foot">
              Kitchen estimate — ask a staff member for anything allergy-critical.
            </p>
          </>
        )}
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Add CSS** (append to `.tt-*` section). Ink header fused to
white body, 2px border wraps the whole card, hairline row dividers, no shadow:

```css
/* ─── Voice · answer card (07 rec / 08 info) ───────────────────── */
.tt-voice-answer {
  border: 2px solid var(--tt-ink);
  border-radius: var(--tt-radius-card);
  overflow: hidden;
  background: var(--tt-paper);
}
.tt-voice-answer-head {
  display: flex;
  align-items: center;
  gap: var(--tt-space-2);
  padding: var(--tt-space-3);
  background: var(--tt-ink);
  color: var(--tt-on-dark);
}
.tt-voice-answer-avatar {
  flex: none;
  width: calc(36px * var(--tt-scale));
  height: calc(36px * var(--tt-scale));
  border-radius: var(--tt-radius-pill);
  background: var(--tt-action);
}
.tt-voice-answer-head-text {
  margin: 0;
  font-family: var(--tt-font-text);
  font-weight: 700;
  font-size: var(--tt-size-body);
}
.tt-voice-answer-body { padding: var(--tt-space-3); }
.tt-voice-answer-row {
  display: flex;
  align-items: center;
  gap: var(--tt-space-3);
  padding: var(--tt-space-3) 0;
}
.tt-voice-answer-row + .tt-voice-answer-row { border-top: 2px solid var(--tt-line); }
.tt-voice-answer-thumb {
  flex: none;
  width: calc(72px * var(--tt-scale));
  height: calc(72px * var(--tt-scale));
  border: 2px solid var(--tt-line);
  border-radius: var(--tt-radius-chip);
}
.tt-voice-answer-meta { flex: 1; min-width: 0; }
.tt-voice-answer-name {
  margin: 0;
  font-family: var(--tt-font-display);
  font-weight: 700;
  font-size: var(--tt-size-dish);
  color: var(--tt-ink);
}
.tt-voice-answer-price {
  margin: var(--tt-space-1) 0 0;
  font-weight: 700;
  color: var(--tt-ink-60);
}
.tt-voice-answer-add {
  flex: none;
  min-height: var(--tt-tap);
  padding: 0 var(--tt-space-5);
  border-radius: var(--tt-radius-card);
  background: var(--tt-action);
  color: var(--tt-paper);
  font-family: var(--tt-font-text);
  font-weight: 800;
  font-size: var(--tt-size-cta);
}
.tt-voice-answer-stepper {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--tt-space-3);
  padding: 0 var(--tt-space-3);
  min-height: var(--tt-tap);
  border: 2px solid var(--tt-line);
  border-radius: var(--tt-radius-card);
  font-weight: 700;
}
.tt-voice-answer-text {
  margin: 0;
  font-family: var(--tt-font-display);
  font-weight: 700;
  font-size: var(--tt-size-heading);
  color: var(--tt-ink);
}
.tt-voice-answer-foot {
  margin: var(--tt-space-3) 0 0;
  color: var(--tt-ink-60);
  font-size: var(--tt-size-meta);
}
```

- [ ] **Step 5: Run — expect PASS**.

- [ ] **Step 6: Commit**

```bash
git add apps/kiosk/src/components/voice/VoiceAnswerCard.tsx apps/kiosk/src/components/voice/__tests__/VoiceAnswerCard.test.tsx apps/kiosk/src/styles/tabletot.css
git commit -m "feat(kiosk): VoiceAnswerCard — ink-header answer card (rec/info)"
```

---

## Task 4: `VoiceDockPanel` (screen 06)

**Files:**
- Create: `src/components/voice/VoiceDockPanel.tsx`
- Create: `src/components/voice/__tests__/VoiceDockPanel.test.tsx`
- Modify: `src/styles/tabletot.css`

**Interfaces:**
- Consumes: `useMicLevels` (Task 1), `EarlierStrip` (Task 2).
- Produces:
  ```ts
  interface VoiceDockPanelProps {
    status: "recording" | "processing" | "error";
    transcript: string;          // live interim/final STT text ("" before speech)
    turns: { role: "user" | "ai"; text: string }[];
    onToggle: () => void;        // = the frozen handleToggle (stop capture)
    onClose: () => void;
    onExpandHistory: () => void;  // -> voice-conversation screen
    onChip: (text: string) => void; // every chip -> onRequestSpeak in Index
  }
  ```
  Fixed to the bottom of the viewport, ink surface, **no backdrop**. Rows:
  status (coral `● LISTENING` pill / "Voice unavailable" when `error`, +
  "Tap the mark again to stop" + `Close ✕`), `EarlierStrip tone="dark"`,
  waveform (`useMicLevels(status === "recording")` → bars; idle ripple when
  `rms < 0.04` or not recording; coral mic mark button = `onToggle`, disabled
  when `error`), transcript (`"{transcript}…"` while non-empty), chip row
  (`["What's popular?","Something for two","No onion or garlic"]`).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/voice/__tests__/VoiceDockPanel.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import VoiceDockPanel from "@/components/voice/VoiceDockPanel";

vi.mock("@/hooks/useMicLevels", () => ({
  useMicLevels: () => ({ levels: Array(24).fill(0), rms: 0 }),
}));

const base = {
  status: "recording" as const,
  transcript: "",
  turns: [] as { role: "user" | "ai"; text: string }[],
  onToggle: vi.fn(),
  onClose: vi.fn(),
  onExpandHistory: vi.fn(),
  onChip: vi.fn(),
};

describe("VoiceDockPanel", () => {
  it("shows LISTENING and the live transcript", () => {
    render(<VoiceDockPanel {...base} transcript="Something light, no dairy" />);
    expect(screen.getByText(/listening/i)).toBeInTheDocument();
    expect(screen.getByText(/Something light, no dairy/)).toBeInTheDocument();
  });

  it("hides EarlierStrip at 0 turns, shows it with a count at 3", () => {
    const { rerender } = render(<VoiceDockPanel {...base} />);
    expect(screen.queryByText(/earlier/i)).not.toBeInTheDocument();
    rerender(<VoiceDockPanel {...base} turns={[
      { role: "user", text: "How many calories?" },
      { role: "ai", text: "520" },
      { role: "user", text: "and the brew?" },
    ]} />);
    expect(screen.getByText(/·\s*2 more/)).toBeInTheDocument();
  });

  it("mic mark fires onToggle; Close fires onClose; a chip fires onChip", () => {
    render(<VoiceDockPanel {...base} />);
    fireEvent.click(screen.getByRole("button", { name: /stop|mark/i }));
    expect(base.onToggle).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(base.onClose).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "What's popular?" }));
    expect(base.onChip).toHaveBeenCalledWith("What's popular?");
  });

  it("error status disables the mark and shows the unavailable copy", () => {
    render(<VoiceDockPanel {...base} status="error" />);
    expect(screen.getByText(/voice unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mark/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**.

- [ ] **Step 3: Implement `VoiceDockPanel.tsx`**

Compose per the interface. Waveform bars:
`levels.map((h, i) => <span key={i} style={{ height: \`${Math.max(8, h*100)}%\` }} className={i % 3 === 0 ? "is-accent" : ""} />)`.
Mic mark: `<button className="tt-voice-dock-mark" onClick={onToggle} disabled={status==="error"} aria-label={status==="recording" ? "Stop — tap the mark" : "Voice mark"} />`.
Idle ripple: add `tt-voice-wave--idle` class on the bar container when
`status !== "recording" || rms < 0.04`.

- [ ] **Step 4: Add CSS** — `.tt-voice-dock` (fixed, bottom, `z-index: 9980`,
`background: var(--tt-ink)`, `color: var(--tt-on-dark)`,
`border-top: 2px solid var(--tt-line-dark)`, `padding: var(--tt-space-4)`,
`display: flex; flex-direction: column; gap: var(--tt-space-3)`), the
`● LISTENING` pill (`.tt-voice-dock-pill`, `background: var(--tt-action)`,
`color: var(--tt-paper)`, `border-radius: var(--tt-radius-pill)`), the
`Close ✕` outlined pill (`.tt-voice-dock-close`, `border: 2px solid
var(--tt-line-dark)`), `.tt-voice-dock-mark` (coral disc, `--tt-tap-primary`
square, `border-radius: var(--tt-radius-pill)`), `.tt-voice-wave` (flex row of
bars, `align-items: center`, `gap: 4px`, height `calc(64px * var(--tt-scale))`),
`.tt-voice-wave span` (`width: 6px`, `border-radius: var(--tt-radius-badge)`,
`background: var(--tt-paper)`, `transition: height 90ms linear`),
`.tt-voice-wave span.is-accent { background: var(--tt-action); }`,
`.tt-voice-wave--idle span { height: 12% !important; opacity: .5; }` guarded by
`@media (prefers-reduced-motion: reduce)` for the transition. Transcript:
`.tt-voice-dock-transcript` (`font-family: var(--tt-font-display)`,
`font-size: var(--tt-size-dish)`, `color: var(--tt-on-dark)`). Chips:
`.tt-voice-dock-chips` (flex wrap), `.tt-voice-dock-chip` (`border: 2px solid
var(--tt-line-dark)`, `border-radius: var(--tt-radius-pill)`,
`min-height: var(--tt-tap)`, `padding: 0 var(--tt-space-3)`,
`color: var(--tt-on-dark)`, `background: transparent`).

- [ ] **Step 5: Run — expect PASS**.

- [ ] **Step 6: Commit**

```bash
git add apps/kiosk/src/components/voice/VoiceDockPanel.tsx apps/kiosk/src/components/voice/__tests__/VoiceDockPanel.test.tsx apps/kiosk/src/styles/tabletot.css
git commit -m "feat(kiosk): VoiceDockPanel — screen 06 recording overlay with live waveform"
```

---

## Task 5: `VoiceConversationScreen` (screens 07 / 08)

**Files:**
- Create: `src/components/voice/VoiceConversationScreen.tsx`
- Create: `src/components/voice/__tests__/VoiceConversationScreen.test.tsx`
- Modify: `src/styles/tabletot.css`

**Interfaces:**
- Consumes: `EarlierStrip` (Task 2), `VoiceAnswerCard` (Task 3).
- Produces:
  ```ts
  import type { MenuItem } from "@/data/menu";
  import type { Turn } from "@/lib/voice/types";
  interface VoiceConversationScreenProps {
    turns: Turn[];
    getQuantity: (id: string) => number;
    onAddItem: (item: MenuItem) => void;
    onUpdateQuantity: (id: string, delta: number) => void;
    onSelectItem: (item: MenuItem) => void;
    onClose: () => void;         // -> currentScreen "menu"
    onRequestSpeak: () => void;  // speak-dock tap -> frozen handleToggle -> 06
  }
  ```
  Full-screen (`.tt-voice-convo`), `--tt-field` ground. Renders:
  - Header: "Your conversation" (Sora) + `${turns.length} messages · kept
    until you leave the table` + outlined `Close ✕` (`onClose`).
  - `EarlierStrip tone="light"` over `turns.slice(0, -2)`; `Show all` toggles a
    local `expanded` state that renders every turn as a `YOU SAID` card /
    `VoiceAnswerCard`.
  - When not expanded: the last user turn as a `YOU SAID` card, then the last
    ai turn as `<VoiceAnswerCard text={turn.text} items={turn.matchedItems ??
    []} ... />` (rec vs info handled inside the card).
  - Chip row: rec → `["Add both","Show me more","Something warmer"]`; info →
    `["Show me lighter dishes","Back to the menu"]`. `"Add both"` →
    `turn.matchedItems?.forEach(onAddItem)`; `"Back to the menu"` → `onClose`;
    anything else → `onRequestSpeak`.
  - Speak-dock: slim ink bar, coral mark + "Tap the mark to speak" / "Tap it
    again to stop · this conversation is kept"; tap → `onRequestSpeak`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/voice/__tests__/VoiceConversationScreen.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import VoiceConversationScreen from "@/components/voice/VoiceConversationScreen";
import type { Turn } from "@/lib/voice/types";

const base = {
  getQuantity: () => 0,
  onAddItem: vi.fn(),
  onUpdateQuantity: vi.fn(),
  onSelectItem: vi.fn(),
  onClose: vi.fn(),
  onRequestSpeak: vi.fn(),
};
const recTurns: Turn[] = [
  { role: "user", text: "Something light, no dairy" },
  { role: "ai", text: "Two dairy-free picks.", matchedItems: [
    { id: "a", name: "Avocado Toast", price: 390, category: "b", tags: [], is_veg: true },
    { id: "c", name: "Cold Brew", price: 290, category: "b", tags: [], is_veg: true },
  ] },
];
const infoTurns: Turn[] = [
  { role: "user", text: "How many calories in the avocado toast?" },
  { role: "ai", text: "About 520 kcal a portion." },
];

describe("VoiceConversationScreen", () => {
  it("07: renders the answer card with dish rows and the YOU SAID card", () => {
    render(<VoiceConversationScreen {...base} turns={recTurns} />);
    expect(screen.getByText(/Something light, no dairy/)).toBeInTheDocument();
    expect(screen.getByText("Avocado Toast")).toBeInTheDocument();
    expect(screen.getByText(/2 messages/)).toBeInTheDocument();
  });

  it("07: 'Add both' adds every matched item", () => {
    const onAddItem = vi.fn();
    render(<VoiceConversationScreen {...base} onAddItem={onAddItem} turns={recTurns} />);
    fireEvent.click(screen.getByRole("button", { name: "Add both" }));
    expect(onAddItem).toHaveBeenCalledTimes(2);
  });

  it("08: text-only answer, 'Back to the menu' closes", () => {
    render(<VoiceConversationScreen {...base} turns={infoTurns} />);
    expect(screen.getByText(/About 520 kcal/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^add$/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to the menu" }));
    expect(base.onClose).toHaveBeenCalled();
  });

  it("speak-dock and Close fire their handlers", () => {
    render(<VoiceConversationScreen {...base} turns={infoTurns} />);
    fireEvent.click(screen.getByRole("button", { name: /tap the mark to speak/i }));
    expect(base.onRequestSpeak).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(base.onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**.

- [ ] **Step 3: Implement** per the interface.

- [ ] **Step 4: Add CSS** — `.tt-voice-convo` (`min-height: 100%`,
`display: flex; flex-direction: column; gap: var(--tt-space-4)`,
`padding: var(--tt-gutter) var(--tt-gutter) 0`), header row
(`.tt-voice-convo-head` flex space-between; `h1` Sora `--tt-size-heading`;
`.tt-voice-convo-sub` `--tt-ink-60` `--tt-size-meta`), `.tt-voice-convo-close`
(outlined pill), `.tt-voice-said` (white card, 2px `--tt-line`,
`--tt-radius-card`, `padding: var(--tt-pad-card)`; label `.tt-voice-said-label`
uppercase `--tt-action` `--tt-size-meta` weight 700), `.tt-voice-convo-chips`
(flex wrap, sticky-ish above the dock), `.tt-voice-convo-chip` (outlined pill,
`--tt-tap` min-height), `.tt-voice-speakdock` (`position: sticky; bottom: 0`,
full-bleed ink bar, `margin: 0 calc(-1 * var(--tt-gutter))`,
`padding: var(--tt-space-3) var(--tt-gutter)`, coral mark + two text lines
`--tt-on-dark` / `--tt-on-dark-70`).

- [ ] **Step 5: Run — expect PASS**.

- [ ] **Step 6: Commit**

```bash
git add apps/kiosk/src/components/voice/VoiceConversationScreen.tsx apps/kiosk/src/components/voice/__tests__/VoiceConversationScreen.test.tsx apps/kiosk/src/styles/tabletot.css
git commit -m "feat(kiosk): VoiceConversationScreen — screens 07/08 full-screen thread"
```

---

## Task 6: Integrate — host rewrite, Index wiring, delete ListeningScreen

**Files:**
- Modify: `src/components/VoiceConversationPanel.tsx`
- Modify: `src/pages/Index.tsx`
- Modify: `src/hooks/useDeviceNavigation.ts`
- Modify: `src/styles/tabletot.css` (delete the old `.tt-voice-*` panel rules)
- Delete: `src/components/screens/ListeningScreen.tsx`,
  `src/components/screens/__tests__/ListeningScreen.test.tsx`
- Modify: `src/pages/Index.tsx` (remove the `case "listening"` +
  `ListeningScreen` import)

**Interfaces:**
- `VoiceConversationPanel` **new props** (additive — do not remove existing):
  ```ts
  voicePhase: "dock" | "answer" | "closed";
  onPressStatusChange: (s: "recording" | "processing" | "idle" | "error") => void;
  onToggleReady: (toggle: () => void) => void;   // lifts the frozen handleToggle
  transcript: string;                             // NEW: passed down for the dock
  turns: { role: "user" | "ai"; text: string }[]; // already passed
  onExpandHistory: () => void;
  onChip: (text: string) => void;
  ```
- `VoiceConversationPanel` render logic (the ONLY behavioural change):
  - `useEffect(() => onToggleReady(handleToggle), [handleToggle])` — lift the
    memoised toggle.
  - `useEffect(() => onPressStatusChange(derivedStatus), [derivedStatus])`
    where `derivedStatus` comes from the existing `pressStatus` /
    `backendStatus` (no new state).
  - Return: `voicePhase === "dock" ? <VoiceDockPanel .../> : null`. The old
    `Dialog.Root` / `motion.section` / `.tt-voice-conversation-*` JSX is
    deleted. `startSttPress` etc. stay exactly where they are.
- `Index.tsx`:
  - `voicePhase` derived: `pressStatus recording|processing` → `"dock"`; else
    last turn `role === "ai"` && a `voiceAnswerOpen` flag → `"answer"`; else
    `"closed"`. Keep a `voiceToggleRef` set by `onToggleReady`.
  - `handleVoiceDone` is FROZEN — do not edit it. Instead, a separate
    `useEffect` watches `voiceTurns`: when the last turn flips to `role: "ai"`,
    `setCurrentScreen("voice-conversation")`.
  - `case "voice-conversation":` renders `<VoiceConversationScreen turns={voiceTurns}
    ... onClose={() => { setCurrentScreen("menu"); /* clear answer flag */ }}
    onRequestSpeak={() => { setCurrentScreen("menu"); voiceToggleRef.current?.(); }} />`.
  - On the `menu` case: `VoiceConversationPanel` is rendered **always** (not
    gated on `voiceConversationOpen`), so it hosts the frozen session for the
    whole menu lifetime; it draws only the dock overlay when phase is `dock`.
  - `VoiceOrderButton` dock: its `onOpenConversation` now just triggers the
    first capture (calls the lifted toggle) instead of opening a modal — or
    keep `onOpenConversation` pointed at a handler that starts capture. Verify
    the frozen `VoiceOrderButton.handleToggle` conversation-mode branch still
    behaves (it calls `onOpenConversation?.()` and returns — that's fine, the
    handler now starts capture via the host).

- [ ] **Step 1: `ScreenType`** — in `useDeviceNavigation.ts`, remove
`| "listening"`, add `| "voice-conversation"`. Run `pnpm --dir apps/kiosk build`
→ expect TS errors in `Index.tsx` (`case "listening"`), which the next steps fix.

- [ ] **Step 2: Delete `ListeningScreen`** — remove the two files, the
`import ListeningScreen` line, and the whole `case "listening":` block in
`Index.tsx`.

- [ ] **Step 3: Frozen-pipeline guard test** — add
`src/components/__tests__/VoiceConversationPanel.frozen.test.tsx`:

```tsx
import { render, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const startSttPress = vi.fn().mockResolvedValue({ stop: vi.fn() });
vi.mock("@/lib/voice/sttClient", () => ({ startSttPress, MicPermissionDeniedError: class extends Error {} }));
vi.mock("@/lib/voice/ttsClient", () => ({ openTtsClient: () => ({ close: vi.fn(), bargeIn: vi.fn() }), unlockAudioContext: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/voice/api", () => ({ startSession: vi.fn().mockResolvedValue({ voiceSessionId: "s1", clientSessionId: "c1" }), endSession: vi.fn() }));

import VoiceConversationPanel from "@/components/VoiceConversationPanel";

it("still calls startSttPress(sessionId, handler, cartItems) when the mark is toggled", async () => {
  let toggle = () => {};
  render(
    <VoiceConversationPanel
      sessionId="s1" turns={[]} order={[{ id: "a", name: "X", price: 10, quantity: 1 }]}
      getQuantity={() => 0} onClose={() => {}} onDone={() => {}} onAddItem={() => {}}
      onUpdateQuantity={() => {}} onSelectItem={() => {}}
      voicePhase="dock" onPressStatusChange={() => {}} onToggleReady={(t) => { toggle = t; }}
      transcript="" onExpandHistory={() => {}} onChip={() => {}}
    />,
  );
  await waitFor(() => expect(typeof toggle).toBe("function"));
  toggle();
  await waitFor(() => {
    expect(startSttPress).toHaveBeenCalledWith("s1", expect.any(Function), [
      { id: "a", name: "X", qty: 1, price: 10 },
    ]);
  });
});
```

Run: `pnpm --dir apps/kiosk test -- VoiceConversationPanel.frozen`
Expected: FAIL (props not wired yet).

- [ ] **Step 4: Rewrite `VoiceConversationPanel` render** — keep every
`useEffect`, `useRef`, `useCallback`, and the `startSession`/`openTtsClient`/
`startSttPress`/`handleSttMessage`/`handleToggle` bodies **verbatim**. Add the
two lifting `useEffect`s and the new props. Replace the `return (...)` with:

```tsx
  useEffect(() => { onToggleReady(handleToggle); }, [handleToggle, onToggleReady]);
  useEffect(() => {
    onPressStatusChange(
      backendStatus === "error" ? "error" : pressStatus,
    );
  }, [pressStatus, backendStatus, onPressStatusChange]);

  if (voicePhase !== "dock") return null;
  return (
    <VoiceDockPanel
      status={backendStatus === "error" ? "error" : (pressStatus === "processing" ? "processing" : "recording")}
      transcript={transcript}
      turns={turns}
      onToggle={() => void handleToggle()}
      onClose={onClose}
      onExpandHistory={onExpandHistory}
      onChip={onChip}
    />
  );
```

(`transcript`: `VoiceConversationPanel` does not currently track interim text —
add a `useState("")` updated in the **existing** `handleSttMessage` `interim`/
`final` branches. That is adding a display state read off an existing message
type, not changing the STT call sequence. If `handleSttMessage` has no
`interim` branch, add one that only does `setTranscript(msg.text)` and falls
through — no other effect.)

Run: `pnpm --dir apps/kiosk test -- VoiceConversationPanel.frozen` → PASS.

- [ ] **Step 5: Wire `Index.tsx`** per the Interfaces block. Delete the old
`voicePanel={...VoiceConversationPanel...}` slot usage; render the host
unconditionally in the `menu` case's `voicePanel` slot with the new props.
Add the `useEffect` that flips to `"voice-conversation"` on a new ai turn. Add
the `case "voice-conversation":`.

- [ ] **Step 6: Delete old CSS** — remove from `tabletot.css`:
`.tt-voice-conversation-*`, `.tt-voice-chat-*`, `.tt-voice-recommendation-*`,
`.tt-voice-prompt-grid`, `.tt-voice-input-status`, `.tt-voice-live-dot`,
`.tt-voice-frequency-meter`, `.tt-voice-stop-btn`, `.tt-voice-conversation-input`,
`.tt-voice-conversation-backdrop`, and the ListeningScreen rules
`.tt-voice-sheet*`, `.tt-voice-orb`, `.tt-voice-ring*`, `.tt-voice-wave`
(old), `.tt-voice-active-mark`, `.tt-voice-close`, `.tt-voice-mic-icon`,
`.tt-voice-sheet-copy`. Keep `.tt-voice-ptt-*`.
Verify: `grep -c "tt-voice-conversation-panel\|tt-voice-chat-row\|tt-voice-frequency-meter" src/styles/tabletot.css` → 0.

- [ ] **Step 7: Full suite + build**

Run: `pnpm --dir apps/kiosk test && pnpm --dir apps/kiosk build`
Expected: all green. Update `VoiceConversationPanel.test.tsx` (the old B1
backdrop test) — the backdrop is gone; replace that assertion with "renders
`VoiceDockPanel` when `voicePhase === 'dock'`" or delete the obsolete case.

- [ ] **Step 8: Commit**

```bash
git add -A apps/kiosk/src
git commit -m "feat(kiosk): wire the redesigned voice channel; delete dead ListeningScreen"
```

---

## Task 7: Verification & docs

- [ ] **Step 1: Browser walk** — `pnpm --dir apps/kiosk dev`, order-engine
running, 800×1340. From the menu:
  1. Tap the dock mic → **06** overlay appears over the still-visible menu;
     speak → waveform bars react; transcript updates.
  2. Stop → answer lands → **07** full screen; a dish `Add` updates the cart;
     `Add both` adds all; `Show me more` → back to 06.
  3. Ask a factual question → **08** text-only card + footnote; `Back to the
     menu` closes to the menu.
  4. Re-open via the mic, tap `EARLIER` → full thread on the
     `voice-conversation` screen.
  5. DevTools: no `box-shadow` on any voice surface; no console errors beyond
     any pre-existing.
  6. Toggle `prefers-reduced-motion` → waveform static, transitions instant.
  **Kill the dev server and order-engine.**

- [ ] **Step 2: Physical tablet (Lenovo K9)** — the two-concurrent-mic-stream
check: confirm the analyser stream in `useMicLevels` does not break STT capture.
If it does, set `useMicLevels` to no-op (return zeros) on that device and file a
follow-up; capture must always win.

- [ ] **Step 3: Refresh graphify** — `/graphify` scoped to code + docs only
(`.ts`, `.tsx`, `.md`), never media.

- [ ] **Step 4: Docs** — update `docs/notes/2026-08-30-kiosk-sprint-6-7.md`
(voice channel rebuilt, `ListeningScreen` deleted) and the root `CLAUDE.md`
"Current status" voice line. Commit:

```bash
git add docs/ CLAUDE.md
git commit -m "docs: voice channel redesigned to screens 06/07/08"
```

---

## Self-Review

**Spec coverage:**
- 06 (menu-visible overlay, waveform, EARLIER, transcript, chips) → Task 4
  (+ Task 1 hook, Task 2 strip). ✔
- 07 (full screen, YOU SAID, ink-header rec card, chips, speak-dock) → Task 5
  (+ Task 3 card, Task 2 strip). ✔
- 08 (info variant, text + footnote, no stat row) → Task 3 info variant +
  Task 5 branch. ✔
- Audio-reactive waveform, read-only, second stream, RM-motion + denial
  fallback → Task 1. ✔
- New `"voice-conversation"` ScreenType; recording stays on `"menu"` → Task 6. ✔
- `VoiceConversationPanel` keeps all frozen code, lifts `handleToggle` →
  Task 6 Steps 3–4 + the frozen-guard test. ✔
- Delete dead `ListeningScreen` + `"listening"` ScreenType → Task 6 Steps 1–2. ✔
- Omit macro row / meta line → Tasks 3 & 5 build neither. ✔
- Chips presentational, `Add both` local, others → `onRequestSpeak` → Tasks 4 & 5. ✔
- Delete the old `.tt-voice-conversation-*` / chat / frequency-meter CSS →
  Task 6 Step 6. ✔

**Placeholder scan:** none. The `transcript` state addition in Task 6 Step 4 is
spelled out (read off the existing `interim`/`final` message, no call-sequence
change). Task 4 Step 3 and Task 5 Step 3 say "implement per the interface" but
each is preceded by a full props contract, a full failing test, and (Task 4) an
explicit CSS spec — an engineer has the shape, the API, and the assertions.

**Type consistency:** `voicePhase` values `"dock" | "answer" | "closed"` are
identical in the spec, Task 6 Interfaces, and the frozen-guard test.
`VoiceAnswerCardProps` matches between Task 3 and its use in Task 5.
`EarlierStripProps.tone` is `"light" | "dark"` in Task 2 and both call sites
(Task 4 `"dark"`, Task 5 `"light"`). `onRequestSpeak` / `onChip` names are
consistent across Tasks 4, 5, 6.

**Known soft spot (flagged):** Task 6 Step 4's `transcript` state — if
`handleSttMessage` genuinely cannot surface interim text without reordering the
frozen logic, fall back to showing only the final transcript (dock shows "" then
the settled phrase). Non-blocking; the dock and the flow work either way.

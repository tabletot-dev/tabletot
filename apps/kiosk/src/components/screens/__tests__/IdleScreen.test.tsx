import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { AnchorItem } from "@/lib/menuStore";

const menu = vi.hoisted(() => ({ anchors: [] as AnchorItem[], loading: false }));
vi.mock("@/lib/menuStore", () => ({
  useMenu: () => ({ anchors: menu.anchors, loading: menu.loading }),
}));

const motionState = vi.hoisted(() => ({ reduced: false }));
vi.mock("framer-motion", async (imp) => {
  const actual = await imp<typeof import("framer-motion")>();
  return { ...actual, useReducedMotion: () => motionState.reduced };
});

const track = vi.hoisted(() => vi.fn());
vi.mock("@/lib/eventBus", () => ({ track }));

import IdleScreen from "@/components/screens/IdleScreen";

const pick = (over: Partial<AnchorItem>): AnchorItem => ({
  id: "p1",
  name: "Chef Pick",
  price: 400,
  category: "Breakfast",
  tags: [],
  is_veg: true,
  itemId: "p1",
  anchorType: "chef_pick",
  priority: 1,
  ...over,
});

function renderIdle(props: Partial<React.ComponentProps<typeof IdleScreen>> = {}) {
  return render(
    <IdleScreen
      onActivate={props.onActivate ?? vi.fn()}
      onSelectHeroItem={props.onSelectHeroItem ?? vi.fn()}
      onOpenPopular={props.onOpenPopular ?? vi.fn()}
      tableId="T1"
    />,
  );
}

beforeEach(() => {
  menu.anchors = [];
  menu.loading = false;
  motionState.reduced = false;
  track.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("IdleScreen (merged attract)", () => {
  it("the background surface and the CTA both start the session", () => {
    const onActivate = vi.fn();
    renderIdle({ onActivate });
    // Background "touch anywhere" surface (exact aria-label).
    fireEvent.click(screen.getByRole("button", { name: "Touch anywhere to start" }));
    // The coral CTA (accessible name includes the "or say…" hint).
    fireEvent.click(screen.getByRole("button", { name: /or say "Hey Tabletot/i }));
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it("the touch surface and the CTA are flat siblings — no nested interactive", () => {
    const { container } = renderIdle();
    const touch = container.querySelector(".tt-attract-touch")!;
    const cta = container.querySelector(".tt-attract-cta")!;
    expect(touch.querySelector("button")).toBeNull();
    expect(cta.querySelector("button")).toBeNull();
    expect(touch.contains(cta)).toBe(false);
  });

  it("a chef's-pick slide tap deep-links and logs recommendation_tapped", () => {
    menu.anchors = [pick({ id: "a", name: "Avocado Toast" })];
    const onSelectHeroItem = vi.fn();
    renderIdle({ onSelectHeroItem });
    fireEvent.click(screen.getByRole("button", { name: "View Avocado Toast" }));
    expect(onSelectHeroItem).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
    expect(track).toHaveBeenCalledWith("recommendation_tapped", {
      itemId: "a",
      surface: "attract_carousel",
    });
  });

  it("fires one recommendation_shown per chef's pick", () => {
    menu.anchors = [pick({ id: "a" }), pick({ id: "b", name: "Two" })];
    renderIdle();
    expect(track).toHaveBeenCalledWith("recommendation_shown", { itemId: "a", surface: "attract_carousel" });
    expect(track).toHaveBeenCalledWith("recommendation_shown", { itemId: "b", surface: "attract_carousel" });
  });

  it("no carousel band when there are zero chef's picks", () => {
    menu.anchors = [pick({ id: "x", anchorType: "bestseller" })];
    renderIdle();
    expect(screen.queryByLabelText("Chef's picks")).not.toBeInTheDocument();
  });

  it("one pick: a slide but no pagination dots", () => {
    menu.anchors = [pick({ id: "solo", name: "Solo" })];
    const { container } = renderIdle();
    expect(screen.getByRole("button", { name: "View Solo" })).toBeInTheDocument();
    expect(container.querySelector(".tt-chefpick-dot")).toBeNull();
  });

  it("auto-advances the active dot when multiple picks and motion is allowed", () => {
    vi.useFakeTimers();
    menu.anchors = [pick({ id: "a" }), pick({ id: "b", name: "B" }), pick({ id: "c", name: "C" })];
    const { container } = renderIdle();
    const activeIndex = () =>
      [...container.querySelectorAll(".tt-chefpick-dot")].findIndex((d) =>
        d.classList.contains("active"),
      );
    expect(activeIndex()).toBe(0);
    act(() => vi.advanceTimersByTime(3500));
    expect(activeIndex()).toBe(1);
  });

  it("prefers-reduced-motion: no auto-advance, stays on slide 1", () => {
    vi.useFakeTimers();
    motionState.reduced = true;
    menu.anchors = [pick({ id: "a" }), pick({ id: "b", name: "B" })];
    const { container } = renderIdle();
    act(() => vi.advanceTimersByTime(10000));
    const active = [...container.querySelectorAll(".tt-chefpick-dot")].findIndex((d) =>
      d.classList.contains("active"),
    );
    expect(active).toBe(0);
  });

  it("primary CTA reads 'See the menu' and keeps the voice hint", () => {
    renderIdle();
    const cta = screen.getByRole("button", { name: /or say "Hey Tabletot/i });
    expect(cta).toHaveTextContent("See the menu");
  });

  it("the 'Popular' secondary calls onOpenPopular", () => {
    const onOpenPopular = vi.fn();
    renderIdle({ onOpenPopular });
    fireEvent.click(screen.getByRole("button", { name: "Popular" }));
    expect(onOpenPopular).toHaveBeenCalledTimes(1);
  });

  it("Wi-Fi button opens a dialog with the heading, instruction and a Close", () => {
    renderIdle();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Wi-Fi" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Join the café Wi-Fi");
    expect(dialog).toHaveTextContent(/network is open, no\s+password needed/);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CompletionNudge from "@/components/CompletionNudge";
import type { MenuItem } from "@/data/menu";

vi.mock("@/lib/eventBus", () => ({ track: vi.fn() }));

// Regression test for the gray-placeholder bug: CompletionNudge used to
// re-fetch the suggested item with a select() that omitted image_url,
// producing an item with no `image` even though the menu grid had one.
const coldBrew: MenuItem = {
  id: "i2", name: "Silver Cold Brew", price: 290,
  category: "Coffee", tags: [], is_veg: true,
  image: "https://cdn.example.com/cold-brew.webp",
};

describe("CompletionNudge — image passthrough", () => {
  it("passes the already-hydrated image through to onAdd", () => {
    const onAdd = vi.fn();
    render(
      <CompletionNudge
        suggestionText="Goes well with a cold brew"
        suggestedItemId="i2"
        cartValueAtShow={410}
        menuItems={[coldBrew]}
        onAdd={onAdd}
        onSkip={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText(/Add Silver Cold Brew/));

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      id: "i2",
      image: "https://cdn.example.com/cold-brew.webp",
    }));
  });

  it("skips straight through when the suggested item isn't in the loaded menu", () => {
    const onSkip = vi.fn();
    render(
      <CompletionNudge
        suggestionText="Goes well with a cold brew"
        suggestedItemId="missing-id"
        cartValueAtShow={410}
        menuItems={[coldBrew]}
        onAdd={vi.fn()}
        onSkip={onSkip}
      />,
    );

    expect(onSkip).toHaveBeenCalled();
  });
});

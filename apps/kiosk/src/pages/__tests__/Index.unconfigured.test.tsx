import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// A tablet with no resolvable table (config.ts's TABLE_NUMBER is '' — see
// its own comment on why there's deliberately no 'T1' placeholder fallback)
// must show a blocking setup screen instead of mounting the app and
// silently writing into some other table's session (2026-08-28 audit,
// finding 6). Mocking '@/lib/config' directly is what lets this test avoid
// mounting RestaurantProvider/MenuProvider at all — the guard in Index's
// default export returns before either is ever rendered, so their
// supabase-backed effects never run.
vi.mock("@/lib/config", () => ({
  RESTAURANT_ID: "restaurant-1",
  TABLE_NUMBER: "",
}));

import Index from "@/pages/Index";

describe("Index (unconfigured table)", () => {
  it("shows a blocking setup screen instead of mounting the app", () => {
    render(<Index />);
    expect(screen.getByText(/isn't linked to a table/i)).toBeInTheDocument();
  });
});

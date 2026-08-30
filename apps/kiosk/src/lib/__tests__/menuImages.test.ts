import { describe, it, expect } from "vitest";
import {
  normalizeMenuName,
  menuImageForName,
  hydrateMenuItemImage,
  itemImageBackground,
} from "@/lib/menuImages";

describe("menuImages resolution order (T1)", () => {
  it("normalizeMenuName lowercases, expands &, strips punctuation", () => {
    expect(normalizeMenuName("PB & J  Pancakes!")).toBe("pb and j pancakes");
  });

  it("menuImageForName resolves a known dish via the name dict", () => {
    const url = menuImageForName("Avocado Toast");
    expect(url).toContain("avcado-toast.webp");
  });

  it("menuImageForName returns undefined for an unknown dish", () => {
    expect(menuImageForName("Nonexistent Dish 12345")).toBeUndefined();
  });

  it("hydrateMenuItemImage prefers a DB image_url over the name dict", () => {
    const hydrated = hydrateMenuItemImage({
      name: "Avocado Toast",
      image: "https://cdn.example.com/db-photo.webp",
    });
    expect(hydrated.image).toBe("https://cdn.example.com/db-photo.webp");
  });

  it("hydrateMenuItemImage falls back to the name dict when image_url is null", () => {
    const hydrated = hydrateMenuItemImage({ name: "Avocado Toast", image: null });
    expect(hydrated.image).toContain("avcado-toast.webp");
  });

  it("itemImageBackground: image_url present, no dict entry → uses the URL", () => {
    const bg = itemImageBackground({
      name: "Nonexistent Dish 12345",
      image: "https://cdn.example.com/db-photo.webp",
    });
    expect(bg).toContain('url("https://cdn.example.com/db-photo.webp")');
  });

  it("itemImageBackground: a set image keeps the no-photo fallback as the bottom layer (broken URL → not a blank box)", () => {
    const bg = itemImageBackground({
      name: "Avocado Toast",
      image: "https://cdn.example.com/broken-404.webp",
    });
    // The fallback field fill must still be present underneath the photo layer.
    expect(bg).toContain("var(--tt-field)");
    expect(bg).toContain("data:image/svg+xml");
    // ...and it must be the LAST (bottom) layer, after the photo url.
    expect(bg.indexOf('url("https://cdn.example.com/broken-404.webp")')).toBeLessThan(
      bg.indexOf("var(--tt-field)"),
    );
  });

  it("itemImageBackground: neither image_url nor dict entry → pure no-photo fallback", () => {
    const bg = itemImageBackground({ name: "Nonexistent Dish 12345", image: null });
    expect(bg).toContain("var(--tt-field)");
    expect(bg).not.toContain("url(\"http");
  });
});

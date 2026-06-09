// Category → SVG icon map. Add an entry here when a new DB category appears.
// Falls back to a 2×2 grid icon for any unrecognised category name.

const icons: Record<string, JSX.Element> = {
  "All Day Breakfast": (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M4 15h16" /><path d="M6 15a6 6 0 1 1 12 0" /><path d="M8 19h8" />
    </svg>
  ),
  "Silver Breakfast": (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="9" cy="12" r="4.5" /><path d="M15 7h5v10h-5" />
    </svg>
  ),
  "Smoothie Bowls": (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M5 9h14" /><path d="M6 9a6 6 0 0 0 12 0" /><path d="M9 4v3M12 3v4M15 4v3" />
    </svg>
  ),
  "Pancakes": (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M6 16h12M5 12h14M7 8h10" />
    </svg>
  ),
  "Fries": (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M7 5h10l-1 14H8L7 5Z" /><path d="M9 5V3M12 5V2.5M15 5V3" />
    </svg>
  ),
  "Sandwiches": (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M5 9a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4" /><path d="M5 9h14v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9Z" />
    </svg>
  ),
  "Focaccia": (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M4 15 12 5l8 10Z" /><path d="M8 12h.01M12 10h.01M15 13h.01" />
    </svg>
  ),
  "Burgers": (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M5 10a7 7 0 0 1 14 0M4 12h16M6 16h12" />
    </svg>
  ),
  "Pastas": (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M5 8h14M6 8a6 6 0 0 0 12 0M9 4c0 1 0 2-1 3M12 4c0 1 0 2-1 3M15 4c0 1 0 2-1 3" />
    </svg>
  ),
  "Hot Coffee": (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M6 8h9v4a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V8Z" /><path d="M15 9h1.5a2.5 2.5 0 0 1 0 5H15" /><path d="M8 4c0 1-.5 1.5-.5 2.5M11 4c0 1-.5 1.5-.5 2.5" />
    </svg>
  ),
  "Signature Coffee": (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M7 7h10M8 7v8a4 4 0 0 0 8 0V7M12 3v2M9 19h6" />
    </svg>
  ),
  "Iced Coffee": (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M8 5h8M7 8h10l-1 10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2L7 8Z" /><path d="M10 10l1 2M14 10l-1 2" />
    </svg>
  ),
  "Tea & Chocolate": (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M6 8h8v5a4 4 0 0 1-4 4 4 4 0 0 1-4-4V8Z" /><path d="M14 9h2a2 2 0 0 1 0 4h-2M9 4c0 1-.5 1.5-.5 2.5" />
    </svg>
  ),
  "Desserts": (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M6 18h12M8 18v-4a4 4 0 0 1 8 0v4M12 6a2.5 2.5 0 0 1 2.5 2.5c0 1.6-2.5 3.5-2.5 3.5S9.5 10.1 9.5 8.5A2.5 2.5 0 0 1 12 6Z" />
    </svg>
  ),
};

const fallbackIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" />
  </svg>
);

export default function CategoryIcon({ category }: { category: string }) {
  return icons[category] ?? fallbackIcon;
}

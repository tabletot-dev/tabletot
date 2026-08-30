/**
 * Kiosk build-time and runtime constants.
 *
 * Single source of truth for values that are repeated across the kiosk app.
 * All other modules should import from here instead of reading env vars directly.
 *
 * TABLE_NUMBER: ?table=T3 in the URL overrides the build-time default so one
 * build can serve all tables — each device/browser is pointed at its own URL.
 *
 * Deliberately no fallback to a placeholder like 'T1': a tablet that lands
 * on the bare origin (a cleared tab, a kiosk-mode home page without the
 * query param, a misconfigured VITE_TABLE_ID) used to silently become table
 * T1 and start writing orders into T1's live session with no error anywhere
 * (2026-08-28 audit, finding 6). Empty string is falsy, so callers can gate
 * on it — see Index.tsx's boot-time configuration check.
 */

export const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string;

export const TABLE_NUMBER =
  new URLSearchParams(window.location.search).get('table') ||
  (import.meta.env.VITE_TABLE_ID as string) ||
  '';

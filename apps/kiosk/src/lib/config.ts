/**
 * Kiosk build-time and runtime constants.
 *
 * Single source of truth for values that are repeated across the kiosk app.
 * All other modules should import from here instead of reading env vars directly.
 *
 * TABLE_NUMBER: ?table=T3 in the URL overrides the build-time default so one
 * build can serve all tables — each device/browser is pointed at its own URL.
 */

export const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string;

export const TABLE_NUMBER =
  new URLSearchParams(window.location.search).get('table') ||
  (import.meta.env.VITE_TABLE_ID as string) ||
  'T1';

import * as Sentry from "@sentry/react";

// The kiosk runs unattended on a tablet in a restaurant nobody is watching.
// A white screen is otherwise completely invisible to us.
//
// ponytail: no tracing, no replay, no profiling — errors only. tracesSampleRate
// is omitted entirely (not set to 0) because current Sentry docs say that's
// what actually disables the performance-monitoring integration, rather than
// just sampling it to zero. Add tracing back if we ever need performance data,
// which a single-tenant pilot does not.
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return; // local dev and any build without the env var

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // One kiosk = one table. Tagging by table makes a device-specific fault
    // (bad wifi corner, cracked digitiser) obvious in the issue list.
    initialScope: {
      tags: {
        table: new URLSearchParams(window.location.search).get("table")
          ?? (import.meta.env.VITE_TABLE_ID as string)
          ?? "unknown",
      },
    },
  });
}

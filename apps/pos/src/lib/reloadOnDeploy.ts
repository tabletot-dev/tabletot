import { useEffect, useRef, useState } from "react";

// Stamped by vite.config.ts; "dev" under `vite dev` / vitest.
declare const __BUILD_ID__: string;
const MY_BUILD = typeof __BUILD_ID__ === "undefined" ? "dev" : __BUILD_ID__;

const POLL_MS = 3 * 60_000;
const MIN_GAP_MS = 5 * 60_000; // loop guard: at most one auto-reload per 5 min
const GUARD_KEY = "tt-deploy-reload-at";

/** Reload only for a real, different build id, and only when it is safe. */
export function shouldReload(serverBuild: string | null, myBuild: string, idle: boolean): boolean {
  return !!serverBuild && myBuild !== "dev" && serverBuild !== myBuild && idle;
}

async function fetchServerBuild(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?_=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body?.build === "string" ? body.build : null;
  } catch {
    return null; // offline / bad JSON: never reload on a failed check
  }
}

function reloadedRecently(): boolean {
  try {
    const at = Number(sessionStorage.getItem(GUARD_KEY));
    return at > 0 && Date.now() - at < MIN_GAP_MS;
  } catch {
    return false;
  }
}

/**
 * Polls /version.json and reloads when a newer deploy exists and `isIdle()` is
 * true. Without `isIdle` it never reloads by itself; it only reports
 * `updateAvailable` so the UI can offer a refresh.
 */
export function useReloadOnDeploy(isIdle?: () => boolean): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const isIdleRef = useRef(isIdle);
  useEffect(() => { isIdleRef.current = isIdle; });

  useEffect(() => {
    if (import.meta.env.DEV) return;
    const check = async () => {
      const server = await fetchServerBuild();
      if (!server || server === MY_BUILD) return;
      setUpdateAvailable(true);
      const idle = isIdleRef.current ? isIdleRef.current() : false;
      if (shouldReload(server, MY_BUILD, idle) && !reloadedRecently()) {
        try {
          sessionStorage.setItem(GUARD_KEY, String(Date.now()));
        } catch {
          /* guard is best-effort */
        }
        window.location.reload();
      }
    };
    const timer = window.setInterval(check, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return updateAvailable;
}

// POS has no single "idle screen", so idle = no touch/key for 60s, no open
// dialog, and no field being typed in. Strictest rule: a reload mid-payment
// is the worst case.
const IDLE_MS = 60_000;
let lastActivity = Date.now();
let tracking = false;

export function trackActivity(): void {
  if (tracking) return;
  tracking = true;
  for (const e of ["pointerdown", "keydown", "touchstart"]) {
    window.addEventListener(e, () => { lastActivity = Date.now(); }, { passive: true, capture: true });
  }
}

export function posIsIdle(): boolean {
  const tag = document.activeElement?.tagName ?? "";
  return (
    Date.now() - lastActivity > IDLE_MS &&
    !document.querySelector('[role="dialog"],[role="alertdialog"]') &&
    !/^(INPUT|TEXTAREA|SELECT)$/.test(tag)
  );
}

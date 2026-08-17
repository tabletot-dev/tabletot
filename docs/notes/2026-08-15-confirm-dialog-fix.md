# Native confirm() dialogs replaced with app modal (2026-08-15)

Fixes finding #4 in `docs/notes/pos-only-live-qa-findings.md`: destructive
actions used the browser's native `confirm()`/`window.confirm()`, inconsistent
with the app's custom-modal design and — the more serious issue — native
dialogs block all page script execution until dismissed, which froze the
automated QA browser session outright.

## Fix

New `apps/pos/src/hooks/use-confirm.tsx`: a promise-based `confirm(options):
Promise<boolean>` plus a `<ConfirmDialogHost />` component, mirroring
`use-toast.ts`'s existing singleton-listener pattern (module-level state +
listener array, so any file can `import { confirm } from '@/hooks/use-confirm'`
with no prop drilling or context provider per page). Renders the app's own
`AlertDialog` primitive (`components/ui/alert-dialog.tsx`, already installed
via `@radix-ui/react-alert-dialog` but previously unused anywhere in the app).
`<ConfirmDialogHost />` is mounted once in `App.tsx` next to the existing
`<Toaster />`/`<Sonner />`.

Updated the 4 live call sites (each was `if (!confirm(msg)) return;` as the
first line of an already-`async` handler, so the diff is a one-line swap to
`if (!(await confirm({ description: msg }))) return;`):
- `TableManagement.tsx` — delete table
- `StaffManagement.tsx` — delete staff
- `Menu.tsx` — delete menu item
- `Billing.tsx` — End Service (also had a custom title/label:
  "End service?" / "End Service" instead of the generic default)

Left alone: `AdminMenuItems.tsx:173` and `AdminCategories.tsx:127` — both
still use `confirm()`, but per finding #8 both files are dead code (never
routed in `App.tsx`), so fixing them would have no live effect.

## Verification

`npx tsc --noEmit` clean. Live browser test against POS dev server
(localhost:8081, `user@test.com`):
1. Created a throwaway staff member, clicked delete — the app's own styled
   `AlertDialog` appeared ("Are you sure?" / "Are you sure you want to delete
   this staff member?", Cancel + destructive-styled Delete), not a native
   dialog. Confirmed `browse`'s automation commands kept working immediately
   after the click (no freeze — the exact failure mode the finding described).
   Clicked Delete → staff row removed, "Staff deleted successfully" toast.
2. Repeated with a second throwaway staff member, this time clicking Cancel —
   confirmed the row was NOT deleted (both promise-resolution paths verified).

Not verified against the actual tablet webview/kiosk wrapper the finding
flagged as a risk ("worth confirming this doesn't misbehave inside whatever
webview/kiosk wrapper the tablet hardware eventually runs") — that requires
real hardware, out of scope here. The custom dialog only depends on already-
verified web APIs (React state + Radix Portal), so this risk should be fully
retired regardless, but flagging since it wasn't re-tested on-device.

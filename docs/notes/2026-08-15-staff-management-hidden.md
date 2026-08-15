# Staff Management hidden pending real auth strategy (2026-08-15)

Addresses finding #3 in `docs/notes/pos-only-live-qa-findings.md`: "Staff
Management doesn't create real logins." Product decision from Rohan: hide
the feature rather than build a real invite/auth flow right now. Staff
accounts are provisioned manually via the Supabase dashboard for the
pilot, using only the single seeded admin credential (`user@test.com`) to
sign into the POS. No self-serve staff-login provisioning exists or is
implied by the UI anymore.

## Change

`apps/pos/src/App.tsx`: removed the `/staff` route (and its `StaffManagement`
import).
`apps/pos/src/components/AppSidebar.tsx`: removed the "Staff" nav item
(Admin group) and the now-unused `Users` icon import.

`apps/pos/src/pages/StaffManagement.tsx` itself is untouched and left on
disk — same treatment as `AdminMenuItems.tsx`/`AdminCategories.tsx` (finding
#8): unreachable, not deleted, in case a real invite flow gets built on top
of it later.

Not affected: `CaptainAssignModal.tsx`'s use of the `staff` table (captain
assignment during billing) is a separate, working feature — reads existing
staff rows for a dropdown, doesn't touch login/auth. Left alone.

## Verification

`npx tsc --noEmit` clean. Live browser check: POS sidebar no longer shows
"Staff" under Admin; navigating to `/staff` directly falls through to the
catch-all `NotFound` route (no longer a valid route in `App.tsx`).

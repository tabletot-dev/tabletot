#!/usr/bin/env python3
"""
Bootstrap a restaurant's first admin POS login.

2026-08-28 audit finding 2, part 3/3
(docs/notes/2026-08-28-pre-deployment-code-audit.md). Per Rohan's
direction: self-serve POS signup stays enabled but new accounts default to
'pending' (migration 0068) until an admin approves them in
apps/pos StaffManagement's "Pending Approvals" card. That approval flow
needs at least one admin account to exist per restaurant BEFORE any
self-serve signup happens — this script creates it.

Uses Supabase's Admin API (POST /auth/v1/admin/users), not a raw SQL
INSERT into auth.users: GoTrue owns that table's password hashing and
internal invariants (identities row, confirmation state, etc.), and a
hand-rolled INSERT risks producing an account the real Auth service can't
actually authenticate.

Usage:
    SUPABASE_URL=https://xxxx.supabase.co \
    SUPABASE_SERVICE_ROLE_KEY=... \
    python scripts/create_restaurant_admin.py \
        --email owner@restaurant.com --full-name "Owner Name"

    A random password is generated and printed ONCE (never stored, never
    emailed) unless --password is supplied. Change it on first login.
    SUPABASE_SERVICE_ROLE_KEY bypasses RLS entirely — never commit it,
    never use it from a browser/app context, only from a trusted operator
    shell for this one-off bootstrap.

Safe to re-run: if the email is already registered, looks up its existing
user id instead of erroring, and (re-)promotes it to 'admin'.

Known limitation: user_roles has no restaurant scoping in the current
schema (single global role per login, see migration 0001) — this script
creates a login and grants the global 'admin' role; it does not scope
that admin to one restaurant specifically. Fine for the single-pilot-
restaurant present, worth revisiting if/when a second restaurant is added.
"""

import argparse
import os
import secrets
import sys

import requests


def bootstrap_admin(email: str, full_name: str, password: str | None) -> None:
    supabase_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.", file=sys.stderr)
        sys.exit(1)

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }

    generated_password = password or secrets.token_urlsafe(18)

    resp = requests.post(
        f"{supabase_url}/auth/v1/admin/users",
        headers=headers,
        json={
            "email": email,
            "password": generated_password,
            "email_confirm": True,
            "user_metadata": {"full_name": full_name},
        },
        timeout=15,
    )

    if resp.status_code == 422 and "already been registered" in resp.text:
        list_resp = requests.get(
            f"{supabase_url}/auth/v1/admin/users",
            headers=headers,
            params={"email": email},
            timeout=15,
        )
        list_resp.raise_for_status()
        users = list_resp.json().get("users", [])
        if not users:
            print(f"User {email} reportedly exists but could not be found.", file=sys.stderr)
            sys.exit(1)
        user_id = users[0]["id"]
        print(f"{email} already exists (id={user_id}) — promoting to admin, password unchanged.")
    else:
        resp.raise_for_status()
        user_id = resp.json()["id"]
        print(f"Created {email} (id={user_id}).")
        if not password:
            print(f"Generated password (save this now, it is not stored anywhere): {generated_password}")

    # handle_new_user() (0040, defaults changed in 0068) already inserted a
    # user_roles row with role='pending' via the auth.users INSERT trigger
    # fired above. Promote it to admin. service_role bypasses RLS, so this
    # works regardless of is_authorized_staff() — which would otherwise
    # block a non-staff caller from writing user_roles.
    role_resp = requests.post(
        f"{supabase_url}/rest/v1/user_roles",
        headers={**headers, "Prefer": "resolution=merge-duplicates"},
        json={"user_id": user_id, "role": "admin"},
        timeout=15,
    )
    role_resp.raise_for_status()
    print(f"{email} is now an admin.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--email", required=True, help="Admin's login email")
    parser.add_argument("--full-name", required=True, help="Admin's display name")
    parser.add_argument("--password", help="Explicit password (default: generated and printed once)")
    args = parser.parse_args()
    bootstrap_admin(args.email, args.full_name, args.password)

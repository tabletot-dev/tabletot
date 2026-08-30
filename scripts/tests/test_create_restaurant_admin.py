"""
Unit tests for create_restaurant_admin.py, run against a mocked Supabase
Admin API (no live project available). Covers: fresh create, idempotent
re-run against an already-registered email, and the missing-env-var guard.

Run: python3 -m unittest scripts.tests.test_create_restaurant_admin -v
     (from the repo root)
"""

import os
import sys
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import create_restaurant_admin as cra  # noqa: E402


def _resp(status_code=200, json_data=None, text=""):
    m = MagicMock()
    m.status_code = status_code
    m.text = text
    m.json.return_value = json_data or {}
    m.raise_for_status.side_effect = (
        None if status_code < 400 else Exception(f"HTTP {status_code}")
    )
    return m


class BootstrapAdminTests(unittest.TestCase):
    def setUp(self):
        self.env_patch = patch.dict(
            os.environ,
            {"SUPABASE_URL": "https://example.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": "srv-key"},
        )
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)

    def test_missing_env_vars_exits_nonzero(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(SystemExit) as ctx:
                cra.bootstrap_admin("a@b.com", "A B", None)
            self.assertNotEqual(ctx.exception.code, 0)

    @patch("create_restaurant_admin.requests.post")
    def test_fresh_create_then_promotes_to_admin(self, mock_post):
        create_resp = _resp(200, {"id": "user-123"})
        role_resp = _resp(200, {})
        mock_post.side_effect = [create_resp, role_resp]

        cra.bootstrap_admin("new@restaurant.com", "New Owner", "explicit-pw")

        self.assertEqual(mock_post.call_count, 2)
        create_call, role_call = mock_post.call_args_list

        self.assertEqual(create_call.args[0], "https://example.supabase.co/auth/v1/admin/users")
        self.assertEqual(create_call.kwargs["json"]["email"], "new@restaurant.com")
        self.assertEqual(create_call.kwargs["json"]["password"], "explicit-pw")
        self.assertTrue(create_call.kwargs["json"]["email_confirm"])

        self.assertEqual(role_call.args[0], "https://example.supabase.co/rest/v1/user_roles")
        self.assertEqual(role_call.kwargs["json"], {"user_id": "user-123", "role": "admin"})
        self.assertEqual(role_call.kwargs["headers"]["Prefer"], "resolution=merge-duplicates")

    @patch("create_restaurant_admin.requests.get")
    @patch("create_restaurant_admin.requests.post")
    def test_rerun_against_existing_email_is_idempotent(self, mock_post, mock_get):
        # First call (create) reports "already registered"; script must
        # look the user up instead of treating this as a hard failure, and
        # must NOT attempt a second create call.
        already_registered = _resp(422, text="Email already been registered")
        role_resp = _resp(200, {})
        mock_post.side_effect = [already_registered, role_resp]
        mock_get.return_value = _resp(200, {"users": [{"id": "existing-456"}]})

        cra.bootstrap_admin("owner@restaurant.com", "Owner", None)

        self.assertEqual(mock_post.call_count, 2, "must not retry create after a 422")
        mock_get.assert_called_once()
        role_call = mock_post.call_args_list[1]
        self.assertEqual(role_call.kwargs["json"], {"user_id": "existing-456", "role": "admin"})

    @patch("create_restaurant_admin.requests.post")
    def test_generated_password_is_printed_once_when_not_supplied(self, mock_post):
        mock_post.side_effect = [_resp(200, {"id": "user-789"}), _resp(200, {})]
        with patch("create_restaurant_admin.secrets.token_urlsafe", return_value="RANDOM-PW"):
            with patch("builtins.print") as mock_print:
                cra.bootstrap_admin("gen@restaurant.com", "Gen", None)
        printed = "\n".join(str(c.args[0]) for c in mock_print.call_args_list)
        self.assertIn("RANDOM-PW", printed)
        create_call = mock_post.call_args_list[0]
        self.assertEqual(create_call.kwargs["json"]["password"], "RANDOM-PW")


if __name__ == "__main__":
    unittest.main()

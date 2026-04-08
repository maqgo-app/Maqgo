import os

from services.email_service import _normalize_recipients, sendEmail


def test_normalize_recipients_accepts_string_and_list():
    assert _normalize_recipients("a@x.com, b@y.com") == ["a@x.com", "b@y.com"]
    assert _normalize_recipients(["a@x.com", " ", None, "b@y.com"]) == ["a@x.com", "b@y.com"]


def test_send_email_fails_without_key(monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setenv("EMAIL_FROM", "onboarding@resend.dev")
    result = sendEmail(
        {
            "to": "test@example.com",
            "cc": "copy@example.com",
            "subject": "Asunto",
            "html": "<p>Hola</p>",
        }
    )
    assert result["success"] is False
    assert "RESEND_API_KEY" in result["error"]


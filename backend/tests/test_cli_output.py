"""Importer CLIs must be able to print their own reports on a Windows console.

Both reports carry Chinese: the roster report echoes the sheet's footnote rows
and labels its reconciliation sections, and the rules report names editions
like 第十一届. Windows consoles commonly default to cp1252, which cannot
encode any of it — the command dies with UnicodeEncodeError after the work is
done, so the operator sees a traceback instead of the report they ran it for.

pytest's capsys is UTF-8, so it cannot reproduce this. These tests substitute
a genuinely cp1252-backed stream.
"""

import io
import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")

import sys

import pytest

from app.rosters.__main__ import configure_stdout


def cp1252_stream() -> io.TextIOWrapper:
    return io.TextIOWrapper(io.BytesIO(), encoding="cp1252", errors="strict")


def test_a_cp1252_stdout_cannot_print_chinese_unaided():
    # Establishes that the guard below is not vacuous: without help, this is
    # exactly the failure the operator hits.
    stream = cp1252_stream()
    with pytest.raises(UnicodeEncodeError):
        stream.write("有排名无名单")
        stream.flush()


def test_configure_stdout_makes_chinese_printable(monkeypatch):
    stream = cp1252_stream()
    monkeypatch.setattr(sys, "stdout", stream)

    configure_stdout()

    # The report's own vocabulary: a section label, a skipped footnote row and
    # an edition name.
    sys.stdout.write("有排名无名单 · 说明文字 · 第十一届\n")
    sys.stdout.flush()


def test_configure_stdout_is_safe_when_the_stream_cannot_be_reconfigured(
    monkeypatch,
):
    # Under pytest, or when output is piped through some wrappers, stdout may
    # not expose reconfigure(). Failing to set up output must not take the
    # command down before it does its work.
    class Plain:
        def write(self, text):
            return len(text)

        def flush(self):
            pass

    monkeypatch.setattr(sys, "stdout", Plain())
    configure_stdout()

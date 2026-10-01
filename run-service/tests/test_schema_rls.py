"""Runs the schema.sql RLS tests against a throwaway local Postgres when one is available.

Set PERSEUS_PG_DSN (for example postgresql://postgres@localhost:5432/postgres) or put psql
on PATH with a reachable default server; otherwise the test is skipped. CI provides a
postgres service container and sets the DSN.
"""
import os
import shutil
import subprocess
import uuid
from urllib.parse import urlsplit, urlunsplit
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
SCHEMA = HERE.parent / "supabase" / "schema.sql"
DSN = os.environ.get("PERSEUS_PG_DSN")


def psql(dsn, *args, **kw):
    return subprocess.run(["psql", dsn, "-v", "ON_ERROR_STOP=1", "-X", "-q", *args],
                          capture_output=True, text=True, **kw)


@pytest.mark.skipif(not DSN or not shutil.which("psql"), reason="no PERSEUS_PG_DSN / psql")
def test_rls_policies():
    db = "perseus_rls_" + uuid.uuid4().hex[:8]
    assert psql(DSN, "-c", f"create database {db}").returncode == 0
    u = urlsplit(DSN)
    dsn = urlunsplit((u.scheme, u.netloc, "/" + db, u.query, u.fragment))
    try:
        for f in (HERE / "sql" / "supabase_stub.sql", SCHEMA):
            r = psql(dsn, "-f", str(f))
            assert r.returncode == 0, r.stderr
        r = psql(dsn, "-f", str(HERE / "sql" / "rls_test.sql"))
        assert r.returncode == 0, r.stderr + r.stdout
        assert "ALL RLS TESTS PASSED" in r.stdout
        # idempotency: schema.sql applies twice cleanly
        r = psql(dsn, "-f", str(SCHEMA))
        assert r.returncode == 0, r.stderr
    finally:
        psql(DSN, "-c", f"drop database if exists {db} with (force)")

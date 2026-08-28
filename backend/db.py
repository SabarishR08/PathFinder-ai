"""
Database layer for PathFinder — PostgreSQL via psycopg2.

Reads DATABASE_URL from environment (Supabase pooler connection string).
All profile persistence goes through this module instead of an in-memory dict.
"""
import os
import json
import logging
from datetime import datetime, timezone
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
import psycopg2.pool

logger = logging.getLogger("pathfinder.db")

# ── Connection management ────────────────────────────────────────────────────

DATABASE_URL = os.getenv("DATABASE_URL")
_pool: psycopg2.pool.SimpleConnectionPool | None = None

def _get_pool():
    """Lazy-init a connection pool (min 1, max 5). Reused across requests."""
    global _pool
    if _pool is not None:
        return _pool
    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL environment variable is not set. "
            "Set it to your Supabase pooler connection string before starting the server."
        )
    _pool = psycopg2.pool.SimpleConnectionPool(1, 5, DATABASE_URL)
    logger.info("Database connection pool created (min=1, max=5)")
    return _pool


@contextmanager
def get_cursor():
    """Context manager that yields a cursor and commits on success, rolls back on error.
    Reuses a connection from the pool instead of creating a new one per request."""
    pool = _get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            yield cur
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


def check_connection():
    """Verify the database is reachable. Called at startup — raises on failure."""
    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL is not set. Cannot start without a database connection.\n"
            "Set it in your .env file or environment:\n"
            "  DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres"
        )
    with get_cursor() as cur:
        cur.execute("SELECT 1")
        row = cur.fetchone()
        if row is None:
            raise RuntimeError("Database health check failed: SELECT 1 returned no rows.")
    logger.info("Database connection OK")


# ── Profile CRUD ─────────────────────────────────────────────────────────────

def _row_to_profile(row):
    """Convert a RealDictRow to the dict shape main.py expects."""
    return {
        "name": row["name"],
        "domain": row["domain"],
        "known_skills": row["known_skills"] or [],
        "goal_skill_id": row["goal_skill_id"],
        "time_per_week_hours": row["time_per_week_hours"],
        "completed_skill_ids": row["completed_skill_ids"] or [],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
    }


def create_profile(user_id: str, profile: dict) -> dict:
    """Insert a new profile row. Returns the profile dict."""
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO profiles (user_id, name, domain, known_skills, goal_skill_id, time_per_week_hours, completed_skill_ids, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                user_id,
                profile["name"],
                profile["domain"],
                json.dumps(profile["known_skills"]),
                profile["goal_skill_id"],
                profile.get("time_per_week_hours"),
                json.dumps(profile.get("completed_skill_ids", [])),
                profile["created_at"],
            ),
        )
    logger.info("Profile created in DB: user_id=%s domain=%s", user_id, profile["domain"])
    return profile


def get_profile(user_id: str) -> dict | None:
    """Fetch a profile by user_id. Returns None if not found."""
    with get_cursor() as cur:
        cur.execute("SELECT * FROM profiles WHERE user_id = %s", (user_id,))
        row = cur.fetchone()
    if row is None:
        return None
    return _row_to_profile(row)


def update_profile(user_id: str, updates: dict) -> dict | None:
    """
    Update specific fields of a profile. Returns the updated profile or None.
    'updates' dict keys must match column names (known_skills, completed_skill_ids, etc.).
    """
    if not updates:
        return get_profile(user_id)

    # Build dynamic SET clause
    set_parts = []
    values = []
    for key, value in updates.items():
        if key in ("known_skills", "completed_skill_ids"):
            set_parts.append(f"{key} = %s")
            values.append(json.dumps(value))
        elif key == "time_per_week_hours":
            set_parts.append(f"{key} = %s")
            values.append(value)
        else:
            # Skip unknown keys
            continue

    if not set_parts:
        return get_profile(user_id)

    values.append(user_id)
    query = f"UPDATE profiles SET {', '.join(set_parts)} WHERE user_id = %s RETURNING *"

    with get_cursor() as cur:
        cur.execute(query, tuple(values))
        row = cur.fetchone()

    if row is None:
        return None
    logger.info("Profile updated in DB: user_id=%s fields=%s", user_id, list(updates.keys()))
    return _row_to_profile(row)


def delete_profile(user_id: str) -> bool:
    """Delete a profile. Returns True if a row was deleted."""
    with get_cursor() as cur:
        cur.execute("DELETE FROM profiles WHERE user_id = %s", (user_id,))
        deleted = cur.rowcount > 0
    if deleted:
        logger.info("Profile deleted from DB: user_id=%s", user_id)
    return deleted


def count_profiles() -> int:
    """Return total number of profiles."""
    with get_cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM profiles")
        return cur.fetchone()["count"]


def profile_exists(user_id: str) -> bool:
    """Check if a profile exists without fetching the full row."""
    with get_cursor() as cur:
        cur.execute("SELECT 1 FROM profiles WHERE user_id = %s", (user_id,))
        return cur.fetchone() is not None

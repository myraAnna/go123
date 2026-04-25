from dataclasses import dataclass, field
from datetime import UTC, datetime
from functools import lru_cache
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from src.app.deps import get_config
from src.models.chat import AskEvidence, ChatSessionMessage

DEFAULT_TIME_ZONE = "Asia/Kuala_Lumpur"


class SessionStoreError(RuntimeError):
    pass


@dataclass
class StoredSession:
    merchant_id: str
    time_zone: str
    messages: list[ChatSessionMessage] = field(default_factory=list)


CREATE_SESSIONS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS ai_chat_sessions (
    session_id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL,
    time_zone TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
"""

CREATE_MESSAGES_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS ai_chat_messages (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES ai_chat_sessions(session_id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    evidence JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
"""

CREATE_MESSAGES_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS ai_chat_messages_session_id_id_idx
ON ai_chat_messages(session_id, id)
"""


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _to_iso(value: datetime | str) -> str:
    if isinstance(value, str):
        return value
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


@lru_cache(maxsize=1)
def _database_url() -> str:
    database_url = get_config().database_url
    if not database_url:
        raise SessionStoreError("Missing DATABASE_URL for chat sessions.")
    return database_url


def _connect():
    try:
        return psycopg.connect(_database_url(), row_factory=dict_row)
    except Exception as exc:
        raise SessionStoreError(str(exc)) from exc


def _ensure_schema(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute(CREATE_SESSIONS_TABLE_SQL)
        cur.execute(CREATE_MESSAGES_TABLE_SQL)
        cur.execute(CREATE_MESSAGES_INDEX_SQL)


def _load_messages(conn: psycopg.Connection, session_id: str) -> list[ChatSessionMessage]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT role, content, evidence, created_at
            FROM ai_chat_messages
            WHERE session_id = %s
            ORDER BY id ASC
            """,
            (session_id,),
        )
        rows = cur.fetchall()

    messages: list[ChatSessionMessage] = []
    for row in rows:
        evidence_payload = row["evidence"] or None
        evidence = None
        if evidence_payload:
            evidence = [AskEvidence.model_validate(item) for item in evidence_payload]

        messages.append(
            ChatSessionMessage(
                role=row["role"],
                content=row["content"],
                evidence=evidence,
                createdAt=_to_iso(row["created_at"]),
            )
        )

    return messages


def create_session(
    merchant_id: str,
    time_zone: str = DEFAULT_TIME_ZONE,
) -> str:
    session_id = uuid4().hex

    try:
        with _connect() as conn:
            _ensure_schema(conn)
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO ai_chat_sessions (session_id, merchant_id, time_zone)
                    VALUES (%s, %s, %s)
                    """,
                    (session_id, merchant_id, time_zone),
                )
    except SessionStoreError:
        raise
    except Exception as exc:
        raise SessionStoreError(str(exc)) from exc

    return session_id


def get_session(session_id: str, merchant_id: str) -> StoredSession:
    try:
        with _connect() as conn:
            _ensure_schema(conn)
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT merchant_id, time_zone
                    FROM ai_chat_sessions
                    WHERE session_id = %s
                    """,
                    (session_id,),
                )
                row = cur.fetchone()

            if row is None:
                raise KeyError(session_id)

            if row["merchant_id"] != merchant_id:
                raise PermissionError(session_id)

            return StoredSession(
                merchant_id=row["merchant_id"],
                time_zone=row["time_zone"],
                messages=_load_messages(conn, session_id),
            )
    except (KeyError, PermissionError):
        raise
    except SessionStoreError:
        raise
    except Exception as exc:
        raise SessionStoreError(str(exc)) from exc


def list_messages(session_id: str, merchant_id: str) -> list[ChatSessionMessage]:
    session = get_session(session_id, merchant_id)
    return list(session.messages)


def append_user_message(session_id: str, merchant_id: str, content: str) -> None:
    _append_message(
        session_id=session_id,
        merchant_id=merchant_id,
        role="user",
        content=content,
        evidence=None,
    )


def append_assistant_message(
    session_id: str,
    merchant_id: str,
    content: str,
    evidence: list[AskEvidence],
) -> None:
    evidence_payload = [item.model_dump(exclude_none=True) for item in evidence] or None
    _append_message(
        session_id=session_id,
        merchant_id=merchant_id,
        role="assistant",
        content=content,
        evidence=evidence_payload,
    )


def _append_message(
    *,
    session_id: str,
    merchant_id: str,
    role: str,
    content: str,
    evidence: list[dict] | None,
) -> None:
    created_at = _utc_now_iso()

    try:
        with _connect() as conn:
            _ensure_schema(conn)
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT merchant_id
                    FROM ai_chat_sessions
                    WHERE session_id = %s
                    """,
                    (session_id,),
                )
                session_row = cur.fetchone()

                if session_row is None:
                    raise KeyError(session_id)

                if session_row["merchant_id"] != merchant_id:
                    raise PermissionError(session_id)

                cur.execute(
                    """
                    INSERT INTO ai_chat_messages (
                        session_id,
                        role,
                        content,
                        evidence,
                        created_at
                    )
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (
                        session_id,
                        role,
                        content,
                        Jsonb(evidence) if evidence is not None else None,
                        created_at,
                    ),
                )
    except (KeyError, PermissionError):
        raise
    except SessionStoreError:
        raise
    except Exception as exc:
        raise SessionStoreError(str(exc)) from exc

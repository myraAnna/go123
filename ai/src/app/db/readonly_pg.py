from dataclasses import dataclass
from time import perf_counter

import psycopg
from psycopg.rows import dict_row

from src.app.deps import get_config
from src.models.chat import AskQueryTrace


class ReadOnlyQueryError(RuntimeError):
    pass


@dataclass(frozen=True)
class QueryExecutionResult:
    rows: list[dict]
    trace: AskQueryTrace


class ReadOnlyPostgres:
    def __init__(self, statement_timeout_ms: int = 2000):
        config = get_config()
        if not config.database_url:
            raise ReadOnlyQueryError("Missing DATABASE_URL for analytics queries.")
        self.database_url = config.database_url
        self.statement_timeout_ms = statement_timeout_ms

    def run_query(
        self,
        *,
        name: str,
        sql: str,
        params: tuple,
    ) -> QueryExecutionResult:
        started_at = perf_counter()

        try:
            with psycopg.connect(self.database_url, row_factory=dict_row) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        f"SET statement_timeout = {self.statement_timeout_ms}"
                    )
                    cur.execute("SET default_transaction_read_only = on")
                    cur.execute(sql, params)
                    rows = [dict(row) for row in cur.fetchall()]
        except Exception as exc:
            raise ReadOnlyQueryError(str(exc)) from exc

        duration_ms = int((perf_counter() - started_at) * 1000)
        return QueryExecutionResult(
            rows=rows,
            trace=AskQueryTrace(
                name=name,
                rowCount=len(rows),
                durationMs=duration_ms,
            ),
        )

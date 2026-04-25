from dataclasses import dataclass
from typing import Callable

from src.models.chat import AskEvidence

EvidenceBuilder = Callable[[list[dict]], list[AskEvidence]]
ParamsBuilder = Callable[[int, str], tuple]
DataPresenceCheck = Callable[[list[dict]], bool]


@dataclass(frozen=True)
class AnalyticsTask:
    name: str
    description: str
    sql: str
    build_params: ParamsBuilder
    build_evidence: EvidenceBuilder
    has_data: DataPresenceCheck
    no_data_message: str


def _build_slowest_day_evidence(rows: list[dict]) -> list[AskEvidence]:
    row = rows[0]
    return [
        AskEvidence(label="dayName", value=str(row["day_name"])),
        AskEvidence(label="revenueCents", valueCents=int(row["revenue_cents"])),
        AskEvidence(label="orderCount", value=str(row["order_count"])),
    ]


def _build_busiest_hour_evidence(rows: list[dict]) -> list[AskEvidence]:
    row = rows[0]
    return [
        AskEvidence(label="hour", value=str(row["hour_of_day"])),
        AskEvidence(label="orderCount", value=str(row["order_count"])),
        AskEvidence(label="revenueCents", valueCents=int(row["revenue_cents"])),
    ]


def _build_week_vs_week_evidence(rows: list[dict]) -> list[AskEvidence]:
    row = rows[0]
    evidence = [
        AskEvidence(label="thisWeekCents", valueCents=int(row["this_week_cents"])),
        AskEvidence(label="lastWeekCents", valueCents=int(row["last_week_cents"])),
    ]
    if row["last_week_cents"]:
        pct_change = (
            (int(row["this_week_cents"]) - int(row["last_week_cents"]))
            / int(row["last_week_cents"])
            * 100
        )
        evidence.append(AskEvidence(label="changePct", valuePct=round(pct_change, 2)))
    return evidence


def _build_top_item_evidence(rows: list[dict]) -> list[AskEvidence]:
    row = rows[0]
    return [
        AskEvidence(label="itemName", value=str(row["item_name"])),
        AskEvidence(label="revenueCents", valueCents=int(row["revenue_cents"])),
        AskEvidence(label="qtySold", value=str(row["qty_sold"])),
    ]


def _build_combo_evidence(rows: list[dict]) -> list[AskEvidence]:
    row = rows[0]
    return [
        AskEvidence(label="firstItem", value=str(row["first_item"])),
        AskEvidence(label="secondItem", value=str(row["second_item"])),
        AskEvidence(label="pairCount", value=str(row["pair_count"])),
    ]


def _build_margin_evidence(rows: list[dict]) -> list[AskEvidence]:
    row = rows[0]
    evidence = [
        AskEvidence(label="revenueCents", valueCents=int(row["revenue_cents"])),
        AskEvidence(label="expenseCents", valueCents=int(row["expense_cents"])),
        AskEvidence(label="profitCents", valueCents=int(row["profit_cents"])),
    ]
    revenue_cents = int(row["revenue_cents"])
    if revenue_cents > 0:
        margin_pct = int(row["profit_cents"]) / revenue_cents * 100
        evidence.append(AskEvidence(label="marginPct", valuePct=round(margin_pct, 2)))
    return evidence


def _rows_present(rows: list[dict]) -> bool:
    return bool(rows)


def _week_rows_present(rows: list[dict]) -> bool:
    if not rows:
        return False
    row = rows[0]
    return bool(int(row["this_week_cents"]) or int(row["last_week_cents"]))


def _margin_rows_present(rows: list[dict]) -> bool:
    if not rows:
        return False
    row = rows[0]
    return bool(int(row["revenue_cents"]) or int(row["expense_cents"]))


TASKS = {
    "slowest-day-this-month": AnalyticsTask(
        name="slowest-day-this-month",
        description="Find the slowest sales day for the current month.",
        sql="""
            WITH month_orders AS (
                SELECT
                    created_at AT TIME ZONE %s AS local_created_at,
                    total_cents
                FROM orders
                WHERE merchant_id = %s
                  AND date_trunc('month', created_at AT TIME ZONE %s)
                      = date_trunc('month', now() AT TIME ZONE %s)
            )
            SELECT
                trim(to_char(local_created_at, 'Day')) AS day_name,
                COALESCE(SUM(total_cents), 0)::bigint AS revenue_cents,
                COUNT(*)::int AS order_count
            FROM month_orders
            GROUP BY 1
            ORDER BY revenue_cents ASC, order_count ASC, day_name ASC
            LIMIT 1
        """,
        build_params=lambda merchant_id, time_zone: (
            time_zone,
            merchant_id,
            time_zone,
            time_zone,
        ),
        build_evidence=_build_slowest_day_evidence,
        has_data=_rows_present,
        no_data_message="Belum ada order bulan ini untuk cari hari paling slow.",
    ),
    "busiest-hour-this-month": AnalyticsTask(
        name="busiest-hour-this-month",
        description="Find the busiest hour for the current month.",
        sql="""
            WITH month_orders AS (
                SELECT
                    created_at AT TIME ZONE %s AS local_created_at,
                    total_cents
                FROM orders
                WHERE merchant_id = %s
                  AND date_trunc('month', created_at AT TIME ZONE %s)
                      = date_trunc('month', now() AT TIME ZONE %s)
            )
            SELECT
                EXTRACT(HOUR FROM local_created_at)::int AS hour_of_day,
                COUNT(*)::int AS order_count,
                COALESCE(SUM(total_cents), 0)::bigint AS revenue_cents
            FROM month_orders
            GROUP BY 1
            ORDER BY order_count DESC, revenue_cents DESC, hour_of_day ASC
            LIMIT 1
        """,
        build_params=lambda merchant_id, time_zone: (
            time_zone,
            merchant_id,
            time_zone,
            time_zone,
        ),
        build_evidence=_build_busiest_hour_evidence,
        has_data=_rows_present,
        no_data_message="Belum ada order bulan ini untuk cari jam paling busy.",
    ),
    "week-vs-week-revenue": AnalyticsTask(
        name="week-vs-week-revenue",
        description="Compare this week's revenue versus last week.",
        sql="""
            WITH localized_orders AS (
                SELECT
                    total_cents,
                    created_at AT TIME ZONE %s AS local_created_at
                FROM orders
                WHERE merchant_id = %s
            ),
            weekly AS (
                SELECT
                    CASE
                        WHEN date_trunc('week', local_created_at)
                            = date_trunc('week', now() AT TIME ZONE %s)
                            THEN 'this_week'
                        WHEN date_trunc('week', local_created_at)
                            = date_trunc(
                                'week',
                                (now() AT TIME ZONE %s) - interval '1 week'
                            )
                            THEN 'last_week'
                    END AS bucket,
                    total_cents
                FROM localized_orders
                WHERE date_trunc('week', local_created_at) IN (
                    date_trunc('week', now() AT TIME ZONE %s),
                    date_trunc('week', (now() AT TIME ZONE %s) - interval '1 week')
                )
            )
            SELECT
                COALESCE(
                    SUM(total_cents) FILTER (WHERE bucket = 'this_week'),
                    0
                )::bigint AS this_week_cents,
                COALESCE(
                    SUM(total_cents) FILTER (WHERE bucket = 'last_week'),
                    0
                )::bigint AS last_week_cents
            FROM weekly
        """,
        build_params=lambda merchant_id, time_zone: (
            time_zone,
            merchant_id,
            time_zone,
            time_zone,
            time_zone,
            time_zone,
        ),
        build_evidence=_build_week_vs_week_evidence,
        has_data=_week_rows_present,
        no_data_message=(
            "Tak cukup data minggu ini dan minggu lepas untuk buat comparison."
        ),
    ),
    "top-item-this-month": AnalyticsTask(
        name="top-item-this-month",
        description="Find the top selling item this month.",
        sql="""
            SELECT
                item_name_snapshot AS item_name,
                COALESCE(ROUND(SUM(qty)), 0)::bigint AS qty_sold,
                COALESCE(ROUND(SUM(unit_price_cents * qty)), 0)::bigint AS revenue_cents
            FROM order_items
            WHERE merchant_id = %s
              AND date_trunc('month', created_at AT TIME ZONE %s)
                  = date_trunc('month', now() AT TIME ZONE %s)
            GROUP BY 1
            ORDER BY revenue_cents DESC, qty_sold DESC, item_name ASC
            LIMIT 1
        """,
        build_params=lambda merchant_id, time_zone: (
            merchant_id,
            time_zone,
            time_zone,
        ),
        build_evidence=_build_top_item_evidence,
        has_data=_rows_present,
        no_data_message="Belum ada jualan item bulan ini untuk cari top seller.",
    ),
    "common-combo-this-month": AnalyticsTask(
        name="common-combo-this-month",
        description="Find the most common pair of items sold together this month.",
        sql="""
            WITH pairs AS (
                SELECT
                    LEAST(oi1.item_name_snapshot, oi2.item_name_snapshot) AS first_item,
                    GREATEST(
                        oi1.item_name_snapshot,
                        oi2.item_name_snapshot
                    ) AS second_item,
                    COUNT(*)::int AS pair_count
                FROM order_items oi1
                JOIN order_items oi2
                  ON oi1.order_id = oi2.order_id
                 AND oi1.id < oi2.id
                WHERE oi1.merchant_id = %s
                  AND oi2.merchant_id = %s
                  AND date_trunc('month', oi1.created_at AT TIME ZONE %s)
                      = date_trunc('month', now() AT TIME ZONE %s)
                GROUP BY 1, 2
            )
            SELECT first_item, second_item, pair_count
            FROM pairs
            ORDER BY pair_count DESC, first_item ASC, second_item ASC
            LIMIT 1
        """,
        build_params=lambda merchant_id, time_zone: (
            merchant_id,
            merchant_id,
            time_zone,
            time_zone,
        ),
        build_evidence=_build_combo_evidence,
        has_data=_rows_present,
        no_data_message="Belum ada combo item yang cukup untuk dianalisis bulan ini.",
    ),
    "margin-this-month": AnalyticsTask(
        name="margin-this-month",
        description="Compare this month's revenue against recorded expenses.",
        sql="""
            WITH revenue AS (
                SELECT COALESCE(SUM(total_cents), 0)::bigint AS revenue_cents
                FROM orders
                WHERE merchant_id = %s
                  AND date_trunc('month', created_at AT TIME ZONE %s)
                      = date_trunc('month', now() AT TIME ZONE %s)
            ),
            expense_totals AS (
                SELECT COALESCE(SUM(amount_cents), 0)::bigint AS expense_cents
                FROM expenses
                WHERE merchant_id = %s
                  AND date_trunc('month', expense_date::timestamp)
                      = date_trunc('month', now() AT TIME ZONE %s)
            )
            SELECT
                revenue.revenue_cents,
                expense_totals.expense_cents,
                (
                    revenue.revenue_cents - expense_totals.expense_cents
                )::bigint AS profit_cents
            FROM revenue
            CROSS JOIN expense_totals
        """,
        build_params=lambda merchant_id, time_zone: (
            merchant_id,
            time_zone,
            time_zone,
            merchant_id,
            time_zone,
        ),
        build_evidence=_build_margin_evidence,
        has_data=_margin_rows_present,
        no_data_message=(
            "Belum ada data revenue atau expense bulan ini untuk semak margin."
        ),
    ),
}


def get_task(name: str) -> AnalyticsTask | None:
    return TASKS.get(name)


def build_catalog_summary() -> str:
    return "\n".join(
        f"- {task.name}: {task.description}" for task in TASKS.values()
    )

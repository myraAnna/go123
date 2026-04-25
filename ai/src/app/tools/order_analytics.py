from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime
from enum import Enum
from itertools import combinations
from statistics import mean, pstdev
from typing import Any, Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field, model_validator


class FilterOp(str, Enum):
    EQ = "eq"
    NE = "ne"
    GT = "gt"
    GTE = "gte"
    LT = "lt"
    LTE = "lte"
    IN = "in"
    NOT_IN = "not_in"
    IS_NULL = "is_null"
    IS_NOT_NULL = "is_not_null"


class Dimension(str, Enum):
    DAY = "day"
    WEEK = "week"
    MONTH = "month"
    DAY_OF_WEEK = "dayOfWeek"
    HOUR = "hour"
    TIME_SLOT = "timeSlot"
    IS_WEEKEND = "isWeekend"
    ITEM_NAME = "itemName"
    MENU_ITEM_ID = "menuItemId"
    BUYER_EMAIL = "buyerEmail"


class Metric(str, Enum):
    REVENUE_CENTS = "revenueCents"
    ORDER_COUNT = "orderCount"
    AVG_ORDER_VALUE_CENTS = "avgOrderValueCents"
    ITEM_QTY = "itemQty"
    ITEM_REVENUE_CENTS = "itemRevenueCents"
    ORDERS_CONTAINING_ITEM = "ordersContainingItem"
    AVG_ITEMS_PER_ORDER = "avgItemsPerOrder"
    DISTINCT_BUYERS = "distinctBuyers"
    REPEAT_BUYER_COUNT = "repeatBuyerCount"
    REPEAT_BUYER_RATE = "repeatBuyerRate"


class SortDirection(str, Enum):
    ASC = "asc"
    DESC = "desc"


class ComparisonMode(str, Enum):
    PREVIOUS_PERIOD = "previous_period"
    CUSTOM = "custom"


class AnomalyMethod(str, Enum):
    ZSCORE = "zscore"
    WEEKDAY_BASELINE = "weekday_baseline"


class AssociationType(str, Enum):
    ITEM_PAIRS = "item_pairs"


class TimeRange(BaseModel):
    from_: datetime = Field(alias="from")
    to: datetime

    @model_validator(mode="after")
    def validate_range(self) -> "TimeRange":
        if self.to <= self.from_:
            raise ValueError("timeRange.to must be after timeRange.from")
        return self


class FilterCondition(BaseModel):
    field: str
    op: FilterOp
    value: Any | None = None


class SortSpec(BaseModel):
    field: str
    direction: SortDirection = SortDirection.DESC


class ComparisonSpec(BaseModel):
    mode: ComparisonMode
    baseline_range: TimeRange | None = Field(default=None, alias="baselineRange")

    @model_validator(mode="after")
    def validate_comparison(self) -> "ComparisonSpec":
        if self.mode == ComparisonMode.CUSTOM and not self.baseline_range:
            raise ValueError("baselineRange is required when mode=custom")
        return self


class AnomalySpec(BaseModel):
    series_dimension: Literal[Dimension.DAY] = Field(alias="seriesDimension")
    metric: Metric
    method: AnomalyMethod = AnomalyMethod.ZSCORE
    threshold: float = 2.0
    min_points: int = Field(default=7, alias="minPoints")


class AssociationSpec(BaseModel):
    type: AssociationType
    top_k: int = Field(default=10, alias="topK", ge=1, le=100)
    min_support: int = Field(default=2, alias="minSupport", ge=1)


class AnalyticsQuery(BaseModel):
    timezone: str = "Asia/Kuala_Lumpur"
    time_range: TimeRange = Field(alias="timeRange")
    filters: list[FilterCondition] = Field(default_factory=list)
    dimensions: list[Dimension] = Field(default_factory=list)
    metrics: list[Metric] = Field(default_factory=list)
    sort: list[SortSpec] = Field(default_factory=list)
    limit: int = Field(default=50, ge=1, le=500)
    comparison: ComparisonSpec | None = None
    anomaly: AnomalySpec | None = None
    association: AssociationSpec | None = None

    @model_validator(mode="after")
    def validate_query(self) -> "AnalyticsQuery":
        if not self.metrics and not self.association and not self.anomaly:
            raise ValueError(
                "at least one metric, anomaly, or association must be requested"
            )
        if self.association and self.dimensions:
            raise ValueError("association queries should not include standard dimensions")
        return self


class OrderItem(BaseModel):
    menu_item_id: str = Field(alias="menuItemId")
    name: str
    qty: int
    unit_price_cents: int = Field(alias="unitPriceCents")
    line_total_cents: int = Field(alias="lineTotalCents")


class OrderRecord(BaseModel):
    order_id: str = Field(alias="orderId")
    total_cents: int = Field(alias="totalCents")
    paid_at: datetime | None = Field(alias="paidAt")
    buyer_email: str | None = Field(default=None, alias="buyerEmail")
    created_at: datetime | None = Field(default=None, alias="createdAt")
    items: list[OrderItem] = Field(default_factory=list)


class OrdersDataset(BaseModel):
    orders: list[OrderRecord]


class ComparisonValue(BaseModel):
    metric: str
    current: float | int | None = None
    baseline: float | int | None = None
    delta: float | int | None = None
    delta_pct: float | None = Field(default=None, alias="deltaPct")


class AnomalyRow(BaseModel):
    bucket: str
    metric: str
    value: float
    expected: float | None = None
    z_score: float | None = Field(default=None, alias="zScore")
    deviation_pct: float | None = Field(default=None, alias="deviationPct")
    direction: Literal["high", "low"]


class InsightRow(BaseModel):
    type: str
    label: str
    value: float | int | str
    extra: dict[str, Any] = Field(default_factory=dict)


class AnalyticsResponse(BaseModel):
    meta: dict[str, Any]
    summary: dict[str, Any] = Field(default_factory=dict)
    rows: list[dict[str, Any]] = Field(default_factory=list)
    comparisons: list[ComparisonValue] = Field(default_factory=list)
    anomalies: list[AnomalyRow] = Field(default_factory=list)
    insights: list[InsightRow] = Field(default_factory=list)
    requires_external_data: list[str] = Field(
        default_factory=list,
        alias="requiresExternalData",
    )


def analyze_orders(data: OrdersDataset, query: AnalyticsQuery) -> AnalyticsResponse:
    order_facts, item_facts = _normalize_dataset(data, query.timezone)
    order_facts = _apply_time_range(order_facts, query.time_range)
    item_facts = _apply_time_range(item_facts, query.time_range)

    order_facts = _apply_filters(order_facts, query.filters)
    item_facts = _apply_filters(item_facts, query.filters)

    summary = _compute_summary(order_facts, item_facts, query.metrics)
    rows = _compute_grouped_rows(order_facts, item_facts, query)
    rows = _sort_and_limit(rows, query.sort, query.limit)

    comparisons = _compute_comparison(data, query, order_facts, item_facts)
    anomalies = _compute_anomalies(order_facts, item_facts, query)
    if query.association:
        rows = _compute_item_pair_associations(item_facts, query.association)

    insights = _compute_insights(
        order_facts,
        item_facts,
        rows,
        comparisons,
        anomalies,
        query,
    )

    return AnalyticsResponse(
        meta={
            "timezone": query.timezone,
            "timeRange": {
                "from": query.time_range.from_.isoformat(),
                "to": query.time_range.to.isoformat(),
            },
            "matchedOrders": len(order_facts),
            "matchedOrderItems": len(item_facts),
            "methodUsed": {
                "comparison": (
                    query.comparison.mode.value if query.comparison else None
                ),
                "anomaly": query.anomaly.method.value if query.anomaly else None,
                "association": (
                    query.association.type.value if query.association else None
                ),
            },
        },
        summary=summary,
        rows=rows,
        comparisons=comparisons,
        anomalies=anomalies,
        insights=insights,
        requiresExternalData=[],
    )


def _normalize_dataset(
    data: OrdersDataset,
    timezone: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    tz = ZoneInfo(timezone)
    order_facts: list[dict[str, Any]] = []
    item_facts: list[dict[str, Any]] = []

    for order in data.orders:
        paid_at = order.paid_at
        local_paid = paid_at.astimezone(tz) if paid_at else None
        item_qty_total = sum(item.qty for item in order.items)
        distinct_item_count = len({item.menu_item_id for item in order.items})

        order_row = {
            "orderId": order.order_id,
            "paidAt": paid_at,
            "buyerEmail": order.buyer_email,
            "totalCents": order.total_cents,
            "itemQtyTotal": item_qty_total,
            "distinctItemCount": distinct_item_count,
        }
        order_row.update(_derive_time_fields(local_paid))
        order_facts.append(order_row)

        for item in order.items:
            item_row = {
                "orderId": order.order_id,
                "paidAt": paid_at,
                "buyerEmail": order.buyer_email,
                "menuItemId": item.menu_item_id,
                "itemName": item.name,
                "qty": item.qty,
                "unitPriceCents": item.unit_price_cents,
                "lineTotalCents": item.line_total_cents,
                "totalCents": order.total_cents,
            }
            item_row.update(_derive_time_fields(local_paid))
            item_facts.append(item_row)

    return order_facts, item_facts


def _derive_time_fields(local_dt: datetime | None) -> dict[str, Any]:
    if local_dt is None:
        return {
            "day": None,
            "week": None,
            "month": None,
            "dayOfWeek": None,
            "hour": None,
            "timeSlot": None,
            "isWeekend": None,
        }

    weekday = local_dt.weekday()
    iso = local_dt.isocalendar()
    return {
        "day": local_dt.date().isoformat(),
        "week": f"{iso.year}-W{iso.week:02d}",
        "month": f"{local_dt.year:04d}-{local_dt.month:02d}",
        "dayOfWeek": local_dt.strftime("%A"),
        "hour": local_dt.hour,
        "timeSlot": _time_slot(local_dt.hour),
        "isWeekend": weekday >= 5,
    }


def _time_slot(hour: int) -> str:
    if 6 <= hour < 11:
        return "breakfast"
    if 11 <= hour < 15:
        return "lunch"
    if 15 <= hour < 18:
        return "afternoon"
    if 18 <= hour < 22:
        return "dinner"
    return "night"


def _apply_time_range(
    rows: list[dict[str, Any]],
    time_range: TimeRange,
) -> list[dict[str, Any]]:
    start = time_range.from_
    end = time_range.to
    return [
        row
        for row in rows
        if row.get("paidAt") is not None and start <= row["paidAt"] < end
    ]


def _apply_filters(
    rows: list[dict[str, Any]],
    filters: list[FilterCondition],
) -> list[dict[str, Any]]:
    def matches(row: dict[str, Any], condition: FilterCondition) -> bool:
        value = row.get(condition.field)
        if condition.op == FilterOp.IS_NULL:
            return value is None
        if condition.op == FilterOp.IS_NOT_NULL:
            return value is not None
        if condition.op == FilterOp.EQ:
            return value == condition.value
        if condition.op == FilterOp.NE:
            return value != condition.value
        if condition.op == FilterOp.GT:
            return value is not None and value > condition.value
        if condition.op == FilterOp.GTE:
            return value is not None and value >= condition.value
        if condition.op == FilterOp.LT:
            return value is not None and value < condition.value
        if condition.op == FilterOp.LTE:
            return value is not None and value <= condition.value
        if condition.op == FilterOp.IN:
            return value in (condition.value or [])
        if condition.op == FilterOp.NOT_IN:
            return value not in (condition.value or [])
        raise ValueError(f"Unsupported filter op: {condition.op}")

    return [row for row in rows if all(matches(row, item) for item in filters)]


def _compute_summary(
    order_facts: list[dict[str, Any]],
    item_facts: list[dict[str, Any]],
    metrics: list[Metric],
) -> dict[str, Any]:
    return _calculate_metrics(order_facts, item_facts, metrics)


def _calculate_metrics(
    order_rows: list[dict[str, Any]],
    item_rows: list[dict[str, Any]],
    metrics: list[Metric],
) -> dict[str, Any]:
    result: dict[str, Any] = {}

    if Metric.REVENUE_CENTS in metrics:
        result[Metric.REVENUE_CENTS.value] = sum(r["totalCents"] for r in order_rows)

    if Metric.ORDER_COUNT in metrics:
        result[Metric.ORDER_COUNT.value] = len(order_rows)

    if Metric.AVG_ORDER_VALUE_CENTS in metrics:
        count = len(order_rows)
        result[Metric.AVG_ORDER_VALUE_CENTS.value] = (
            round(sum(r["totalCents"] for r in order_rows) / count, 2)
            if count
            else None
        )

    if Metric.AVG_ITEMS_PER_ORDER in metrics:
        count = len(order_rows)
        result[Metric.AVG_ITEMS_PER_ORDER.value] = (
            round(sum(r["itemQtyTotal"] for r in order_rows) / count, 2)
            if count
            else None
        )

    if (
        Metric.DISTINCT_BUYERS in metrics
        or Metric.REPEAT_BUYER_COUNT in metrics
        or Metric.REPEAT_BUYER_RATE in metrics
    ):
        buyer_counts = Counter(r["buyerEmail"] for r in order_rows if r.get("buyerEmail"))
        distinct_buyers = len(buyer_counts)
        repeat_buyer_count = sum(1 for count in buyer_counts.values() if count > 1)

        if Metric.DISTINCT_BUYERS in metrics:
            result[Metric.DISTINCT_BUYERS.value] = distinct_buyers
        if Metric.REPEAT_BUYER_COUNT in metrics:
            result[Metric.REPEAT_BUYER_COUNT.value] = repeat_buyer_count
        if Metric.REPEAT_BUYER_RATE in metrics:
            result[Metric.REPEAT_BUYER_RATE.value] = (
                round(repeat_buyer_count / distinct_buyers, 4)
                if distinct_buyers
                else None
            )

    if Metric.ITEM_QTY in metrics:
        result[Metric.ITEM_QTY.value] = sum(r["qty"] for r in item_rows)

    if Metric.ITEM_REVENUE_CENTS in metrics:
        result[Metric.ITEM_REVENUE_CENTS.value] = sum(
            r["lineTotalCents"] for r in item_rows
        )

    if Metric.ORDERS_CONTAINING_ITEM in metrics:
        result[Metric.ORDERS_CONTAINING_ITEM.value] = len(
            {r["orderId"] for r in item_rows}
        )

    return result


def _compute_grouped_rows(
    order_facts: list[dict[str, Any]],
    item_facts: list[dict[str, Any]],
    query: AnalyticsQuery,
) -> list[dict[str, Any]]:
    item_dimensions = {Dimension.ITEM_NAME, Dimension.MENU_ITEM_ID}
    source = item_facts if any(d in item_dimensions for d in query.dimensions) else order_facts

    if not query.dimensions:
        return [_calculate_metrics(order_facts, item_facts, query.metrics)]

    buckets: dict[tuple[Any, ...], dict[str, Any]] = {}
    order_ids_by_bucket: dict[tuple[Any, ...], set[str]] = defaultdict(set)
    items_by_order_id: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item_row in item_facts:
        items_by_order_id[item_row["orderId"]].append(item_row)

    for row in source:
        key = tuple(row[dimension.value] for dimension in query.dimensions)
        if key not in buckets:
            buckets[key] = {dimension.value: row[dimension.value] for dimension in query.dimensions}
            buckets[key]["_order_rows"] = []
            buckets[key]["_item_rows"] = []

        if source is order_facts:
            buckets[key]["_order_rows"].append(row)
            order_ids_by_bucket[key].add(row["orderId"])
        else:
            buckets[key]["_item_rows"].append(row)
            order_ids_by_bucket[key].add(row["orderId"])

    if source is item_facts:
        order_index = {row["orderId"]: row for row in order_facts}
        for key, order_ids in order_ids_by_bucket.items():
            buckets[key]["_order_rows"] = [
                order_index[order_id]
                for order_id in order_ids
                if order_id in order_index
            ]
    else:
        for key, order_ids in order_ids_by_bucket.items():
            item_rows: list[dict[str, Any]] = []
            for order_id in order_ids:
                item_rows.extend(items_by_order_id.get(order_id, []))
            buckets[key]["_item_rows"] = item_rows

    rows: list[dict[str, Any]] = []
    for bucket in buckets.values():
        metrics = _calculate_metrics(
            bucket["_order_rows"],
            bucket["_item_rows"],
            query.metrics,
        )
        row = {k: v for k, v in bucket.items() if not k.startswith("_")}
        row.update(metrics)
        rows.append(row)

    return rows


def _sort_and_limit(
    rows: list[dict[str, Any]],
    sort_specs: list[SortSpec],
    limit: int,
) -> list[dict[str, Any]]:
    if not rows:
        return rows

    sorted_rows = rows[:]
    for spec in reversed(sort_specs):
        sorted_rows.sort(
            key=lambda row: (row.get(spec.field) is None, row.get(spec.field)),
            reverse=spec.direction == SortDirection.DESC,
        )
    return sorted_rows[:limit]


def _compute_comparison(
    data: OrdersDataset,
    query: AnalyticsQuery,
    current_order_facts: list[dict[str, Any]],
    current_item_facts: list[dict[str, Any]],
) -> list[ComparisonValue]:
    if not query.comparison or not query.metrics:
        return []

    if query.comparison.mode == ComparisonMode.PREVIOUS_PERIOD:
        duration = query.time_range.to - query.time_range.from_
        baseline_range = TimeRange.model_validate(
            {
                "from": query.time_range.from_ - duration,
                "to": query.time_range.from_,
            }
        )
    else:
        baseline_range = query.comparison.baseline_range

    if baseline_range is None:
        return []

    all_order_facts, all_item_facts = _normalize_dataset(data, query.timezone)
    base_order_facts = _apply_filters(
        _apply_time_range(all_order_facts, baseline_range),
        query.filters,
    )
    base_item_facts = _apply_filters(
        _apply_time_range(all_item_facts, baseline_range),
        query.filters,
    )

    current_metrics = _calculate_metrics(
        current_order_facts,
        current_item_facts,
        query.metrics,
    )
    baseline_metrics = _calculate_metrics(base_order_facts, base_item_facts, query.metrics)

    results: list[ComparisonValue] = []
    for metric in query.metrics:
        key = metric.value
        current = current_metrics.get(key)
        baseline = baseline_metrics.get(key)
        delta = None if current is None or baseline is None else current - baseline
        delta_pct = None
        if baseline not in (None, 0) and delta is not None:
            delta_pct = round((delta / baseline) * 100, 2)
        results.append(
            ComparisonValue(
                metric=key,
                current=current,
                baseline=baseline,
                delta=delta,
                deltaPct=delta_pct,
            )
        )

    return results


def _compute_anomalies(
    order_facts: list[dict[str, Any]],
    item_facts: list[dict[str, Any]],
    query: AnalyticsQuery,
) -> list[AnomalyRow]:
    spec = query.anomaly
    if not spec:
        return []

    daily_query = AnalyticsQuery.model_validate(
        {
            "timezone": query.timezone,
            "timeRange": {
                "from": query.time_range.from_.isoformat(),
                "to": query.time_range.to.isoformat(),
            },
            "dimensions": [Dimension.DAY.value],
            "metrics": [spec.metric.value],
        }
    )
    daily_rows = _compute_grouped_rows(order_facts, item_facts, daily_query)
    values = [
        row.get(spec.metric.value)
        for row in daily_rows
        if row.get(spec.metric.value) is not None
    ]
    if len(values) < spec.min_points:
        return []

    anomalies: list[AnomalyRow] = []
    if spec.method == AnomalyMethod.ZSCORE:
        avg = mean(values)
        std = pstdev(values)
        if std == 0:
            return []
        for row in daily_rows:
            value = row[spec.metric.value]
            z_score = (value - avg) / std
            if abs(z_score) >= spec.threshold:
                anomalies.append(
                    AnomalyRow(
                        bucket=row["day"],
                        metric=spec.metric.value,
                        value=value,
                        expected=round(avg, 2),
                        zScore=round(z_score, 2),
                        deviationPct=(
                            round(((value - avg) / avg) * 100, 2) if avg else None
                        ),
                        direction="high" if z_score > 0 else "low",
                    )
                )
    elif spec.method == AnomalyMethod.WEEKDAY_BASELINE:
        weekday_groups: dict[str, list[float]] = defaultdict(list)
        day_to_weekday: dict[str, str] = {}
        for row in daily_rows:
            weekday = datetime.fromisoformat(row["day"]).strftime("%A")
            weekday_groups[weekday].append(row[spec.metric.value])
            day_to_weekday[row["day"]] = weekday

        weekday_means = {key: mean(group) for key, group in weekday_groups.items() if group}
        for row in daily_rows:
            expected = weekday_means[day_to_weekday[row["day"]]]
            value = row[spec.metric.value]
            deviation_pct = ((value - expected) / expected) * 100 if expected else None
            if deviation_pct is not None and abs(deviation_pct) >= (spec.threshold * 10):
                anomalies.append(
                    AnomalyRow(
                        bucket=row["day"],
                        metric=spec.metric.value,
                        value=value,
                        expected=round(expected, 2),
                        deviationPct=round(deviation_pct, 2),
                        direction="high" if value > expected else "low",
                    )
                )

    return anomalies


def _compute_item_pair_associations(
    item_facts: list[dict[str, Any]],
    spec: AssociationSpec,
) -> list[dict[str, Any]]:
    items_by_order: dict[str, dict[str, str]] = defaultdict(dict)
    for row in item_facts:
        items_by_order[row["orderId"]][row["menuItemId"]] = row["itemName"]

    pair_counts: Counter[tuple[str, str]] = Counter()
    total_orders = len(items_by_order)
    for item_map in items_by_order.values():
        item_ids = sorted(item_map.keys())
        for pair in combinations(item_ids, 2):
            pair_counts[pair] += 1

    rows: list[dict[str, Any]] = []
    for (left_id, right_id), support in pair_counts.most_common(spec.top_k):
        if support < spec.min_support:
            continue
        sample_map = next(
            value
            for value in items_by_order.values()
            if left_id in value and right_id in value
        )
        rows.append(
            {
                "leftMenuItemId": left_id,
                "leftItemName": sample_map[left_id],
                "rightMenuItemId": right_id,
                "rightItemName": sample_map[right_id],
                "support": support,
                "supportRate": round(support / total_orders, 4) if total_orders else None,
            }
        )

    return rows


def _compute_insights(
    order_facts: list[dict[str, Any]],
    item_facts: list[dict[str, Any]],
    rows: list[dict[str, Any]],
    comparisons: list[ComparisonValue],
    anomalies: list[AnomalyRow],
    query: AnalyticsQuery,
) -> list[InsightRow]:
    del order_facts, item_facts
    insights: list[InsightRow] = []

    if rows and query.sort:
        top_field = query.sort[0].field
        top_row = rows[0]
        insights.append(
            InsightRow(
                type="top_row",
                label="top result",
                value=str(top_row.get(top_field, "n/a")),
                extra=top_row,
            )
        )

    comparison_candidates = [
        comparison for comparison in comparisons if comparison.delta_pct is not None
    ]
    if comparison_candidates:
        strongest = max(comparison_candidates, key=lambda item: abs(item.delta_pct or 0))
        insights.append(
            InsightRow(
                type="comparison",
                label=strongest.metric,
                value=strongest.delta_pct or 0,
                extra={
                    "current": strongest.current,
                    "baseline": strongest.baseline,
                },
            )
        )

    for anomaly in anomalies[:3]:
        insights.append(
            InsightRow(
                type="anomaly",
                label=anomaly.bucket,
                value=anomaly.value,
                extra={
                    "direction": anomaly.direction,
                    "zScore": anomaly.z_score,
                },
            )
        )

    if query.association and rows:
        combo = rows[0]
        insights.append(
            InsightRow(
                type="association",
                label="top combo",
                value=f"{combo.get('leftItemName', '')} + {combo.get('rightItemName', '')}".strip(),
                extra=combo,
            )
        )

    return insights[:10]


__all__ = [
    "AnalyticsQuery",
    "AnalyticsResponse",
    "OrdersDataset",
    "analyze_orders",
]

import { API_BASE } from "@/constants/api";
import { ApiError } from "@/queries/onboarding";

export type StatsSummary = {
  revenueCents: number;
  orderCount: number;
  averageOrderValueCents: number;
  periodDays: number;
  comparePrevious: {
    revenueChangePct: number;
    orderCountChangePct: number;
  } | null;
};

export type TopItem = {
  menuItemId: string;
  name: string;
  qty: number;
  revenueCents: number;
};

export type TopItems = {
  best: TopItem[];
  worst: TopItem[];
};

export type TrendPoint = {
  bucket: string;
  revenueCents: number;
  orderCount: number;
};

export type Trend = {
  bucket: "day" | "week" | "month";
  points: TrendPoint[];
};

export type HeatmapCell = {
  dayOfWeek: number;
  hour: number;
  orderCount: number;
  revenueCents: number;
};

export type Heatmap = {
  cells: HeatmapCell[];
};

type Range = { since?: string; until?: string };

function buildQuery(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

const HEADERS: HeadersInit = {
  Accept: "application/json",
  "X-Merchant-Id": "1",
};

export async function fetchStatsSummary(
  range: Range & { compare?: boolean } = {},
): Promise<StatsSummary> {
  const qs = buildQuery({ ...range, compare: range.compare ?? true });
  const res = await fetch(`${API_BASE}/v1/stats/summary${qs}`, { headers: HEADERS });
  if (!res.ok) throw new ApiError(res.status);
  return (await res.json()) as StatsSummary;
}

export async function fetchTopItems(
  range: Range & { limit?: number } = {},
): Promise<TopItems> {
  const qs = buildQuery({ ...range, limit: range.limit ?? 5 });
  const res = await fetch(`${API_BASE}/v1/stats/top-items${qs}`, { headers: HEADERS });
  if (!res.ok) throw new ApiError(res.status);
  return (await res.json()) as TopItems;
}

export async function fetchTrend(
  range: Range & { bucket?: "day" | "week" | "month" | "auto" } = {},
): Promise<Trend> {
  const qs = buildQuery({ ...range, bucket: range.bucket ?? "auto" });
  const res = await fetch(`${API_BASE}/v1/stats/trend${qs}`, { headers: HEADERS });
  if (!res.ok) throw new ApiError(res.status);
  return (await res.json()) as Trend;
}

export async function fetchHeatmap(range: Range = {}): Promise<Heatmap> {
  const qs = buildQuery(range);
  const res = await fetch(`${API_BASE}/v1/stats/heatmap${qs}`, { headers: HEADERS });
  if (!res.ok) throw new ApiError(res.status);
  return (await res.json()) as Heatmap;
}

export function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString();
}

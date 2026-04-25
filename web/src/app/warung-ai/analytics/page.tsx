"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShoppingBag,
  Bot,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  ChevronRight,
  Flame,
  Snowflake,
} from "lucide-react";
import { StatusBar } from "@/components/services/StatusBar";
import {
  fetchStatsSummary,
  fetchTopItems,
  fetchTrend,
  fetchHeatmap,
  isoDaysAgo,
  type StatsSummary,
  type TopItems,
  type Trend,
  type Heatmap,
} from "@/queries/stats";

// ------------------------------------------------------------------
// Fallback dataset — keeps the layout legible if the API is offline.
// ------------------------------------------------------------------
const MOCK_SUMMARY: StatsSummary = {
  revenueCents: 1850000,
  orderCount: 412,
  averageOrderValueCents: 4490,
  periodDays: 30,
  comparePrevious: { revenueChangePct: 12.4, orderCountChangePct: 8.1 },
};

const MOCK_TOP: TopItems = {
  best: [
    { menuItemId: "1", name: "Nasi Lemak Biasa", qty: 220, revenueCents: 110000 },
    { menuItemId: "2", name: "Ayam Goreng", qty: 184, revenueCents: 73600 },
    { menuItemId: "3", name: "Kopi O Ais", qty: 161, revenueCents: 28980 },
    { menuItemId: "4", name: "Telur Mata", qty: 142, revenueCents: 21300 },
    { menuItemId: "5", name: "Roti Canai", qty: 98, revenueCents: 14700 },
  ],
  worst: [
    { menuItemId: "9", name: "Roti Bakar Sardin", qty: 0, revenueCents: 0 },
    { menuItemId: "12", name: "Mee Hoon Tom Yam", qty: 2, revenueCents: 800 },
    { menuItemId: "14", name: "Cendol Special", qty: 4, revenueCents: 1600 },
  ],
};

const MOCK_TREND: Trend = {
  bucket: "day",
  points: Array.from({ length: 30 }).map((_, i) => {
    const dow = i % 7;
    const base = 40000 + Math.sin(i / 2.4) * 18000 + (dow === 5 || dow === 6 ? 22000 : 0);
    const noise = (i * 7919) % 9000;
    const cents = Math.max(8000, Math.round(base + noise - 4500));
    const date = new Date(Date.now() - (29 - i) * 86400_000)
      .toISOString()
      .slice(0, 10);
    return { bucket: date, revenueCents: cents, orderCount: Math.round(cents / 4500) };
  }),
};

const MOCK_HEATMAP: Heatmap = {
  cells: (() => {
    const out: Heatmap["cells"] = [];
    for (let d = 0; d < 7; d++) {
      for (let h = 7; h < 22; h++) {
        const isWeekend = d === 0 || d === 6;
        const peakLunch = h >= 12 && h <= 13 ? 1.6 : 1;
        const peakTea = h >= 16 && h <= 17 ? 1.3 : 1;
        const peakDinner = h >= 19 && h <= 20 ? 1.4 : 1;
        const intensity =
          (isWeekend ? 1.4 : 1) * peakLunch * peakTea * peakDinner;
        const base = Math.round(2 + intensity * (3 + ((d * 13 + h * 7) % 5)));
        if (base <= 0) continue;
        out.push({
          dayOfWeek: d,
          hour: h,
          orderCount: base,
          revenueCents: base * 4500,
        });
      }
    }
    return out;
  })(),
};

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
type Period = { key: "7d" | "30d" | "90d"; label: string; days: number };
const PERIODS: Period[] = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
];

function formatRM(cents: number): string {
  const rm = cents / 100;
  if (rm >= 1_000_000) return `${(rm / 1_000_000).toFixed(2)}M`;
  if (rm >= 10_000) return `${(rm / 1000).toFixed(1)}K`;
  return rm.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatRMShort(cents: number): string {
  const rm = cents / 100;
  if (rm >= 1000) return `${Math.round(rm / 100) / 10}K`;
  return `${rm.toFixed(0)}`;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

// ------------------------------------------------------------------
// Page
// ------------------------------------------------------------------
export default function AnalyticsPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>(PERIODS[1]);
  const [moverTab, setMoverTab] = useState<"best" | "worst">("best");

  const [summary, setSummary] = useState<StatsSummary>(MOCK_SUMMARY);
  const [topItems, setTopItems] = useState<TopItems>(MOCK_TOP);
  const [trend, setTrend] = useState<Trend>(MOCK_TREND);
  const [heatmap, setHeatmap] = useState<Heatmap>(MOCK_HEATMAP);

  useEffect(() => {
    let cancelled = false;
    const since = isoDaysAgo(period.days);
    const until = new Date().toISOString();

    Promise.allSettled([
      fetchStatsSummary({ since, until, compare: true }),
      fetchTopItems({ since, until, limit: 5 }),
      fetchTrend({ since, until, bucket: "auto" }),
      fetchHeatmap({ since, until }),
    ]).then((results) => {
      if (cancelled) return;
      const [sum, top, tr, hm] = results;
      if (sum.status === "fulfilled") setSummary(sum.value);
      if (top.status === "fulfilled") setTopItems(top.value);
      if (tr.status === "fulfilled") setTrend(tr.value);
      if (hm.status === "fulfilled") setHeatmap(hm.value);
    });

    return () => {
      cancelled = true;
    };
  }, [period]);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="max-w-[390px] mx-auto min-h-screen flex flex-col">
        {/* Status bar */}
        <div className="bg-white px-5 pt-4 pb-0">
          <StatusBar time="9:41" show4G={false} theme="dark" />
        </div>

        {/* Nav */}
        <div className="bg-white flex items-center gap-3 px-5 h-14 border-b border-[#F0F0F0]">
          <span className="text-[#0F172A] text-[17px] font-bold flex-1">
            Analytics
          </span>
          <span className="text-[#64748B] text-[12px]">
            Last {period.days} days
          </span>
        </div>

        {/* Period selector */}
        <div className="px-4 pt-4">
          <div className="flex items-center gap-2">
            {PERIODS.map((p) => {
              const active = p.key === period.key;
              return (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p)}
                  className={`shrink-0 h-8 px-4 rounded-full text-xs font-semibold transition-colors ${
                    active
                      ? "bg-[#2563EB] text-white"
                      : "bg-white text-[#64748B] border border-[#E5E7EB]"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 px-4 pt-4 pb-24 flex flex-col gap-3">
          <RevenueHero summary={summary} />
          <SubKpis summary={summary} />
          <TrendCard trend={trend} />
          <MoversCard topItems={topItems} tab={moverTab} setTab={setMoverTab} />
          <HeatmapCard heatmap={heatmap} />
          <AskAiNudge onClick={() => router.push("/warung-ai/chat")} />
        </div>

        {/* Bottom Nav */}
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-white border-t border-[#E8EAED] h-16 flex z-20">
          <button
            onClick={() => router.push("/warung-ai/pos")}
            className="flex-1 flex flex-col items-center justify-center gap-0.5"
          >
            <ShoppingBag className="w-[22px] h-[22px] text-[#9CA3AF]" />
            <span className="text-[11px] text-[#9CA3AF]">POS</span>
          </button>
          <button
            onClick={() => router.push("/warung-ai/chat")}
            className="flex-1 flex flex-col items-center justify-center gap-0.5"
          >
            <Bot className="w-[22px] h-[22px] text-[#9CA3AF]" />
            <span className="text-[11px] text-[#9CA3AF]">Ask AI</span>
          </button>
          <button className="flex-1 flex flex-col items-center justify-center gap-0.5">
            <TrendingUp className="w-[22px] h-[22px] text-[#4F6FF0]" />
            <span className="text-[11px] font-semibold text-[#4F6FF0]">
              Analytics
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Hero revenue card
// ------------------------------------------------------------------
function RevenueHero({ summary }: { summary: StatsSummary }) {
  const delta = summary.comparePrevious?.revenueChangePct ?? 0;
  const positive = delta >= 0;

  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] px-5 py-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[#64748B] text-[12px] font-semibold">
          Gross Revenue
        </span>
        {summary.comparePrevious && (
          <div
            className={`flex items-center gap-1 px-2 h-6 rounded-full text-[11px] font-semibold ${
              positive
                ? "bg-[#DCFCE7] text-[#166534]"
                : "bg-[#FEE2E2] text-[#B91C1C]"
            }`}
          >
            {positive ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : (
              <ArrowDownRight className="w-3 h-3" />
            )}
            {Math.abs(delta).toFixed(1)}%
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-[#1D4ED8] text-[14px] font-semibold">RM</span>
        <span className="text-[#0F172A] text-[36px] font-bold tabular-nums leading-none tracking-tight">
          {formatRM(summary.revenueCents)}
        </span>
      </div>

      <div className="mt-2 text-[11px] text-[#94A3B8]">
        vs previous {summary.periodDays} days
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Sub KPIs: Orders + AOV
// ------------------------------------------------------------------
function SubKpis({ summary }: { summary: StatsSummary }) {
  const orderDelta = summary.comparePrevious?.orderCountChangePct ?? 0;
  const orderPositive = orderDelta >= 0;

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="bg-white rounded-2xl border border-[#E5E7EB] px-4 py-4">
        <span className="text-[#64748B] text-[11px] font-semibold">Orders</span>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-[#0F172A] text-[24px] font-bold tabular-nums leading-none">
            {summary.orderCount}
          </span>
          {summary.comparePrevious && (
            <span
              className={`text-[10px] font-semibold ${
                orderPositive ? "text-[#166534]" : "text-[#B91C1C]"
              }`}
            >
              {orderPositive ? "↑" : "↓"} {Math.abs(orderDelta).toFixed(1)}%
            </span>
          )}
        </div>
        <span className="mt-1.5 inline-block text-[11px] text-[#94A3B8]">
          paid orders
        </span>
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E7EB] px-4 py-4">
        <span className="text-[#64748B] text-[11px] font-semibold">
          Avg Order
        </span>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-[#1D4ED8] text-[12px] font-semibold">RM</span>
          <span className="text-[#0F172A] text-[24px] font-bold tabular-nums leading-none">
            {(summary.averageOrderValueCents / 100).toFixed(2)}
          </span>
        </div>
        <span className="mt-1.5 inline-block text-[11px] text-[#94A3B8]">
          per ticket
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Trend chart
// ------------------------------------------------------------------
function TrendCard({ trend }: { trend: Trend }) {
  const { path, areaPath, points, max, dotPositions, labels } = useMemo(() => {
    const W = 326;
    const H = 130;
    const pad = { l: 4, r: 4, t: 8, b: 18 };
    const innerW = W - pad.l - pad.r;
    const innerH = H - pad.t - pad.b;
    const pts = trend.points;
    if (pts.length === 0) {
      return {
        path: "",
        areaPath: "",
        points: pts,
        max: 0,
        dotPositions: [] as { x: number; y: number; p: typeof pts[number] }[],
        labels: [] as { x: number; text: string }[],
      };
    }
    const max = Math.max(...pts.map((p) => p.revenueCents), 1);

    const xy = pts.map((p, i) => {
      const x = pad.l + (i / Math.max(pts.length - 1, 1)) * innerW;
      const y = pad.t + (1 - p.revenueCents / max) * innerH;
      return { x, y, p };
    });

    const buildPath = (close: boolean) => {
      if (xy.length === 0) return "";
      let d = `M ${xy[0].x.toFixed(2)} ${xy[0].y.toFixed(2)}`;
      for (let i = 0; i < xy.length - 1; i++) {
        const p0 = xy[i - 1] ?? xy[i];
        const p1 = xy[i];
        const p2 = xy[i + 1];
        const p3 = xy[i + 2] ?? p2;
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(
          2,
        )} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
      }
      if (close) {
        d += ` L ${xy[xy.length - 1].x.toFixed(2)} ${(pad.t + innerH).toFixed(
          2,
        )} L ${xy[0].x.toFixed(2)} ${(pad.t + innerH).toFixed(2)} Z`;
      }
      return d;
    };

    const mid = Math.floor(xy.length / 2);
    const labels = [
      { x: xy[0].x, text: shortDate(xy[0].p.bucket) },
      { x: xy[mid].x, text: shortDate(xy[mid].p.bucket) },
      { x: xy[xy.length - 1].x, text: shortDate(xy[xy.length - 1].p.bucket) },
    ];

    return {
      path: buildPath(false),
      areaPath: buildPath(true),
      points: pts,
      max,
      dotPositions: xy,
      labels,
    };
  }, [trend]);

  const peakIdx = useMemo(() => {
    if (points.length === 0) return -1;
    let idx = 0;
    let best = -Infinity;
    points.forEach((p, i) => {
      if (p.revenueCents > best) {
        best = p.revenueCents;
        idx = i;
      }
    });
    return idx;
  }, [points]);

  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] px-4 pt-4 pb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[#0F172A] text-[14px] font-bold">
          Daily Revenue
        </span>
        <span className="bg-[#DBEAFE] text-[#1D4ED8] text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide">
          per {trend.bucket}
        </span>
      </div>
      <p className="text-[12px] text-[#64748B] mb-2">
        {points.length > 0 && peakIdx >= 0
          ? `Peak: ${shortDate(points[peakIdx].bucket)} — RM ${formatRMShort(
              points[peakIdx].revenueCents,
            )}`
          : "No paid orders in this window yet."}
      </p>

      <div className="relative">
        <svg
          viewBox="0 0 326 130"
          className="w-full h-[130px] block"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4F6FF0" stopOpacity="0.28" />
              <stop offset="60%" stopColor="#4F6FF0" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#4F6FF0" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Median rule */}
          <line
            x1="0"
            y1="64"
            x2="326"
            y2="64"
            stroke="#E5E7EB"
            strokeDasharray="3 4"
          />

          {areaPath && <path d={areaPath} fill="url(#trendFill)" />}
          {path && (
            <path
              d={path}
              fill="none"
              stroke="#2563EB"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Peak marker */}
          {peakIdx >= 0 && dotPositions[peakIdx] && (
            <g>
              <line
                x1={dotPositions[peakIdx].x}
                y1={dotPositions[peakIdx].y - 4}
                x2={dotPositions[peakIdx].x}
                y2="0"
                stroke="#2563EB"
                strokeWidth="1"
                strokeDasharray="2 2"
                strokeOpacity="0.4"
              />
              <circle
                cx={dotPositions[peakIdx].x}
                cy={dotPositions[peakIdx].y}
                r="5"
                fill="white"
                stroke="#2563EB"
                strokeWidth="2"
              />
            </g>
          )}

          {/* X-axis labels */}
          {labels.map((l, i) => (
            <text
              key={i}
              x={l.x}
              y="125"
              fontSize="9"
              fill="#94A3B8"
              textAnchor={
                i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"
              }
            >
              {l.text}
            </text>
          ))}

          {/* Y-axis max label */}
          <text x="322" y="14" fontSize="9" fill="#94A3B8" textAnchor="end">
            RM {formatRMShort(max)}
          </text>
        </svg>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Movers card — best/worst
// ------------------------------------------------------------------
function MoversCard({
  topItems,
  tab,
  setTab,
}: {
  topItems: TopItems;
  tab: "best" | "worst";
  setTab: (t: "best" | "worst") => void;
}) {
  const list = tab === "best" ? topItems.best : topItems.worst;
  const max = Math.max(...list.map((i) => i.qty), 1);

  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] px-4 pt-4 pb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[#0F172A] text-[14px] font-bold">
          Top Movers
        </span>
        <div className="inline-flex bg-[#F1F5F9] rounded-full p-0.5 gap-0">
          <button
            onClick={() => setTab("best")}
            className={`px-3 h-7 rounded-full text-[11px] font-semibold transition-colors flex items-center gap-1 ${
              tab === "best"
                ? "bg-white text-[#0F172A] shadow-sm"
                : "text-[#64748B]"
            }`}
          >
            <Flame className="w-3 h-3" />
            Best
          </button>
          <button
            onClick={() => setTab("worst")}
            className={`px-3 h-7 rounded-full text-[11px] font-semibold transition-colors flex items-center gap-1 ${
              tab === "worst"
                ? "bg-white text-[#0F172A] shadow-sm"
                : "text-[#64748B]"
            }`}
          >
            <Snowflake className="w-3 h-3" />
            Worst
          </button>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="text-[13px] text-[#94A3B8] py-4 text-center">
          No items in this list.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((item, i) => {
            const pct = (item.qty / max) * 100;
            const dead = tab === "worst" && item.qty === 0;
            return (
              <li key={item.menuItemId} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-[10px] text-[#94A3B8] tabular-nums w-3 shrink-0 font-semibold">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[14px] text-[#0F172A] font-semibold truncate">
                      {item.name}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1 shrink-0">
                    <span className="text-[14px] text-[#0F172A] tabular-nums font-bold">
                      {item.qty}
                    </span>
                    <span className="text-[10px] text-[#94A3B8]">sold</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-[#F1F5F9] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: dead ? "100%" : `${Math.max(pct, 4)}%`,
                        background: dead
                          ? "repeating-linear-gradient(45deg, #FECACA 0 4px, #FEE2E2 4px 8px)"
                          : tab === "best"
                          ? "#2563EB"
                          : "#94A3B8",
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-[#94A3B8] tabular-nums shrink-0 w-14 text-right font-semibold">
                    RM {formatRMShort(item.revenueCents)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Heatmap card
// ------------------------------------------------------------------
function HeatmapCard({ heatmap }: { heatmap: Heatmap }) {
  const HOURS = Array.from({ length: 17 }).map((_, i) => i + 7);

  const grid = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of heatmap.cells) {
      m.set(`${c.dayOfWeek}-${c.hour}`, c.orderCount);
    }
    return m;
  }, [heatmap]);

  const max = useMemo(() => {
    let m = 1;
    for (const c of heatmap.cells) if (c.orderCount > m) m = c.orderCount;
    return m;
  }, [heatmap]);

  const peak = useMemo(() => {
    let best: { day: number; hour: number; count: number } | null = null;
    for (const c of heatmap.cells) {
      if (!best || c.orderCount > best.count) {
        best = { day: c.dayOfWeek, hour: c.hour, count: c.orderCount };
      }
    }
    return best;
  }, [heatmap]);

  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] px-4 pt-4 pb-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[#0F172A] text-[14px] font-bold">
          Busiest Hours
        </span>
        <span className="bg-[#F1F5F9] text-[#475569] text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide">
          MYT
        </span>
      </div>
      <p className="text-[12px] text-[#64748B] mb-3">
        {peak
          ? `Peak: ${DAY_LABELS[peak.day]} ${peak.hour}:00 — ${peak.count} orders`
          : "No paid orders yet."}
      </p>

      <div className="flex gap-1">
        {/* Day labels */}
        <div className="flex flex-col gap-0.5 pt-0.5">
          {DAY_INITIALS.map((d, i) => (
            <div
              key={i}
              className="h-[14px] w-3 flex items-center justify-center text-[9px] text-[#94A3B8] font-semibold"
            >
              {d}
            </div>
          ))}
        </div>
        {/* Grid */}
        <div className="flex-1 flex flex-col gap-0.5">
          {DAY_LABELS.map((_, day) => (
            <div key={day} className="flex gap-0.5">
              {HOURS.map((hour) => {
                const v = grid.get(`${day}-${hour}`) ?? 0;
                const intensity = v / max;
                const isPeak = peak && peak.day === day && peak.hour === hour;
                return (
                  <div
                    key={hour}
                    className="flex-1 aspect-square rounded-[3px]"
                    style={{
                      backgroundColor:
                        v === 0
                          ? "#F1F5F9"
                          : `rgba(37, 99, 235, ${0.18 + intensity * 0.82})`,
                      outline: isPeak ? "1.5px solid #1D4ED8" : undefined,
                      outlineOffset: isPeak ? "1px" : undefined,
                    }}
                    title={`${DAY_LABELS[day]} ${hour}:00 — ${v} orders`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Hour axis */}
      <div className="flex gap-0.5 mt-1.5 pl-4">
        {HOURS.map((h) => {
          const show = h % 4 === 0 || h === HOURS[HOURS.length - 1];
          return (
            <div
              key={h}
              className="flex-1 text-center text-[8px] text-[#94A3B8]"
            >
              {show ? `${h}` : ""}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-3">
        <span className="text-[10px] text-[#94A3B8] font-semibold">Quiet</span>
        <div className="flex-1 flex gap-0.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 h-1.5 rounded-sm"
              style={{
                backgroundColor: `rgba(37, 99, 235, ${0.18 + (i / 7) * 0.82})`,
              }}
            />
          ))}
        </div>
        <span className="text-[10px] text-[#94A3B8] font-semibold">Busy</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Ask AI nudge
// ------------------------------------------------------------------
function AskAiNudge({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-2xl px-4 py-3.5 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
    >
      <div className="w-10 h-10 rounded-full bg-[#2563EB] flex items-center justify-center shrink-0">
        <Sparkles className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[#0F172A] text-[14px] font-bold">
          Ask AI about these numbers
        </p>
        <p className="text-[#64748B] text-[11px] mt-0.5">
          Get insights in plain Malay or English
        </p>
      </div>
      <ChevronRight className="w-5 h-5 text-[#9CA3AF] shrink-0" />
    </button>
  );
}

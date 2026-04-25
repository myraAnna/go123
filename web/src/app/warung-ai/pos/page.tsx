"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Mic,
  Plus,
  Minus,
  ShoppingBag,
  Bot,
  TrendingUp,
  Utensils,
  Camera,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { StatusBar } from "@/components/services/StatusBar";
import { fetchOnboardingMenu, type MenuItem } from "@/queries/onboarding";
import { createOrder } from "@/queries/orders";

type Category = "all" | "main" | "side" | "drink" | "dessert" | "other";

const FILTERS: { key: Category; label: string }[] = [
  { key: "all", label: "All" },
  { key: "main", label: "Main" },
  { key: "side", label: "Side" },
  { key: "drink", label: "Drink" },
  { key: "dessert", label: "Dessert" },
  { key: "other", label: "Other" },
];

const CATEGORY_BADGE: Record<string, string> = {
  main: "bg-[#DCFCE7] text-[#166534]",
  side: "bg-[#F3E8FF] text-[#6B21A8]",
  drink: "bg-[#DBEAFE] text-[#1D4ED8]",
  dessert: "bg-[#FCE7F3] text-[#9D174D]",
  other: "bg-[#F1F5F9] text-[#475569]",
};

const FILTER_ACTIVE: Record<Category, string> = {
  all: "bg-[#2563EB] text-white",
  main: "bg-[#DCFCE7] text-[#166534]",
  side: "bg-[#F3E8FF] text-[#6B21A8]",
  drink: "bg-[#DBEAFE] text-[#1D4ED8]",
  dessert: "bg-[#FCE7F3] text-[#9D174D]",
  other: "bg-[#F1F5F9] text-[#475569]",
};

function formatRM(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`;
}

export default function POSPage() {
  const router = useRouter();
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<Category>("all");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const addToCart = (id: string) =>
    setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));

  const removeFromCart = (id: string) =>
    setCart((c) => {
      const next = { ...c };
      const qty = (next[id] ?? 0) - 1;
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchOnboardingMenu()
      .then((data) => {
        if (cancelled) return;
        setItems(data);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Couldn't load menu items.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!items) return [];
    if (activeFilter === "all") return items;
    return items.filter((it) => it.category === activeFilter);
  }, [items, activeFilter]);

  const cartTotals = useMemo(() => {
    if (!items) return { qty: 0, cents: 0 };
    let qty = 0;
    let cents = 0;
    for (const item of items) {
      const q = cart[item.id] ?? 0;
      if (q > 0) {
        qty += q;
        cents += q * item.priceCents;
      }
    }
    return { qty, cents };
  }, [items, cart]);

  const isEmpty = !loading && !error && (items?.length ?? 0) === 0;
  const hasItems = !loading && !error && (items?.length ?? 0) > 0;

  const handleProcessPayment = async () => {
    if (!items || submitting) return;
    const payload = Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([menuItemId, qty]) => ({ menuItemId, qty }));
    if (payload.length === 0) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const order = await createOrder(payload);
      try {
        sessionStorage.setItem("warung-ai:order", JSON.stringify(order));
      } catch {}
      router.push("/warung-ai/qr-payment");
    } catch {
      setSubmitError("Couldn't create order. Try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="max-w-[390px] mx-auto min-h-screen flex flex-col">
        {/* Status Bar */}
        <div className="bg-white px-5 pt-4 pb-0">
          <StatusBar time="9:41" show4G={false} theme="dark" />
        </div>

        {/* Nav */}
        <div className="bg-white flex items-center gap-3 px-5 h-14 border-b border-[#F0F0F0]">
          <span className="text-[#0F172A] text-[17px] font-bold flex-1">Warung POS</span>
          <button
            onClick={() => router.push("/warung-ai/choose-method")}
            className="flex items-center gap-1 bg-[#2563EB] text-white text-xs font-semibold px-3 h-8 rounded-full"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Item
          </button>
          <button className="w-9 h-8 bg-white border border-[#E5E7EB] rounded-lg flex items-center justify-center">
            <Mic className="w-4 h-4 text-[#4F6EF7]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col gap-3 px-4 pt-4 pb-48">
          {/* Section header */}
          <div className="flex items-center justify-between">
            <span className="text-[#0F172A] text-base font-bold">Menu Items</span>
            {hasItems && (
              <span className="bg-[#DBEAFE] text-[#1D4ED8] text-[11px] font-semibold px-2.5 py-1 rounded-full">
                {items!.length} {items!.length === 1 ? "item" : "items"}
              </span>
            )}
          </div>

          {/* Filters */}
          {hasItems && (
            <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1">
              {FILTERS.map((f) => {
                const isActive = activeFilter === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => setActiveFilter(f.key)}
                    className={`shrink-0 h-8 px-3.5 rounded-full text-xs font-semibold transition-colors ${
                      isActive
                        ? FILTER_ACTIVE[f.key]
                        : "bg-white text-[#64748B] border border-[#E5E7EB]"
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[#64748B]">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-sm">Loading menu…</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mx-1 mt-2 flex items-start gap-2 rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-3 py-2.5 text-[#B91C1C] text-[13px]">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Items grid */}
          {hasItems && (
            <div className="grid grid-cols-2 gap-3 mt-1">
              {filtered.map((item) => {
                const qty = cart[item.id] ?? 0;
                const inCart = qty > 0;
                const badgeClass =
                  CATEGORY_BADGE[item.category] ?? CATEGORY_BADGE.other;
                return (
                  <div
                    key={item.id}
                    className={`bg-white rounded-xl px-3 py-3 flex flex-col gap-2 border transition-colors ${
                      inCart
                        ? "border-[#2563EB] ring-1 ring-[#2563EB] bg-[#EFF6FF]"
                        : "border-[#E5E7EB]"
                    }`}
                  >
                    <span className="text-[#0F172A] text-sm font-bold leading-snug line-clamp-2">
                      {item.name}
                    </span>
                    <span
                      className={`self-start text-[10px] font-semibold px-2 py-0.5 rounded-md ${badgeClass}`}
                    >
                      {item.category}
                    </span>
                    <div className="flex items-center justify-between mt-auto pt-1">
                      <span className="text-[#1D4ED8] text-base font-bold">
                        {formatRM(item.priceCents)}
                      </span>
                      {inCart ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => removeFromCart(item.id)}
                            aria-label={`Remove one ${item.name}`}
                            className="w-6 h-6 rounded-full bg-white border border-[#CBD5E1] flex items-center justify-center active:scale-95"
                          >
                            <Minus className="w-3 h-3 text-[#0F172A]" />
                          </button>
                          <span className="text-[13px] font-bold text-[#0F172A] min-w-[14px] text-center tabular-nums">
                            {qty}
                          </span>
                          <button
                            onClick={() => addToCart(item.id)}
                            aria-label={`Add one ${item.name}`}
                            className="w-6 h-6 rounded-full bg-[#2563EB] flex items-center justify-center active:scale-95"
                          >
                            <Plus className="w-3 h-3 text-white" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(item.id)}
                          aria-label={`Add ${item.name} to cart`}
                          className="flex items-center gap-1 bg-[#2563EB] text-white text-[11px] font-semibold pl-2 pr-2.5 h-7 rounded-full active:scale-95"
                        >
                          <Plus className="w-3 h-3" />
                          Add
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="col-span-2 text-center text-[#64748B] text-sm py-6">
                  No items in this category.
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {isEmpty && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="w-20 h-20 rounded-full bg-[#EFF6FF] flex items-center justify-center">
                <Utensils className="w-9 h-9 text-[#93C5FD]" />
              </div>
              <span className="text-[#0F172A] text-base font-semibold">No menu items yet</span>
              <span className="text-[#6B7280] text-[13px] text-center leading-relaxed max-w-[240px]">
                Add your first item to start taking orders
              </span>
              <button
                onClick={() => router.push("/warung-ai/choose-method")}
                className="flex items-center gap-2 bg-[#2563EB] text-white text-[15px] font-semibold h-12 px-6 rounded-xl"
              >
                <Plus className="w-[18px] h-[18px]" />
                Add Menu Item
              </button>
              <button
                onClick={() => router.push("/warung-ai/photo-upload")}
                className="flex items-center gap-1.5 text-[#2563EB] text-[13px] font-medium h-9"
              >
                <Camera className="w-3.5 h-3.5" />
                Or set up via photo
              </button>
            </div>
          )}
        </div>

        {/* Order summary */}
        {hasItems && cartTotals.qty > 0 && (
          <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-white border-t border-[#E5E7EB] px-5 pt-4 pb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-[#0F172A]" />
                <span className="text-[#0F172A] text-sm font-bold">Order Summary</span>
              </div>
              <span className="bg-[#FEF3C7] text-[#92400E] text-[11px] font-semibold px-2.5 py-1 rounded-full">
                {cartTotals.qty} {cartTotals.qty === 1 ? "item" : "items"}
              </span>
            </div>
            <div className="flex items-center justify-between mb-3 pt-2 border-t border-[#F1F5F9]">
              <span className="text-[#64748B] text-sm">Total</span>
              <span className="text-[#0F172A] text-lg font-bold tabular-nums">
                {formatRM(cartTotals.cents)}
              </span>
            </div>
            <button
              onClick={handleProcessPayment}
              disabled={submitting}
              className="w-full h-12 rounded-[24px] bg-[#2563EB] text-white text-[15px] font-bold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  Process Payment <span aria-hidden>→</span>
                </>
              )}
            </button>
            {submitError && (
              <div className="mt-2 flex items-start gap-2 text-[#B91C1C] text-[12px]">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>{submitError}</span>
              </div>
            )}
          </div>
        )}

        {/* Bottom Nav */}
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-white border-t border-[#E8EAED] h-16 flex">
          <button className="flex-1 flex flex-col items-center justify-center gap-0.5">
            <ShoppingBag className="w-[22px] h-[22px] text-[#4F6FF0]" />
            <span className="text-[11px] font-semibold text-[#4F6FF0]">POS</span>
          </button>
          <button
            className="flex-1 flex flex-col items-center justify-center gap-0.5"
            onClick={() => router.push("/warung-ai/chat")}
          >
            <Bot className="w-[22px] h-[22px] text-[#9CA3AF]" />
            <span className="text-[11px] text-[#9CA3AF]">Ask AI</span>
          </button>
          <button className="flex-1 flex flex-col items-center justify-center gap-0.5">
            <TrendingUp className="w-[22px] h-[22px] text-[#9CA3AF]" />
            <span className="text-[11px] text-[#9CA3AF]">Analytics</span>
          </button>
        </div>
      </div>
    </div>
  );
}

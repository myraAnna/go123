"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  AlertTriangle,
  Pencil,
  Trash2,
  Plus,
  Check,
  Loader2,
} from "lucide-react";
import { StatusBar } from "@/components/services/StatusBar";
import { PageNav } from "@/components/warung-ai/PageNav";
import { verifyOnboardingMenu, ApiError, type DraftItem } from "@/queries/onboarding";

const ALLOWED_CATEGORIES = new Set(["main", "side", "drink", "dessert", "other"]);
function normalizeCategory(c: string): string {
  return ALLOWED_CATEGORIES.has(c) ? c : "other";
}

type EditableDraftItem = DraftItem & { confidence?: "low" | "high"; _key: string };

function centsToDisplay(cents: number) {
  return `RM ${(cents / 100).toFixed(2)}`;
}

function displayToCents(val: string): number {
  const n = parseFloat(val.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

let _keyCounter = 0;
function nextKey() {
  return String(++_keyCounter);
}

export default function MenuVerifyPage() {
  const router = useRouter();
  const [items, setItems] = useState<EditableDraftItem[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("warungAi.draftItems");
    if (!raw) return;
    const parsed: DraftItem[] = JSON.parse(raw);
    setItems(parsed.map((d) => ({ ...d, _key: nextKey() })));
  }, []);

  function startEdit(item: EditableDraftItem) {
    setEditingKey(item._key);
    setEditName(item.name);
    setEditPrice((item.priceCents / 100).toFixed(2));
  }

  function saveEdit(key: string) {
    setItems((prev) =>
      prev.map((it) =>
        it._key === key
          ? { ...it, name: editName.trim() || it.name, priceCents: displayToCents(editPrice) }
          : it
      )
    );
    setEditingKey(null);
  }

  function deleteItem(key: string) {
    setItems((prev) => prev.filter((it) => it._key !== key));
  }

  function addItem() {
    const blank: EditableDraftItem = {
      name: "New Item",
      priceCents: 0,
      category: "other",
      _key: nextKey(),
    };
    setItems((prev) => [...prev, blank]);
    startEdit(blank);
  }

  async function handleConfirm() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = items
        .map(({ name, priceCents, category }) => ({
          name: name.trim(),
          priceCents,
          category: normalizeCategory(category),
        }))
        .filter((it) => it.name.length > 0 && it.priceCents > 0);

      if (payload.length === 0) {
        setError("Add at least one item with a name and price.");
        setSubmitting(false);
        return;
      }

      const { items: saved, skippedCount } = await verifyOnboardingMenu(payload);
      sessionStorage.setItem("warungAi.menuItems", JSON.stringify(saved));
      sessionStorage.removeItem("warungAi.draftItems");
      if (skippedCount > 0) {
        sessionStorage.setItem("warungAi.skippedCount", String(skippedCount));
      }
      router.push("/warung-ai/pos");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 400
            ? "Some items look invalid. Check names and prices."
            : "Failed to save menu. Please try again."
          : "Something went wrong."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const lowCount = items.filter((it) => it.confidence === "low").length;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[390px] mx-auto min-h-screen flex flex-col relative">
        <div className="bg-white px-5 pt-4">
          <StatusBar time="9:41" show4G={false} theme="dark" />
        </div>

        <PageNav title="Review Menu Items" backHref="/warung-ai/photo-upload" />

        <div className="flex flex-col gap-5 px-5 pt-4 pb-36">
          {/* Heading */}
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[#1A1A2E] text-[20px] font-bold leading-snug">
              Review Extracted Items
            </h1>
            <p className="text-[#757575] text-sm leading-[1.4]">
              Check and correct what our AI found in your photo.
            </p>
          </div>

          {/* AI summary banner */}
          <div className="flex items-start gap-3 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] px-4 py-3">
            <CheckCircle2 className="w-5 h-5 text-[#16A34A] mt-0.5 flex-shrink-0" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[#15803D] text-sm font-semibold">
                AI extracted {items.length} item{items.length !== 1 ? "s" : ""}
              </span>
              <span className="text-[#166534] text-xs">
                Review carefully — prices may need adjustment
              </span>
            </div>
          </div>

          {/* Item list */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[#1A1A2E] text-sm font-semibold">Extracted Items</span>
              <span className="text-[#1565C0] text-sm font-medium">{items.length} items</span>
            </div>

            <div className="flex flex-col divide-y divide-[#F0F0F0] rounded-2xl border border-[#F0F0F0] overflow-hidden">
              {items.map((item) =>
                editingKey === item._key ? (
                  <div key={item._key} className="flex flex-col gap-2.5 px-4 py-3 bg-[#F8F9FE]">
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full text-sm text-[#1A1A2E] font-medium bg-white border border-[#BBDEFB] rounded-lg px-3 py-1.5 outline-none focus:border-[#1565C0]"
                      placeholder="Item name"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-[#757575] text-sm">RM</span>
                      <input
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        inputMode="decimal"
                        className="w-28 text-sm text-[#1A1A2E] font-semibold bg-white border border-[#BBDEFB] rounded-lg px-3 py-1.5 outline-none focus:border-[#1565C0]"
                        placeholder="0.00"
                      />
                      <button
                        onClick={() => saveEdit(item._key)}
                        className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1565C0] text-white text-xs font-semibold"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Done
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    key={item._key}
                    className={`flex items-center gap-3 px-4 py-3 ${item.confidence === "low" ? "bg-[#FFFBEB]" : "bg-white"}`}
                  >
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <span className="text-[#1A1A2E] text-sm font-medium truncate">
                        {item.name}
                      </span>
                      {item.confidence === "low" && (
                        <span className="flex items-center gap-1 text-[#D97706] text-[11px] font-medium">
                          <AlertTriangle className="w-3 h-3" />
                          Low confidence
                        </span>
                      )}
                    </div>
                    <span className="text-[#1A1A2E] text-sm font-semibold whitespace-nowrap">
                      {centsToDisplay(item.priceCents)}
                    </span>
                    <button
                      onClick={() => startEdit(item)}
                      className="p-1.5 text-[#9E9E9E] hover:text-[#1565C0] transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteItem(item._key)}
                      className="p-1.5 text-[#9E9E9E] hover:text-[#EF4444] transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )
              )}
            </div>

            {/* Add item */}
            <button
              onClick={addItem}
              className="mt-3 w-full h-12 rounded-2xl border-2 border-dashed border-[#BBDEFB] text-[#1565C0] text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#F8F9FE] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Missing Item
            </button>
          </div>
        </div>

        {/* Sticky CTA */}
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-white border-t border-[#F0F0F0] px-5 py-4 pb-8">
          {error && (
            <div className="mb-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-3 py-2.5 text-[#B91C1C] text-[13px]">
              {error}
            </div>
          )}
          <button
            onClick={handleConfirm}
            disabled={submitting || items.length === 0}
            className="w-full h-14 rounded-[28px] bg-[#1565C0] text-white text-base font-bold flex items-center justify-center gap-2 hover:bg-[#1565C0]/90 transition-colors shadow-[0_8px_24px_-8px_rgba(21,101,192,0.45)] disabled:bg-[#1565C0]/70 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                Confirm & Save Items
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

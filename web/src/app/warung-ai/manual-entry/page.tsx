"use client";

import { useState } from "react";
import { CirclePlus, Loader2, AlertCircle } from "lucide-react";
import { StatusBar } from "@/components/services/StatusBar";
import { PageNav } from "@/components/warung-ai/PageNav";
import { MenuItemRow } from "@/components/warung-ai/MenuItemRow";
import { submitOnboardingForm, ApiError } from "@/queries/onboarding";

interface MenuItem {
  id: number;
  name: string;
  price: string;
}

let nextId = 3;

function priceToCents(price: string): number | null {
  const trimmed = price.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export default function ManualEntryPage() {
  const [items, setItems] = useState<MenuItem[]>([
    { id: 1, name: "", price: "" },
    { id: 2, name: "", price: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addItem() {
    setItems((prev) => [...prev, { id: nextId++, name: "", price: "" }]);
  }

  function removeItem(id: number) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function updateItem(id: number, field: "name" | "price", value: string) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  }

  async function handleSubmit() {
    if (submitting) return;

    const payload: { name: string; priceCents: number }[] = [];
    for (const it of items) {
      const name = it.name.trim();
      const cents = priceToCents(it.price);
      if (!name && cents === null) continue;
      if (!name) {
        setError("Every item needs a name.");
        return;
      }
      if (cents === null) {
        setError(`Enter a valid price for "${name}".`);
        return;
      }
      payload.push({ name, priceCents: cents });
    }

    if (payload.length === 0) {
      setError("Add at least one item before continuing.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const saved = await submitOnboardingForm(payload);
      sessionStorage.setItem("warungAi.menuItems", JSON.stringify(saved));
      // TODO: router.push("/warung-ai/pos") once flow is wired
      console.log("Saved menu items:", saved);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.status === 400
            ? "Some items look invalid. Check names and prices."
            : "Couldn't save your menu. Please try again."
        );
      } else {
        setError("Something went wrong.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[390px] mx-auto min-h-screen flex flex-col relative">
        {/* Status + nav */}
        <div className="bg-white px-5 pt-4">
          <StatusBar time="9:41" show4G={false} theme="dark" />
        </div>
        <PageNav title="Add Items Manually" backHref="/warung-ai/choose-method" />

        {/* Scrollable body */}
        <div className="flex flex-col gap-4 px-5 pt-4 pb-32 overflow-y-auto">
          <div className="flex flex-col gap-1">
            <h1 className="text-[#1A1A2E] text-xl font-bold">Enter your menu items</h1>
            <p className="text-[#757575] text-[13px]">
              Add as many items as you like. You can edit them later.
            </p>
          </div>

          {items.map((item, i) => (
            <MenuItemRow
              key={item.id}
              index={i}
              name={item.name}
              price={item.price}
              onNameChange={(v) => updateItem(item.id, "name", v)}
              onPriceChange={(v) => updateItem(item.id, "price", v)}
              onRemove={() => removeItem(item.id)}
              canRemove={items.length > 1}
            />
          ))}

          {/* Add another */}
          <button
            onClick={addItem}
            className="w-full h-12 rounded-xl bg-white border border-[#1565C0] flex items-center justify-center gap-2 text-[#1565C0] text-sm font-semibold hover:bg-[#E3F2FD] transition-colors"
          >
            <CirclePlus className="w-[18px] h-[18px]" />
            Add Another Item
          </button>
        </div>

        {/* Sticky bottom CTA */}
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-white border-t border-[#F0F0F0] px-5 py-4 pb-8">
          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-3 py-2.5 text-[#B91C1C] text-[13px] leading-snug">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full h-14 rounded-[28px] bg-[#1565C0] text-white text-base font-bold flex items-center justify-center gap-2 hover:bg-[#1565C0]/90 transition-colors disabled:bg-[#1565C0]/70 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Saving…
              </>
            ) : (
              <>Save &amp; Continue</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

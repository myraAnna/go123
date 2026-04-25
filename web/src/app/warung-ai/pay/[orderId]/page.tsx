"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle, Share2 } from "lucide-react";
import { StatusBar } from "@/components/services/StatusBar";
import { API_BASE } from "@/constants/api";

type OrderLine = {
  menuItemId: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

type Order = {
  orderId: string;
  items: OrderLine[];
  totalCents: number;
  paidAt: string | null;
  createdAt: string;
};

function formatRM(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const myt = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const d = myt.getUTCDate().toString().padStart(2, "0");
  const m = (myt.getUTCMonth() + 1).toString().padStart(2, "0");
  const y = myt.getUTCFullYear();
  const hh = myt.getUTCHours().toString().padStart(2, "0");
  const mm = myt.getUTCMinutes().toString().padStart(2, "0");
  const ss = myt.getUTCSeconds().toString().padStart(2, "0");
  return `${d}/${m}/${y} ${hh}:${mm}:${ss}`;
}

async function fetchOrder(orderId: string): Promise<Order> {
  const res = await fetch(`${API_BASE}/v1/orders/${orderId}`, {
    headers: { "X-Merchant-Id": "1" },
  });
  if (!res.ok) throw new Error("Not found");
  return res.json() as Promise<Order>;
}

async function fetchMerchantName(): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/v1/merchants/1`, {
      headers: { "X-Merchant-Id": "1" },
    });
    if (!res.ok) return "Warung POS";
    const data = (await res.json()) as { merchant: { businessName: string } };
    return data.merchant.businessName;
  } catch {
    return "Warung POS";
  }
}

export default function PayerSuccessPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [merchantName, setMerchantName] = useState("Warung POS");
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([fetchOrder(orderId), fetchMerchantName()])
      .then(([o, name]) => {
        setOrder(o);
        setMerchantName(name);
      })
      .catch(() => setError(true));
  }, [orderId]);

  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <span className="text-[#6B7280] text-sm">Order not found.</span>
      </div>
    );
  }

  const totalLabel = order ? formatRM(order.totalCents) : "—";
  const paidAt = order?.paidAt ?? order?.createdAt ?? new Date().toISOString();
  const merchantUpper = merchantName.toUpperCase();

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[390px] mx-auto min-h-screen flex flex-col">
        <div className="px-5 pt-[22px] pb-0">
          <StatusBar time="9:41" show4G={false} theme="dark" />
        </div>

        <div className="flex-1 flex flex-col px-5 pt-8 pb-10 overflow-y-auto">
          {/* Hero */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-[72px] h-[72px] rounded-full bg-[#10B981] flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-[#111827] text-[22px] font-bold">Payment Successful</span>
            <div className="flex items-baseline gap-0.5">
              <span className="text-[#111827] text-[20px] font-semibold">RM</span>
              <span className="text-[#111827] text-[44px] font-extrabold leading-none tabular-nums">
                {order ? (order.totalCents / 100).toFixed(2) : "—"}
              </span>
            </div>
            <span className="text-[#6B7280] text-[13px] font-bold tracking-[1.5px] uppercase">
              {merchantName}
            </span>
          </div>

          {/* Divider */}
          <div className="h-px bg-[#F3F4F6] my-6" />

          {/* Transaction details */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center">
              <span className="flex-1 text-[#6B7280] text-[13px]">Receiver</span>
              <span className="text-[#111827] text-[13px] font-bold uppercase">{merchantUpper}</span>
            </div>
            <div className="flex items-center">
              <span className="flex-1 text-[#6B7280] text-[13px]">Remark</span>
              <span className="text-[#111827] text-[13px] font-bold uppercase">{merchantUpper}</span>
            </div>
            <div className="flex items-center">
              <span className="flex-1 text-[#6B7280] text-[13px]">Date &amp; Time</span>
              <span className="text-[#111827] text-[13px] font-bold tabular-nums">
                {order ? formatDateTime(paidAt) : "—"}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-[#F3F4F6] my-6" />

          {/* Order summary */}
          <div className="bg-[#F9FAFB] rounded-[12px] flex flex-col gap-2 px-4 py-3.5">
            <span className="text-[#9CA3AF] text-[11px] font-bold tracking-[0.8px] uppercase">
              Order Summary
            </span>
            {order?.items.map((it) => (
              <div key={it.menuItemId} className="flex items-center">
                <span className="flex-1 text-[#374151] text-[13px]">{it.name}</span>
                <span className="text-[#111827] text-[13px] font-semibold tabular-nums">
                  {formatRM(it.lineTotalCents)}
                </span>
              </div>
            ))}
            <div className="h-px bg-[#E5E7EB] my-0.5" />
            <div className="flex items-center">
              <span className="flex-1 text-[#111827] text-[14px] font-bold">Total</span>
              <span className="text-[#1A5FD4] text-[14px] font-bold tabular-nums">{totalLabel}</span>
            </div>
          </div>

          <div className="flex-1" />

          {/* Bottom actions */}
          <div className="flex items-center gap-3 mt-8">
            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({
                    title: "Payment Receipt",
                    text: `Paid ${totalLabel} to ${merchantName}`,
                  });
                }
              }}
              className="w-[46px] h-[46px] rounded-full border-[1.5px] border-[#6B7280] bg-white flex items-center justify-center shrink-0"
            >
              <Share2 className="w-5 h-5 text-[#6B7280]" />
            </button>
            <button
              onClick={() => window.close()}
              className="flex-1 h-[46px] rounded-full bg-[#1A5FD4] text-white text-[15px] font-semibold flex items-center justify-center"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

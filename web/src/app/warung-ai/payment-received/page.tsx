"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Printer } from "lucide-react";
import { StatusBar } from "@/components/services/StatusBar";
import { type CreatedOrder } from "@/queries/orders";

function formatRM(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`;
}

function formatDateTime(date: Date): string {
  const d = date.getDate().toString().padStart(2, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const y = date.getFullYear();
  const hh = date.getHours().toString().padStart(2, "0");
  const mm = date.getMinutes().toString().padStart(2, "0");
  const ss = date.getSeconds().toString().padStart(2, "0");
  return `${d}/${m}/${y} ${hh}:${mm}:${ss}`;
}

export default function PaymentReceivedPage() {
  const router = useRouter();
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  const [paidAt] = useState(() => new Date());

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("warung-ai:order");
      if (raw) setOrder(JSON.parse(raw) as CreatedOrder);
    } catch {}
  }, []);

  const totalLabel = order ? formatRM(order.totalCents) : "RM 0.00";
  const [rmPart, centPart] = totalLabel.split(".");

  function handleNewOrder() {
    sessionStorage.removeItem("warung-ai:order");
    router.replace("/warung-ai/pos");
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[390px] mx-auto min-h-screen flex flex-col">
        {/* Status Bar */}
        <div className="px-5 pt-[22px] pb-0">
          <StatusBar time="9:41" show4G={false} theme="dark" />
        </div>

        {/* Scroll area */}
        <div className="flex-1 flex flex-col gap-4 px-5 pt-6 pb-10 overflow-y-auto">
          {/* Hero */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-full bg-[#10B981] flex items-center justify-center">
              <Banknote className="w-11 h-11 text-white" />
            </div>
            <span className="text-[#111827] text-[22px] font-bold">Payment Received!</span>
            <div className="flex items-baseline gap-1">
              <span className="text-[#111827] text-[20px] font-medium">RM</span>
              <span className="text-[#111827] text-[40px] font-extrabold leading-none">
                {order ? (order.totalCents / 100).toFixed(2) : "0.00"}
              </span>
            </div>
            <span className="text-[#6B7280] text-[13px] font-bold tracking-[1.5px] uppercase">
              Warung POS
            </span>
          </div>

          {/* Order summary card */}
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
              <span className="text-[#10B981] text-[14px] font-bold tabular-nums">{totalLabel}</span>
            </div>
          </div>

          {/* Transaction details */}
          <div className="flex flex-col gap-3 px-0 py-4">
            <div className="flex items-center">
              <span className="flex-1 text-[#6B7280] text-[13px]">Paid By</span>
              <span className="text-[#111827] text-[13px] font-semibold">Customer</span>
            </div>
            <div className="flex items-center">
              <span className="flex-1 text-[#6B7280] text-[13px]">Method</span>
              <span className="text-[#111827] text-[13px] font-semibold">DuitNow QR</span>
            </div>
            <div className="flex items-center">
              <span className="flex-1 text-[#6B7280] text-[13px]">Date &amp; Time</span>
              <span className="text-[#111827] text-[13px] font-semibold">{formatDateTime(paidAt)}</span>
            </div>
          </div>

          <div className="flex-1" />

          {/* Bottom actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="w-[46px] h-[46px] rounded-full border-[1.5px] border-[#1A5FD4] bg-white flex items-center justify-center shrink-0"
            >
              <Printer className="w-5 h-5 text-[#1A5FD4]" />
            </button>
            <button
              onClick={handleNewOrder}
              className="flex-1 h-[46px] rounded-full bg-[#1A5FD4] text-white text-[15px] font-semibold flex items-center justify-center"
            >
              New Order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

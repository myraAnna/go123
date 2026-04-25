"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Timer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { StatusBar } from "@/components/services/StatusBar";
import { paidCallbackUrl, type CreatedOrder } from "@/queries/orders";

const COUNTDOWN_SECONDS = 5 * 60;

function formatRM(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`;
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function QRPaymentPage() {
  const router = useRouter();
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("warung-ai:order");
      if (raw) setOrder(JSON.parse(raw) as CreatedOrder);
    } catch {}
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      router.replace("/warung-ai/payment-received");
    }, 8000);
    return () => clearTimeout(id);
  }, [router]);

  const qrValue = useMemo(() => {
    if (!order) return "";
    return paidCallbackUrl(order.orderId);
  }, [order]);

  const totalLabel = order ? formatRM(order.totalCents) : "RM 0.00";

  return (
    <div className="min-h-screen bg-[#1A5FD4]">
      <div className="max-w-[390px] mx-auto min-h-screen flex flex-col">
        {/* Status Bar */}
        <div className="px-5 pt-[22px] pb-0">
          <StatusBar time="9:41" show4G={false} theme="light" />
        </div>

        {/* Nav */}
        <div className="flex items-center bg-[#1A5FD4] h-[52px] px-5">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 flex items-center justify-center"
          >
            <ArrowLeft className="w-[22px] h-[22px] text-white" />
          </button>
          <div className="flex-1" />
          <span className="text-white text-[18px] font-bold">Receive</span>
          <div className="flex-1" />
          <div className="w-8 h-8" />
        </div>

        {/* Card */}
        <div className="flex-1 flex flex-col px-5 pb-10 pt-4">
          <div
            className="bg-white rounded-[20px] flex flex-col gap-3 px-5 py-6"
            style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.12)" }}
          >
            {/* Header info */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-[#6B7280] text-sm">Scan this QR code to pay</span>
              <span className="text-[#111827] text-[38px] font-extrabold leading-none">
                {totalLabel}
              </span>
              <span className="text-[#374151] text-[13px] font-bold tracking-[1.5px] uppercase">
                Warung POS
              </span>
            </div>

            {/* QR */}
            <div className="self-center w-[240px] rounded-[14px] border-[3px] border-[#E8334A] bg-white overflow-hidden flex flex-col">
              <div className="flex-1 flex items-center justify-center py-4">
                {qrValue ? (
                  <QRCodeSVG
                    value={qrValue}
                    size={184}
                    bgColor="#FFFFFF"
                    fgColor="#E8334A"
                    level="M"
                  />
                ) : (
                  <div className="w-[184px] h-[184px]" />
                )}
              </div>
              <div className="bg-[#E8334A] text-white text-[10px] font-bold tracking-[1.2px] text-center py-1.5">
                MALAYSIA NATIONAL QR
              </div>
            </div>

            {/* Timer */}
            <div className="flex items-center justify-center gap-1.5">
              <Timer className="w-[14px] h-[14px] text-[#F97316]" />
              <span className="text-[#F97316] text-[18px] font-bold tabular-nums">
                {formatCountdown(secondsLeft)}
              </span>
              <span className="text-[#9CA3AF] text-[13px]">remaining</span>
            </div>

            {/* Order summary */}
            <div className="bg-[#F9FAFB] rounded-[10px] flex flex-col gap-1.5 px-[14px] py-3">
              <span className="text-[#9CA3AF] text-[11px] font-bold tracking-[0.8px] uppercase">
                Order Summary
              </span>
              {order?.items.map((it) => (
                <div key={it.menuItemId} className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center min-w-[26px] h-[20px] px-1.5 rounded-[6px] bg-[#EFF4FF] text-[#1A5FD4] text-[11px] font-bold tabular-nums tracking-tight">
                    ×{it.qty}
                  </span>
                  <span className="flex-1 text-[#374151] text-[13px] truncate">
                    {it.name}
                  </span>
                  <span className="text-[#111827] text-[13px] font-semibold tabular-nums">
                    {formatRM(it.lineTotalCents)}
                  </span>
                </div>
              ))}
              <div className="h-px bg-[#E5E7EB] my-1" />
              <div className="flex items-center justify-between">
                <span className="text-[#111827] text-[13px] font-bold">Total</span>
                <span className="text-[#1A5FD4] text-[13px] font-bold tabular-nums">
                  {totalLabel}
                </span>
              </div>
            </div>

            {/* Cancel */}
            <button
              onClick={() => router.back()}
              className="w-full h-[46px] rounded-full border border-[#1A5FD4] bg-white text-[#1A5FD4] text-[15px] font-semibold flex items-center justify-center"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

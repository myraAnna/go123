"use client";

import { Mic, Plus, ShoppingBag, Bot, TrendingUp, Utensils, Camera } from "lucide-react";
import { useRouter } from "next/navigation";
import { StatusBar } from "@/components/services/StatusBar";

export default function POSPage() {
  const router = useRouter();

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
          <div className="flex items-center gap-2">
            <span className="text-[#0F172A] text-base font-bold">Menu Items</span>
          </div>

          {/* Empty state */}
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
        </div>

        {/* Bottom Nav */}
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-white border-t border-[#E8EAED] h-16 flex">
          <button className="flex-1 flex flex-col items-center justify-center gap-0.5">
            <ShoppingBag className="w-[22px] h-[22px] text-[#4F6FF0]" />
            <span className="text-[11px] font-semibold text-[#4F6FF0]">POS</span>
          </button>
          <button className="flex-1 flex flex-col items-center justify-center gap-0.5">
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

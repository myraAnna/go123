"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, PencilLine } from "lucide-react";
import { StatusBar } from "@/components/services/StatusBar";
import { PageNav } from "@/components/warung-ai/PageNav";
import { MethodCard } from "@/components/warung-ai/MethodCard";

type Method = "photo" | "manual";

export default function ChooseMethodPage() {
  const [selected, setSelected] = useState<Method>("photo");
  const router = useRouter();

  function handleContinue() {
    if (selected === "photo") router.push("/warung-ai/photo-upload");
    if (selected === "manual") router.push("/warung-ai/manual-entry");
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[390px] mx-auto min-h-screen flex flex-col">
        <div className="bg-white px-5 pt-4">
          <StatusBar time="9:41" show4G={false} theme="dark" />
        </div>

        <PageNav title="Set Up Menu" backHref="/warung-ai" />

        <div className="flex flex-col gap-4 px-5 pt-6 pb-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-[#1A1A2E] text-[22px] font-bold leading-[1.4] max-w-[310px]">
              How would you like to add your menu items?
            </h1>
            <p className="text-[#757575] text-sm">You can always add more later.</p>
          </div>

          <MethodCard
            icon={Camera}
            title="Photo or Upload"
            description="Snap a photo of your menu or upload from gallery. AI will read it for you."
            active={selected === "photo"}
            onClick={() => setSelected("photo")}
          />

          <MethodCard
            icon={PencilLine}
            title="Enter Manually"
            description="Type in your item names and prices one by one."
            active={selected === "manual"}
            onClick={() => setSelected("manual")}
          />

          <button
            onClick={handleContinue}
            className="w-full h-14 rounded-[28px] bg-[#1565C0] text-white text-base font-bold mt-2 hover:bg-[#1565C0]/90 transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

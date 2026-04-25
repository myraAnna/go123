import Link from "next/link";
import { Store } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WelcomeHero() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 flex-1 px-8 pb-20">
      {/* Icon */}
      <div className="w-[120px] h-[120px] rounded-full bg-white flex items-center justify-center">
        <Store className="w-14 h-14 text-[#1565C0]" />
      </div>

      {/* Title */}
      <h1 className="text-white text-[32px] font-bold leading-tight">Warung AI</h1>

      {/* Subtitle */}
      <p className="text-[#BBDEFB] text-base text-center leading-relaxed max-w-[280px]">
        Let&apos;s set up your menu so you can start selling today.
      </p>

      {/* CTA */}
      <Link href="/warung-ai/choose-method" className="w-full">
        <Button
          className="w-full h-14 rounded-[28px] bg-white text-[#1565C0] text-base font-bold hover:bg-white/90"
          variant="ghost"
        >
          Get Started
        </Button>
      </Link>

      {/* Skip */}
      <Link href="/warung-ai/pos" className="text-[#90CAF9] text-sm">
        Skip for now
      </Link>
    </div>
  );
}

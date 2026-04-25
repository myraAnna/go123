import { Signal, Wifi, Battery } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusBarProps {
  time?: string;
  show4G?: boolean;
  theme?: "light" | "dark";
}

export function StatusBar({ time = "12:36", show4G = true, theme = "light" }: StatusBarProps) {
  const color = theme === "dark" ? "text-[#1A1A2E]" : "text-white";
  const badgeBg = theme === "dark" ? "bg-black/10" : "bg-white/30";

  return (
    <div className="flex items-center justify-between h-7 px-0">
      <span className={cn("text-sm font-semibold", color)}>{time}</span>
      <div className="flex items-center gap-1.5">
        <Signal className={cn("w-4 h-4", color)} />
        {show4G && (
          <span className={cn("text-xs font-bold rounded px-1", color, badgeBg)}>4G</span>
        )}
        <Wifi className={cn("w-4 h-4", color)} />
        <Battery className={cn("w-4 h-4", color)} />
      </div>
    </div>
  );
}

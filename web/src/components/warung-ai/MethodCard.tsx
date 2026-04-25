import * as React from "react";
import { cn } from "@/lib/utils";

interface MethodCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  active?: boolean;
  onClick?: () => void;
}

export function MethodCard({ icon: Icon, title, description, active, onClick }: MethodCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-4 rounded-2xl p-5 text-left transition-all",
        active
          ? "bg-[#E3F2FD] border-2 border-[#1565C0]"
          : "bg-[#FAFAFA] border border-[#E0E0E0]"
      )}
    >
      <div
        className={cn(
          "w-14 h-14 rounded-full flex items-center justify-center shrink-0",
          active ? "bg-[#1565C0]" : "bg-[#F5F5F5]"
        )}
      >
        <Icon className={cn("w-7 h-7", active ? "text-white" : "text-[#424242]")} />
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <span
          className={cn(
            "text-base font-bold",
            active ? "text-[#1565C0]" : "text-[#1A1A2E]"
          )}
        >
          {title}
        </span>
        <span
          className={cn(
            "text-[13px] leading-[1.4]",
            active ? "text-[#1565C0]" : "text-[#757575]"
          )}
        >
          {description}
        </span>
      </div>
    </button>
  );
}

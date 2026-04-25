"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const tabs = ["All", "GOfinance", "GOtravel"];

export function FilterTabs() {
  const [active, setActive] = useState("All");

  return (
    <div className="flex gap-2">
      {tabs.map((tab) => (
        <button key={tab} onClick={() => setActive(tab)}>
          <Badge
            className={cn(
              "px-4 py-1.5 h-auto rounded-full text-sm font-medium cursor-pointer",
              active === tab
                ? "bg-white text-primary border-transparent"
                : "bg-transparent text-white border-white"
            )}
            variant={active === tab ? "default" : "outline"}
          >
            {tab}
          </Badge>
        </button>
      ))}
    </div>
  );
}

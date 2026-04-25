"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ServiceItem {
  label: string;
  hasNotification?: boolean;
}

const serviceItems: ServiceItem[] = [
  { label: "GOfinance", hasNotification: true },
  { label: "GOtravel" },
  { label: "Transport" },
  { label: "Bills & Utilities" },
];

function ServiceRow({ label, hasNotification }: ServiceItem) {
  const [open, setOpen] = useState(false);

  return (
    <Card
      className={cn(
        "flex-row items-center justify-between h-14 px-4 cursor-pointer gap-0 py-0 ring-0 shadow-none",
        open && "bg-primary/5"
      )}
      onClick={() => setOpen(!open)}
    >
      <div className="flex items-center gap-2">
        <span className="text-primary text-sm font-semibold">{label}</span>
        {hasNotification && <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />}
      </div>
      {open ? (
        <ChevronUp className="w-5 h-5 text-primary" />
      ) : (
        <ChevronDown className="w-5 h-5 text-primary" />
      )}
    </Card>
  );
}

export function ServiceAccordion() {
  return (
    <div className="flex flex-col gap-2.5">
      {serviceItems.map((item) => (
        <ServiceRow key={item.label} {...item} />
      ))}
    </div>
  );
}

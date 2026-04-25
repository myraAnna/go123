"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { Monitor, Briefcase, DollarSign, Package, Bot, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const merchants: { icon: React.ElementType; label: string; href?: string }[] = [
  { icon: Monitor, label: "Dashboard" },
  { icon: Briefcase, label: "Business Account" },
  { icon: DollarSign, label: "BizCash" },
  { icon: Package, label: "PacketHunt" },
  { icon: Bot, label: "Warung AI", href: "/warung-ai" },
];

function MerchantIcon({ icon: Icon, label, href }: { icon: React.ElementType; label: string; href?: string }) {
  const content = (
    <div className="flex flex-col items-center gap-1.5">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <span className="text-xs text-primary font-medium text-center leading-tight">{label}</span>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : <div>{content}</div>;
}

export function MerchantSection() {
  const [open, setOpen] = useState(true);

  return (
    <Card className="ring-0 shadow-none">
      <div
        className="flex items-center justify-between px-4 pt-0 cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <span className="text-primary text-sm font-bold">Merchant Services</span>
        {open ? (
          <ChevronUp className="w-5 h-5 text-primary" />
        ) : (
          <ChevronDown className="w-5 h-5 text-primary" />
        )}
      </div>
      {open && (
        <CardContent>
          <div className="grid grid-cols-4 gap-y-3.5">
            {merchants.map((m) => (
              <MerchantIcon key={m.label} icon={m.icon} label={m.label} href={m.href} />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

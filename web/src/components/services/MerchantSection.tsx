"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { Monitor, Briefcase, DollarSign, Package, Bot, ChevronDown, ChevronUp } from "lucide-react";

const row1: { icon: React.ElementType; label: string; bg: string }[] = [
  { icon: Monitor, label: "Dashboard", bg: "#E3F2FD" },
  { icon: Briefcase, label: "Business Account", bg: "#FFF8E1" },
  { icon: DollarSign, label: "BizCash", bg: "#E8F5E9" },
  { icon: Package, label: "PacketHunt", bg: "#FCE4EC" },
];

const row2: { icon: React.ElementType; label: string; bg: string; href?: string }[] = [
  { icon: Bot, label: "EzWarung", bg: "#EDE7F6", href: "/warung-ai" },
];

function MerchantIcon({
  icon: Icon,
  label,
  bg,
  href,
}: {
  icon: React.ElementType;
  label: string;
  bg: string;
  href?: string;
}) {
  const content = (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="w-[52px] h-[52px] rounded-xl flex items-center justify-center"
        style={{ background: bg }}
      >
        <Icon className="w-5 h-5 text-[#1350CC]" />
      </div>
      <span className="text-[11px] text-[#444444] text-center leading-tight max-w-[60px]">
        {label}
      </span>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : <div>{content}</div>;
}

export function MerchantSection() {
  const [open, setOpen] = useState(true);

  return (
    <div className="bg-white rounded-xl p-4 flex flex-col gap-3.5">
      <button
        className="flex items-center justify-between w-full"
        onClick={() => setOpen(!open)}
      >
        <span className="text-[#1350CC] text-sm font-bold">Merchant Services</span>
        {open ? (
          <ChevronUp className="w-5 h-5 text-[#1350CC]" />
        ) : (
          <ChevronDown className="w-5 h-5 text-[#1350CC]" />
        )}
      </button>
      {open && (
        <>
          <div className="flex justify-between">
            {row1.map((m) => <MerchantIcon key={m.label} {...m} />)}
          </div>
          <div className="flex">
            {row2.map((m) => <MerchantIcon key={m.label} {...m} />)}
          </div>
        </>
      )}
    </div>
  );
}

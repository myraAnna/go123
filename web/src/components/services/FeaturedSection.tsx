import * as React from "react";
import { User, Car, Wifi, MapPin, Smartphone, FileText, Building2, PhoneCall } from "lucide-react";

const services: { icon: React.ElementType; label: string; bg: string; iconColor?: string }[] = [
  { icon: User, label: "SARA", bg: "#FFF3E0" },
  { icon: Car, label: "Transport", bg: "#E3F2FD" },
  { icon: Wifi, label: "Eastel", bg: "#7B1FA2", iconColor: "text-white" },
  { icon: MapPin, label: "Goal City", bg: "#E8F5E9" },
  { icon: Smartphone, label: "MY Prepaid", bg: "#E3F2FD" },
  { icon: FileText, label: "Bills", bg: "#FFF8E1" },
  { icon: Building2, label: "My Business", bg: "#E3F2FD" },
  { icon: PhoneCall, label: "SOS Top up", bg: "#E3F2FD" },
];

function ServiceIcon({ icon: Icon, label, bg, iconColor }: typeof services[number]) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="w-[52px] h-[52px] rounded-xl flex items-center justify-center"
        style={{ background: bg }}
      >
        <Icon className={`w-5 h-5 ${iconColor ?? "text-[#1350CC]"}`} />
      </div>
      <span className="text-[11px] text-[#444444] text-center leading-tight">{label}</span>
    </div>
  );
}

export function FeaturedSection() {
  const row1 = services.slice(0, 4);
  const row2 = services.slice(4);

  return (
    <div className="bg-white rounded-2xl p-4 flex flex-col gap-3.5">
      <span className="text-[#1350CC] text-sm font-bold">Featured</span>
      <div className="flex justify-between">
        {row1.map((s) => <ServiceIcon key={s.label} {...s} />)}
      </div>
      <div className="flex justify-between">
        {row2.map((s) => <ServiceIcon key={s.label} {...s} />)}
      </div>
    </div>
  );
}

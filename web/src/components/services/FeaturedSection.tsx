import * as React from "react";
import {
  User, Car, Wifi, MapPin, Smartphone, FileText, Building2, PhoneCall,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const services = [
  { icon: User, label: "SARA" },
  { icon: Car, label: "Transport" },
  { icon: Wifi, label: "Eastel" },
  { icon: MapPin, label: "Goal City" },
  { icon: Smartphone, label: "MY Prepaid" },
  { icon: FileText, label: "Bills" },
  { icon: Building2, label: "My Business" },
  { icon: PhoneCall, label: "SOS Top up" },
];

function ServiceIcon({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 flex-1">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <span className="text-xs text-primary font-medium text-center leading-tight">{label}</span>
    </div>
  );
}

export function FeaturedSection() {
  return (
    <Card className="ring-0 shadow-none">
      <div className="px-4 pt-0 pb-0">
        <span className="text-primary text-sm font-bold">Featured</span>
      </div>
      <CardContent>
        <div className="grid grid-cols-4 gap-y-3.5">
          {services.map((s) => (
            <ServiceIcon key={s.label} icon={s.icon} label={s.label} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

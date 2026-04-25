import { Minus, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header() {
  return (
    <div className="flex items-center justify-between h-12">
      <h1 className="text-white text-xl font-bold">All Services</h1>
      <div className="flex items-center gap-2.5">
        <Button variant="ghost" size="icon" className="rounded-full bg-white/20 text-white hover:bg-white/30">
          <Minus />
        </Button>
        <Button variant="ghost" size="icon" className="rounded-full bg-white/20 text-white hover:bg-white/30">
          <Info />
        </Button>
      </div>
    </div>
  );
}

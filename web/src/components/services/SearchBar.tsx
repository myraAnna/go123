import { Search } from "lucide-react";

export function SearchBar() {
  return (
    <div className="flex items-center gap-2.5 h-11 rounded-full bg-[#1E60DC] px-[18px]">
      <Search className="w-4.5 h-4.5 text-[#8AAAF0] shrink-0" />
      <span className="text-[#8AAAF0] text-sm">Find products and services</span>
    </div>
  );
}

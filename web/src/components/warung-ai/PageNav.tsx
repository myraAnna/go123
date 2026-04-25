import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface PageNavProps {
  title: string;
  backHref: string;
}

export function PageNav({ title, backHref }: PageNavProps) {
  return (
    <div className="flex items-center gap-3 h-14 px-5">
      <Link href={backHref}>
        <ArrowLeft className="w-6 h-6 text-[#1A1A2E]" />
      </Link>
      <span className="text-[#1A1A2E] text-lg font-bold">{title}</span>
    </div>
  );
}

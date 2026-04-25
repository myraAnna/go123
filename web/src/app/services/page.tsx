import { StatusBar } from "@/components/services/StatusBar";
import { Header } from "@/components/services/Header";
import { SearchBar } from "@/components/services/SearchBar";
import { FeaturedSection } from "@/components/services/FeaturedSection";
import { FilterTabs } from "@/components/services/FilterTabs";
import { ServiceAccordion } from "@/components/services/ServiceAccordion";
import { MerchantSection } from "@/components/services/MerchantSection";

export default function ServicesPage() {
  return (
    <div className="min-h-screen bg-[#1350CC]">
      <div className="max-w-[390px] mx-auto">
        {/* Top blue section */}
        <div className="flex flex-col gap-2 px-5 pt-2.5 pb-5">
          <StatusBar />
          <Header />
          <SearchBar />
        </div>

        {/* Body */}
        <div className="flex flex-col gap-2.5 px-3 pt-3 pb-5">
          <FeaturedSection />
          <FilterTabs />
          <ServiceAccordion />
          <MerchantSection />
        </div>
      </div>
    </div>
  );
}

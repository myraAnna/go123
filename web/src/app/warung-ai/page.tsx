import { StatusBar } from "@/components/services/StatusBar";
import { WelcomeHero } from "@/components/warung-ai/WelcomeHero";

export default function WelcomePage() {
  return (
    <div className="min-h-screen bg-[#1565C0]">
      <div className="max-w-[390px] mx-auto min-h-screen flex flex-col">
        <div className="px-5 pt-4">
          <StatusBar time="9:41" show4G={false} />
        </div>
        <WelcomeHero />
      </div>
    </div>
  );
}

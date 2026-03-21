import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calculator, Target, BarChart2, Award, Trophy, Dices, Gift } from "lucide-react";
import SizeGeometricoCalculator from "@/components/calculators/SizeGeometricoCalculator";
import RPCalculator from "@/components/calculators/RPCalculator";
import MysteryBountyCalculator from "@/components/calculators/MysteryBountyCalculator";
import BountyCalculator from "@/components/calculators/BountyCalculator";
import SatelliteCalculator from "@/components/calculators/SatelliteCalculator";
import Randomizer from "@/components/calculators/Randomizer";

const tabs = [
  { value: "size-geometrico", label: "Size Geometrico", icon: Calculator },
  { value: "rp-icm", label: "RP/ICM", icon: Target },
  { value: "mystery-bounty", label: "Mystery Bounty", icon: Gift },
  { value: "pko-bounty", label: "PKO Bounty", icon: Award },
  { value: "satelites", label: "Satelites", icon: Trophy },
  { value: "randomizador", label: "Randomizador", icon: Dices },
] as const;

export default function Calculadoras() {
  const [activeTab, setActiveTab] = useState("size-geometrico");

  return (
    <div className="min-h-screen bg-poker-dark text-white">
      <div className="container mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">Calculadoras</h1>
          <p className="text-sm text-gray-400">
            Ferramentas de calculo para poker — MTT, PKO, Satelites e mais
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 h-auto gap-1 bg-gray-900 p-1 rounded-lg">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex items-center gap-1.5 text-xs py-2 px-2 data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=inactive]:text-gray-400"
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="size-geometrico" className="mt-4">
            <div className="flex justify-center">
              <SizeGeometricoCalculator />
            </div>
          </TabsContent>

          <TabsContent value="rp-icm" className="mt-4">
            <div className="flex justify-center">
              <RPCalculator />
            </div>
          </TabsContent>

          <TabsContent value="mystery-bounty" className="mt-4">
            <div className="flex justify-center">
              <MysteryBountyCalculator />
            </div>
          </TabsContent>

          <TabsContent value="pko-bounty" className="mt-4">
            <div className="flex justify-center">
              <BountyCalculator />
            </div>
          </TabsContent>

          <TabsContent value="satelites" className="mt-4">
            <div className="flex justify-center">
              <SatelliteCalculator />
            </div>
          </TabsContent>

          <TabsContent value="randomizador" className="mt-4">
            <div className="flex justify-center">
              <Randomizer />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

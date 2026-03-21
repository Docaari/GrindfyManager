import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Calculator, Target, Award, Trophy, Dices, Gift, ExternalLink } from "lucide-react";
import SizeGeometricoCalculator from "@/components/calculators/SizeGeometricoCalculator";
import RPCalculator from "@/components/calculators/RPCalculator";
import MysteryBountyCalculator from "@/components/calculators/MysteryBountyCalculator";
import BountyCalculator from "@/components/calculators/BountyCalculator";
import SatelliteCalculator from "@/components/calculators/SatelliteCalculator";
import Randomizer from "@/components/calculators/Randomizer";

const toolPopupSizes: Record<string, { width: number; height: number }> = {
  "size-geometrico": { width: 500, height: 700 },
  "rp-icm": { width: 650, height: 750 },
  "mystery-bounty": { width: 650, height: 850 },
  "pko-bounty": { width: 700, height: 850 },
  "satelites": { width: 700, height: 900 },
  "randomizador": { width: 350, height: 300 },
};

function openToolPopup(toolKey: string) {
  const size = toolPopupSizes[toolKey] ?? { width: 600, height: 700 };
  const left = window.screenX + (window.outerWidth - size.width) / 2;
  const top = window.screenY + (window.outerHeight - size.height) / 2;
  window.open(
    `/calculadora-popup/${toolKey}`,
    `tool-${toolKey}`,
    `width=${size.width},height=${size.height},left=${Math.round(left)},top=${Math.round(top)},resizable=yes,scrollbars=yes`
  );
}

function PopoutButton({ toolKey }: { toolKey: string }) {
  return (
    <div className="flex justify-end mb-2">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-gray-400 hover:text-white gap-1"
        onClick={() => openToolPopup(toolKey)}
        title="Abrir em nova janela"
      >
        <ExternalLink className="h-3 w-3" />
        Abrir janela
      </Button>
    </div>
  );
}

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
            <PopoutButton toolKey="size-geometrico" />
            <div className="flex justify-center">
              <SizeGeometricoCalculator />
            </div>
          </TabsContent>

          <TabsContent value="rp-icm" className="mt-4">
            <PopoutButton toolKey="rp-icm" />
            <div className="flex justify-center">
              <RPCalculator />
            </div>
          </TabsContent>

          <TabsContent value="mystery-bounty" className="mt-4">
            <PopoutButton toolKey="mystery-bounty" />
            <div className="flex justify-center">
              <MysteryBountyCalculator />
            </div>
          </TabsContent>

          <TabsContent value="pko-bounty" className="mt-4">
            <PopoutButton toolKey="pko-bounty" />
            <div className="flex justify-center">
              <BountyCalculator />
            </div>
          </TabsContent>

          <TabsContent value="satelites" className="mt-4">
            <PopoutButton toolKey="satelites" />
            <div className="flex justify-center">
              <SatelliteCalculator />
            </div>
          </TabsContent>

          <TabsContent value="randomizador" className="mt-4">
            <PopoutButton toolKey="randomizador" />
            <div className="flex justify-center">
              <Randomizer />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

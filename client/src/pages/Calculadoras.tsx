import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowRight, ExternalLink, FlaskConical } from "lucide-react";
import { Link } from "wouter";
import SizeGeometricoCalculator from "@/components/calculators/SizeGeometricoCalculator";
import RPCalculator from "@/components/calculators/RPCalculator";
import MysteryBountyCalculator from "@/components/calculators/MysteryBountyCalculator";
import BountyCalculator from "@/components/calculators/BountyCalculator";
import SatelliteCalculator from "@/components/calculators/SatelliteCalculator";
import CombosCalculator from "@/components/calculators/CombosCalculator";
import Randomizer from "@/components/calculators/Randomizer";
import { calculatorTools, openCalculatorPopup } from "@/lib/calculatorTools";

function PopoutButton({ toolKey }: { toolKey: string }) {
  return (
    <div className="flex justify-end mb-2">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-gray-400 hover:text-white gap-1"
        onClick={() => openCalculatorPopup(toolKey)}
        title="Abrir em nova janela"
      >
        <ExternalLink className="h-3 w-3" />
        Abrir janela
      </Button>
    </div>
  );
}

const tabs = calculatorTools;

export default function Calculadoras() {
  const [activeTab, setActiveTab] = useState("size-geometrico");

  return (
    <div className="min-h-screen bg-background text-white">
      <div className="container mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">Calculadoras</h1>
          <p className="text-sm text-gray-400">
            Ferramentas de calculo para poker — MTT, PKO, Satelites e mais
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-7 h-auto gap-1 bg-gray-900 p-1 rounded-lg">
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

          <TabsContent value="combos" className="mt-4">
            {/* Range Lab F1 (ADR-246 D-F1-10): o atalho para a bancada completa.
                A calculadora compacta continua AQUI e no popup — ela e a versao
                para usar ao lado da mesa, sem range vs range. */}
            <div className="flex justify-center mb-3">
              <Link href="/range-lab">
                <a className="flex items-center gap-2 rounded-lg border border-emerald-600/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-500/20">
                  <FlaskConical className="h-4 w-4" />
                  Abrir no Range Lab — heroi como range, bordo de flop e turn sem
                  travar a tela
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Link>
            </div>
            <PopoutButton toolKey="combos" />
            <div className="flex justify-center">
              <CombosCalculator />
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

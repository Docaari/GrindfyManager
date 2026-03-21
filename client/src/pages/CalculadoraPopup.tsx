import { useParams } from "wouter";
import SizeGeometricoCalculator from "@/components/calculators/SizeGeometricoCalculator";
import RPCalculator from "@/components/calculators/RPCalculator";
import MysteryBountyCalculator from "@/components/calculators/MysteryBountyCalculator";
import BountyCalculator from "@/components/calculators/BountyCalculator";
import SatelliteCalculator from "@/components/calculators/SatelliteCalculator";
import Randomizer from "@/components/calculators/Randomizer";

const toolMap: Record<string, React.FC> = {
  "size-geometrico": SizeGeometricoCalculator,
  "rp-icm": RPCalculator,
  "mystery-bounty": MysteryBountyCalculator,
  "pko-bounty": BountyCalculator,
  "satelites": SatelliteCalculator,
  "randomizador": Randomizer,
};

export default function CalculadoraPopup() {
  const { tool } = useParams<{ tool: string }>();
  const Component = toolMap[tool || ""];

  if (!Component) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
        <p>Ferramenta não encontrada</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <Component />
    </div>
  );
}

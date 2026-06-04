// =============================================================================
// AnaliseMental — pagina que monta a analise mental agregada (ADR-241).
//
// MentalAnalyticsTab (Fase B lead measures + Fase C tilt/mental↔resultado) era
// um componente orfao (nunca montado em producao). Esta pagina o expoe em
// /analise-mental, linkado no Sidebar (grupo VISAO). Autocontido — sem props.
// =============================================================================

import { PageHeader } from "@/components/ui/PageHeader";
import { MentalAnalyticsTab } from "@/components/profile/MentalAnalyticsTab";

export function AnaliseMental() {
  return (
    <div data-testid="analise-mental-page" className="p-6">
      <PageHeader
        title="Analise Mental"
        subtitle="Compliance de warm-up, distribuicao A/B/C-game, tilt tipado e o cruzamento mental × resultado."
      />
      <MentalAnalyticsTab />
    </div>
  );
}

export default AnaliseMental;

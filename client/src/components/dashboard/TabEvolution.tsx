import ProfitChart from "@/components/ProfitChart";
import TournamentTable from "@/components/TournamentTable";
import type { DashboardFiltersState } from './types';

interface TabEvolutionProps {
  performance: any;
  filteredTournaments: any;
  period: string;
  filters: DashboardFiltersState;
}

export function TabEvolution({ performance, filteredTournaments, period, filters }: TabEvolutionProps) {
  return (
    <div>
      <div className="space-y-12">
        {/* Evolução do Lucro - Layout Clean */}
        <ProfitChart
          data={performance || []}
          tournaments={filteredTournaments || []}
          period={period}
        />

        {/* Tabela de Torneios - Container Separado */}
        <div className="tournament-table-section">
          <TournamentTable
            tournaments={filteredTournaments || []}
            filters={filters}
            period={period}
          />
        </div>
      </div>
    </div>
  );
}

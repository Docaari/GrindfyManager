import { hasAnyActiveFilter } from '@/lib/dashboard-filter-helpers';
import type { DashboardFiltersState } from './types';

// Chart loading skeleton
export function ChartSkeleton() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4">
      <div className="flex items-end gap-2 h-32">
        {[40, 65, 45, 80, 55, 70, 50].map((h, i) => (
          <div key={i} className="w-8 bg-gray-700/50 rounded-t animate-pulse" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="text-gray-500 text-sm">Carregando dados...</div>
    </div>
  );
}

// Wrapper for chart content with loading/empty states
export function ChartContent({ loading, data, filters, children }: { loading: boolean; data: any; filters: DashboardFiltersState; children: React.ReactNode }) {
  if (loading) return <ChartSkeleton />;
  if (!data || (Array.isArray(data) && data.length === 0)) {
    // Cobre TODOS os filtros, inclusive os de excluir / faixas / satélite e
    // flight — antes olhava só três chaves e mentia dizendo "sem dados".
    const hasActiveFilters = hasAnyActiveFilter(filters);
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <p>{hasActiveFilters ? 'Nenhum resultado para os filtros selecionados' : 'Sem dados disponíveis'}</p>
      </div>
    );
  }
  return <>{children}</>;
}

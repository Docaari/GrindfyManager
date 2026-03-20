import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import AnalyticsCharts from "@/components/AnalyticsCharts";
import { ChartContent } from './ChartWrapper';
import type { DashboardFiltersState } from './types';

interface TabCategoryProps {
  categoryAnalytics: any;
  categoryLoading: boolean;
  period: string;
  filters: DashboardFiltersState;
}

export function TabCategory({ categoryAnalytics, categoryLoading, period, filters }: TabCategoryProps) {
  return (
    <>
      <h3 className="text-xl font-bold text-white mb-8">🏷️ Análise Por Tipo</h3>

      {/* Primeira linha: Volume e Profit */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">📊</span>
              Volume por Tipo
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Distribuição de torneios por categoria
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[400px]">
              <ChartContent loading={categoryLoading} data={categoryAnalytics} filters={filters}><AnalyticsCharts type="categoryVolume" data={categoryAnalytics || []} /></ChartContent>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">💰</span>
              Profit por Tipo
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Lucro total por categoria com valores
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[400px]">
              <ChartContent loading={categoryLoading} data={categoryAnalytics} filters={filters}><AnalyticsCharts type="categoryProfitWithValues" data={categoryAnalytics || []} /></ChartContent>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Segunda linha: ROI e Lucro Médio */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">📈</span>
              ROI por Tipo
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Retorno sobre investimento por categoria
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[400px]">
              <ChartContent loading={categoryLoading} data={categoryAnalytics} filters={filters}><AnalyticsCharts type="categoryROI" data={categoryAnalytics || []} /></ChartContent>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">💵</span>
              Lucro Médio por Tipo
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Lucro médio por torneio em cada categoria
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[400px]">
              <ChartContent loading={categoryLoading} data={categoryAnalytics} filters={filters}><AnalyticsCharts type="categoryAvgProfitWithValues" data={categoryAnalytics || []} /></ChartContent>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Terceira linha: Evolução do Profit por Tipo */}
      <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10">
        <CardHeader className="pb-6">
          <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
            <span className="text-3xl">📈</span>
            Evolução do Profit por Tipo
          </CardTitle>
          <CardDescription className="text-gray-300 text-base">
            Evolução temporal do lucro por categoria (múltiplas linhas)
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="h-[450px]">
            <ChartContent loading={categoryLoading} data={categoryAnalytics} filters={filters}><AnalyticsCharts type="categoryEvolution" data={categoryAnalytics || []} period={period} /></ChartContent>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

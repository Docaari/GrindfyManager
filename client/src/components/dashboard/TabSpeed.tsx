import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import AnalyticsCharts from "@/components/AnalyticsCharts";
import { ChartContent } from './ChartWrapper';
import type { DashboardFiltersState } from './types';

interface TabSpeedProps {
  speedAnalytics: any;
  speedLoading: boolean;
  period: string;
  filters: DashboardFiltersState;
}

export function TabSpeed({ speedAnalytics, speedLoading, period, filters }: TabSpeedProps) {
  return (
    <>
      {/* Primeira linha: Volume por Velocidade + Profit por Velocidade */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">📊</span>
              Volume por Velocidade
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Distribuição de torneios por tipo de velocidade
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[350px]">
              <ChartContent loading={speedLoading} data={speedAnalytics} filters={filters}><AnalyticsCharts type="speedVolume" data={speedAnalytics || []} /></ChartContent>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">💰</span>
              Profit por Velocidade
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Lucro total por velocidade com valores nas barras
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[350px]">
              <ChartContent loading={speedLoading} data={speedAnalytics} filters={filters}><AnalyticsCharts type="speedProfit" data={speedAnalytics || []} /></ChartContent>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Segunda linha: ROI por Velocidade + Lucro Médio por Velocidade */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">📈</span>
              ROI por Velocidade
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Percentual de retorno por velocidade
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[350px]">
              <ChartContent loading={speedLoading} data={speedAnalytics} filters={filters}><AnalyticsCharts type="speedROI" data={speedAnalytics || []} /></ChartContent>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">🎯</span>
              Lucro Médio por Velocidade
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Profit médio por torneio com valores nas barras
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[350px]">
              <ChartContent loading={speedLoading} data={speedAnalytics} filters={filters}><AnalyticsCharts type="speedAvgProfit" data={speedAnalytics || []} /></ChartContent>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Terceira linha: Evolução do Profit por Velocidade */}
      <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10">
        <CardHeader className="pb-6">
          <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
            <span className="text-3xl">📈</span>
            Evolução do Profit por Velocidade
          </CardTitle>
          <CardDescription className="text-gray-300 text-base">
            Progressão temporal do lucro por velocidade (múltiplas linhas)
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="h-[450px]">
            <ChartContent loading={speedLoading} data={speedAnalytics} filters={filters}><AnalyticsCharts type="speedEvolution" data={speedAnalytics || []} period={period} /></ChartContent>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

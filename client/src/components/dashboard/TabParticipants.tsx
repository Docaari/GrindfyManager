import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import AnalyticsCharts from "@/components/AnalyticsCharts";
import { ChartContent } from './ChartWrapper';
import type { DashboardFiltersState } from './types';

interface TabParticipantsProps {
  fieldAnalytics: any;
  fieldLoading: boolean;
  monthAnalytics: any;
  monthLoading: boolean;
  period: string;
  filters: DashboardFiltersState;
}

export function TabParticipants({ fieldAnalytics, fieldLoading, monthAnalytics, monthLoading, period, filters }: TabParticipantsProps) {
  return (
    <>
      <h3 className="text-xl font-bold text-white mb-8">👥 Análise Por Med. Participantes</h3>

      {/* LINHA 1 - DISTRIBUIÇÃO DE FIELD SIZE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">📊</span>
              Volume por Faixa
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Distribuição de torneios por número de participantes
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[400px]">
              <ChartContent loading={fieldLoading} data={fieldAnalytics} filters={filters}><AnalyticsCharts type="participantsVolume" data={fieldAnalytics || []} /></ChartContent>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">💰</span>
              Lucro por Faixa
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Performance de lucro por faixa de participantes
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[400px]">
              <ChartContent loading={fieldLoading} data={fieldAnalytics} filters={filters}><AnalyticsCharts type="participantsProfit" data={fieldAnalytics || []} /></ChartContent>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* LINHA 2 - PERFORMANCE POR FAIXA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">📈</span>
              ROI por Faixa
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Return on Investment por faixa de participantes
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[400px]">
              <ChartContent loading={fieldLoading} data={fieldAnalytics} filters={filters}><AnalyticsCharts type="participantsROI" data={fieldAnalytics || []} /></ChartContent>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">🏆</span>
              ITM% por Faixa
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Taxa de chegada ao prêmio por faixa de participantes
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[400px]">
              <ChartContent loading={fieldLoading} data={fieldAnalytics} filters={filters}><AnalyticsCharts type="participantsITM" data={fieldAnalytics || []} /></ChartContent>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* LINHA 3 - EVOLUÇÃO TEMPORAL */}
      <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10">
        <CardHeader className="pb-6">
          <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
            <span className="text-3xl">📈</span>
            Evolução do Field Size Médio
          </CardTitle>
          <CardDescription className="text-gray-300 text-base">
            Evolução temporal do tamanho médio do field por período
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="h-[450px]">
            <ChartContent loading={monthLoading} data={monthAnalytics} filters={filters}><AnalyticsCharts type="fieldSizeEvolution" data={monthAnalytics || []} period={period} /></ChartContent>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

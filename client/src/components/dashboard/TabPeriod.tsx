import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";
import AnalyticsCharts from "@/components/AnalyticsCharts";
import { TimeOfDayChart } from "@/components/analytics-charts/TimeOfDayChart";
import { ChartContent } from './ChartWrapper';
import type { DashboardFiltersState } from './types';

interface TabPeriodProps {
  dayAnalytics: any;
  dayLoading: boolean;
  monthAnalytics: any;
  monthLoading: boolean;
  /** Desempenho por turno, ja convertido para o fuso do jogador. */
  timeOfDayAnalytics?: any;
  timeOfDayLoading?: boolean;
  filters: DashboardFiltersState;
}

export function TabPeriod({ dayAnalytics, dayLoading, monthAnalytics, monthLoading, timeOfDayAnalytics, timeOfDayLoading, filters }: TabPeriodProps) {
  return (
    <>
      <h3 className="text-xl font-bold text-white mb-8">📅 Análise Por Período</h3>

      {/* Hora do dia — responde "a que horas eu jogo bem". */}
      <div className="grid grid-cols-1 gap-8 mb-8">
        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <Clock className="h-7 w-7 text-blue-400" />
              Desempenho por Horário
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Lucro por turno do dia, no seu fuso. Passe o mouse para ver ROI e volume.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[340px]" data-testid="chart-time-of-day">
              <ChartContent loading={!!timeOfDayLoading} data={timeOfDayAnalytics} filters={filters}>
                <TimeOfDayChart data={timeOfDayAnalytics || []} />
              </ChartContent>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Primeira linha: Volume e Profit Diário */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">📅</span>
              Volume por Dia da Semana
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Distribuição de torneios por dia da semana
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[400px]">
              <ChartContent loading={dayLoading} data={dayAnalytics} filters={filters}><AnalyticsCharts type="dayVolume" data={dayAnalytics || []} /></ChartContent>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">💰</span>
              Profit por Dia da Semana
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Lucro total por dia da semana com barras verde/vermelhas
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[400px]">
              <ChartContent loading={dayLoading} data={dayAnalytics} filters={filters}><AnalyticsCharts type="dayProfit" data={dayAnalytics || []} /></ChartContent>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Segunda linha: Volume e Profit Mensal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">📊</span>
              Volume Mensal
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Quantidade de torneios por mês com barras azuis
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[400px]">
              <ChartContent loading={monthLoading} data={monthAnalytics} filters={filters}><AnalyticsCharts type="monthVolume" data={monthAnalytics || []} /></ChartContent>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">💰</span>
              Profit Mensal
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Lucro total por mês com barras verde/vermelhas
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[400px]">
              <ChartContent loading={monthLoading} data={monthAnalytics} filters={filters}><AnalyticsCharts type="monthProfit" data={monthAnalytics || []} /></ChartContent>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Terceira linha: Volume e Profit Trimestral */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">🗓️</span>
              Volume por Trimestre
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Quantidade de torneios por trimestre com barras azuis
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[400px]">
              <ChartContent loading={monthLoading} data={monthAnalytics} filters={filters}><AnalyticsCharts type="quarterVolume" data={monthAnalytics || []} /></ChartContent>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">💰</span>
              Profit por Trimestre
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Lucro total por trimestre com barras verde/vermelhas
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[400px]">
              <ChartContent loading={monthLoading} data={monthAnalytics} filters={filters}><AnalyticsCharts type="quarterProfit" data={monthAnalytics || []} /></ChartContent>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

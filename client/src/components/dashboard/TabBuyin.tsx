import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import AnalyticsCharts from "@/components/AnalyticsCharts";
import { ChartContent } from './ChartWrapper';
import type { DashboardFiltersState } from './types';

interface TabBuyinProps {
  buyinAnalytics: any;
  buyinLoading: boolean;
  period: string;
  filters: DashboardFiltersState;
}

export function TabBuyin({ buyinAnalytics, buyinLoading, period, filters }: TabBuyinProps) {
  return (
    <>
      <h3 className="text-xl font-bold text-white mb-8">💰 Análise Por ABI</h3>

      {/* Primeira linha: Volume e Profit */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">📊</span>
              Volume por ABI
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Distribuição de torneios por faixa de buy-in
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[400px]">
              <ChartContent loading={buyinLoading} data={buyinAnalytics} filters={filters}><AnalyticsCharts type="buyinVolume" data={buyinAnalytics || []} /></ChartContent>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">💰</span>
              Profit por ABI
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Lucro total por faixa de buy-in com valores
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[400px]">
              <ChartContent loading={buyinLoading} data={buyinAnalytics} filters={filters}><AnalyticsCharts type="buyinProfitWithValues" data={buyinAnalytics || []} /></ChartContent>
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
              ROI por ABI
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Retorno sobre investimento por faixa de buy-in
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[400px]">
              <ChartContent loading={buyinLoading} data={buyinAnalytics} filters={filters}><AnalyticsCharts type="buyinROI" data={buyinAnalytics || []} /></ChartContent>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">💵</span>
              Lucro Médio por ABI
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Lucro médio por torneio em cada faixa de buy-in
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[400px]">
              <ChartContent loading={buyinLoading} data={buyinAnalytics} filters={filters}><AnalyticsCharts type="buyinAvgProfitWithValues" data={buyinAnalytics || []} /></ChartContent>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Terceira linha: Evolução do ABI Médio */}
      <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10">
        <CardHeader className="pb-6">
          <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
            <span className="text-3xl">📊</span>
            Evolução do ABI Médio
          </CardTitle>
          <CardDescription className="text-gray-300 text-base">
            Evolução temporal do ABI médio jogado ao longo dos meses
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="h-[450px]">
            <ChartContent loading={buyinLoading} data={buyinAnalytics} filters={filters}><AnalyticsCharts type="abiEvolution" data={buyinAnalytics || []} period={period} /></ChartContent>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

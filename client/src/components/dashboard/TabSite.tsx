import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import AnalyticsCharts from "@/components/AnalyticsCharts";
import { ChartContent } from './ChartWrapper';
import type { DashboardFiltersState } from './types';

interface TabSiteProps {
  siteAnalytics: any;
  siteLoading: boolean;
  period: string;
  filters: DashboardFiltersState;
}

export function TabSite({ siteAnalytics, siteLoading, period, filters }: TabSiteProps) {
  return (
    <>
      <h3 className="text-xl font-bold text-white mb-8">🌐 Análise Por Site</h3>

      {/* Primeira linha: Volume e Profit */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">📊</span>
              Volume por Site
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Distribuição de torneios por site de poker
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[400px]">
              <ChartContent loading={siteLoading} data={siteAnalytics} filters={filters}>
                <AnalyticsCharts type="siteVolume" data={siteAnalytics || []} />
              </ChartContent>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">💰</span>
              Profit por Site
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Lucro total por site de poker
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[400px]">
              <ChartContent loading={siteLoading} data={siteAnalytics} filters={filters}>
                <AnalyticsCharts type="siteProfit" data={siteAnalytics || []} />
              </ChartContent>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Segunda linha: Evolução do Profit por Site */}
      <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10">
        <CardHeader className="pb-6">
          <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
            <span className="text-3xl">📈</span>
            Evolução do Profit por Site
          </CardTitle>
          <CardDescription className="text-gray-300 text-base">
            Evolução temporal do lucro acumulado por site de poker
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="h-[450px]">
            <ChartContent loading={siteLoading} data={siteAnalytics} filters={filters}>
              <AnalyticsCharts type="siteEvolution" data={siteAnalytics || []} period={period} />
            </ChartContent>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import AnalyticsCharts from "@/components/AnalyticsCharts";
import { ChartContent } from './ChartWrapper';
import type { DashboardFiltersState } from './types';

interface TabPositionProps {
  fieldAnalytics: any;
  fieldLoading: boolean;
  finalTableAnalytics: any;
  finalTableLoading: boolean;
  filters: DashboardFiltersState;
}

export function TabPosition({ fieldAnalytics, fieldLoading, finalTableAnalytics, finalTableLoading, filters }: TabPositionProps) {
  return (
    <>
      <h3 className="text-xl font-bold text-white mb-8">🥇 Análise Por Posição</h3>

      {/* LINHA 1 - GRÁFICOS DE ELIMINAÇÃO E POSIÇÕES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">⚡</span>
              Eliminação por Field
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Frequência de eliminação por faixa percentual do field
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[400px]">
              <ChartContent loading={fieldLoading} data={fieldAnalytics} filters={filters}><AnalyticsCharts type="fieldElimination" data={fieldAnalytics || []} /></ChartContent>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">🏆</span>
              Posições Final Table
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Distribuição de posições finais (1º-9º lugar)
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[400px]">
              <ChartContent loading={finalTableLoading} data={finalTableAnalytics} filters={filters}><AnalyticsCharts type="finalTablePositions" data={finalTableAnalytics || []} /></ChartContent>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* LINHA 2 - MÉTRICAS DE HEADS UP */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">🎯</span>
              Total de Heads Up
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Total de situações heads-up disputadas (1º + 2º lugar)
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[400px] flex flex-col justify-center items-center">
              <div className="text-center">
                <div className="text-8xl lg:text-9xl font-bold text-white mb-4">
                  {(() => {
                    const victories = Array.isArray(finalTableAnalytics) ? finalTableAnalytics.filter((item: any) => item.position === 1).reduce((sum: number, item: any) => sum + parseInt(item.volume || '0'), 0) : 0;
                    const secondPlace = Array.isArray(finalTableAnalytics) ? finalTableAnalytics.filter((item: any) => item.position === 2).reduce((sum: number, item: any) => sum + parseInt(item.volume || '0'), 0) : 0;
                    const totalHeadsUp = victories + secondPlace;
                    return totalHeadsUp;
                  })()}
                </div>
                <p className="text-gray-400 text-lg mb-4">situações heads-up disputadas</p>
                <div className="text-sm text-gray-500 bg-gray-800 px-4 py-2 rounded-full inline-block">
                  Chegadas à Final (1º + 2º)
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
          <CardHeader className="pb-6">
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">🏆</span>
              Vitórias de Heads Up
            </CardTitle>
            <CardDescription className="text-gray-300 text-base">
              Taxa de vitórias em situações heads-up
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[400px] flex flex-col justify-center items-center">
              <div className="text-center">
                {(() => {
                  const victories = Array.isArray(finalTableAnalytics) ? finalTableAnalytics.filter((item: any) => item.position === 1).reduce((sum: number, item: any) => sum + parseInt(item.volume || '0'), 0) : 0;
                  const secondPlace = Array.isArray(finalTableAnalytics) ? finalTableAnalytics.filter((item: any) => item.position === 2).reduce((sum: number, item: any) => sum + parseInt(item.volume || '0'), 0) : 0;
                  const totalHeadsUp = victories + secondPlace;
                  const percentage = totalHeadsUp > 0 ? ((victories / totalHeadsUp) * 100).toFixed(1) : '0';

                  return (
                    <>
                      <div className="text-7xl lg:text-8xl font-bold text-white mb-3">
                        {victories}
                      </div>
                      <div className="text-3xl lg:text-4xl font-semibold text-emerald-400 mb-4">
                        ({percentage}%)
                      </div>
                      <p className="text-gray-400 text-lg mb-4">vitórias de {totalHeadsUp} heads-up</p>
                      <div className="text-sm text-gray-500 bg-gray-800 px-4 py-2 rounded-full inline-block">
                        Taxa de Conversão
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

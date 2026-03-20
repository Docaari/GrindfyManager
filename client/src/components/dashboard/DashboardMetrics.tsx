import { DollarSign, Percent, Trophy, Coins, TrendingUp, Target, Clock, Award, BarChart3, Calendar, Users } from "lucide-react";
import { formatPercentage } from "@/lib/formatting";
import { formatCurrency } from './formatCurrency';

interface DashboardMetricsProps {
  stats: any;
  categoryAnalytics: any;
  speedAnalytics: any;
  isMainLoading: boolean;
}

export function DashboardMetrics({ stats, categoryAnalytics, speedAnalytics, isMainLoading }: DashboardMetricsProps) {
  if (isMainLoading) {
    return (
      <div className="space-y-6 mb-6">
        {[1, 2, 3].map((row) => (
          <div key={row} className="dashboard-summary grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {[1, 2, 3, 4, 5].map((col) => (
              <div key={col} className="weekly-summary-card">
                <div className="animate-pulse bg-gray-700/50 rounded h-8 w-8 mb-3"></div>
                <div className="animate-pulse bg-gray-700/50 rounded h-6 w-20 mb-2"></div>
                <div className="animate-pulse bg-gray-700/50 rounded h-4 w-16 mb-1"></div>
                <div className="animate-pulse bg-gray-700/50 rounded h-3 w-12"></div>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {/* LINHA 1 - MÉTRICAS DE VOLUME (Azul) */}
      <div className="dashboard-summary grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-6">
        <div className="weekly-summary-card metric-volume">
          <div className="weekly-card-icon text-blue-400">
            <Trophy className="h-8 w-8" />
          </div>
          <div className="weekly-card-value">
            {stats?.count || 0}
          </div>
          <div className="weekly-card-label">Contagem</div>
          <div className="weekly-card-sublabel">Torneios</div>
        </div>

        <div className="weekly-summary-card metric-volume">
          <div className="weekly-card-icon text-blue-400">
            <Coins className="h-8 w-8" />
          </div>
          <div className="weekly-card-value">
            {stats?.reentries || 0}
          </div>
          <div className="weekly-card-label">Reentradas</div>
          <div className="weekly-card-sublabel">Total</div>
        </div>

        <div className="weekly-summary-card metric-volume">
          <div className="weekly-card-icon text-blue-400">
            <Calendar className="h-8 w-8" />
          </div>
          <div className="weekly-card-value">
            {stats?.daysPlayed || 0}
          </div>
          <div className="weekly-card-label">Dias Jogados</div>
          <div className="weekly-card-sublabel">Sessões</div>
        </div>

        <div className="weekly-summary-card metric-volume">
          <div className="weekly-card-icon text-blue-400">
            <Users className="h-8 w-8" />
          </div>
          <div className="weekly-card-value">
            {Math.round(stats?.avgFieldSize || 0)}
          </div>
          <div className="weekly-card-label">Média Part</div>
          <div className="weekly-card-sublabel">Estimativa</div>
        </div>

        <div className="weekly-summary-card metric-volume">
          <div className="weekly-card-icon text-blue-400">
            <Target className="h-8 w-8" />
          </div>
          <div className="weekly-card-value">
            {formatCurrency(stats?.abi || 0)}
          </div>
          <div className="weekly-card-label">ABI</div>
          <div className="weekly-card-sublabel">Médio</div>
        </div>
      </div>
      {/* LINHA 2 - MÉTRICAS FINANCEIRAS (Verde) */}
      <div className="dashboard-summary grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-6">
        <div className="weekly-summary-card metric-profit">
          <div className="weekly-card-icon text-green-400">
            <DollarSign className="h-8 w-8" />
          </div>
          <div className={`weekly-card-value ${(stats?.profit || 0) > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatCurrency(stats?.profit || 0)}
          </div>
          <div className="weekly-card-label">Lucro</div>
          <div className="weekly-card-sublabel">Total</div>
        </div>

        <div className="weekly-summary-card metric-roi">
          <div className="weekly-card-icon text-green-400">
            <Percent className="h-8 w-8" />
          </div>
          <div className={`weekly-card-value ${(stats?.roi || 0) > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatPercentage(stats?.roi || 0)}
          </div>
          <div className="weekly-card-label">ROI</div>
          <div className="weekly-card-sublabel">Retorno</div>
        </div>

        <div className="weekly-summary-card metric-profit">
          <div className="weekly-card-icon text-green-400">
            <TrendingUp className="h-8 w-8" />
          </div>
          <div className={`weekly-card-value ${(stats?.avgProfitPerDay || 0) > 0 ? 'text-green-400' : (stats?.avgProfitPerDay || 0) < 0 ? 'text-red-400' : 'text-gray-400'}`}>
            {formatCurrency(stats?.avgProfitPerDay || 0)}
          </div>
          <div className="weekly-card-label">Lucro por Dia</div>
          <div className="weekly-card-sublabel">Médio</div>
        </div>

        <div className="weekly-summary-card metric-profit">
          <div className="weekly-card-icon text-green-400">
            <BarChart3 className="h-8 w-8" />
          </div>
          <div className={`weekly-card-value ${(stats?.avgProfitPerTournament || 0) > 0 ? 'text-green-400' : (stats?.avgProfitPerTournament || 0) < 0 ? 'text-red-400' : 'text-gray-400'}`}>
            {formatCurrency(stats?.avgProfitPerTournament || 0)}
          </div>
          <div className="weekly-card-label">Lucro Médio</div>
          <div className="weekly-card-sublabel">Torneio</div>
        </div>

        <div className="weekly-summary-card metric-wins">
          <div className="weekly-card-icon text-green-400">
            <Trophy className="h-8 w-8" />
          </div>
          <div className={`weekly-card-value ${(stats?.biggestPrize || 0) > 0 ? 'text-green-400' : 'text-gray-400'}`}>
            {formatCurrency(stats?.biggestPrize || 0)}
          </div>
          <div className="weekly-card-label">Maior Resultado</div>
          <div className="weekly-card-sublabel">Recorde</div>
        </div>
      </div>
      {/* LINHA 3 - MÉTRICAS DE PERFORMANCE (Amarelo) */}
      <div className="dashboard-summary grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-6">
        <div className="weekly-summary-card metric-fts">
          <div className="weekly-card-icon text-yellow-400">
            <Award className="h-8 w-8" />
          </div>
          <div className="weekly-card-value text-yellow-400">
            {formatPercentage(stats?.itm || 0)}
          </div>
          <div className="weekly-card-label">ITM</div>
          <div className="weekly-card-sublabel">In The Money</div>
        </div>

        <div className="weekly-summary-card metric-finish-rate">
          <div className="weekly-card-icon text-yellow-400">
            <Clock className="h-8 w-8" />
          </div>
          <div className="weekly-card-value text-yellow-400">
            {formatPercentage(stats?.earlyFinishRate || 0)}
          </div>
          <div className="weekly-card-label">Final. Precoce</div>
          <div className="weekly-card-sublabel">Early Finish</div>
        </div>

        <div className="weekly-summary-card metric-finish-rate">
          <div className="weekly-card-icon text-yellow-400">
            <Clock className="h-8 w-8" />
          </div>
          <div className="weekly-card-value text-yellow-400">
            {formatPercentage(stats?.lateFinishRate || 0)}
          </div>
          <div className="weekly-card-label">Final. Tardia</div>
          <div className="weekly-card-sublabel">Late Finish</div>
        </div>

        <div className="weekly-summary-card metric-fts">
          <div className="weekly-card-icon text-yellow-400">
            <Award className="h-8 w-8" />
          </div>
          <div className="weekly-card-value text-yellow-400">
            {stats?.finalTables || 0}
          </div>
          <div className="weekly-card-label">Mesas Finais</div>
          <div className="weekly-card-sublabel">Final Tables</div>
        </div>

        <div className="weekly-summary-card metric-wins">
          <div className="weekly-card-icon text-yellow-400">
            <Trophy className="h-8 w-8" />
          </div>
          <div className="weekly-card-value text-yellow-400">
            {stats?.firstPlaceCount || 0}
          </div>
          <div className="weekly-card-label">Cravadas</div>
          <div className="weekly-card-sublabel">Vitórias</div>
        </div>
      </div>
      {/* LINHA 4 - MÉTRICAS DE CATEGORIAS (Vermelho/Roxo) */}
      <div className="dashboard-summary grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-6">
        <div className="weekly-summary-card metric-vanilla">
          <div className="weekly-card-icon">
            <div className="text-3xl text-red-400">🎯</div>
          </div>
          <div className="weekly-card-value">
            {Array.isArray(categoryAnalytics) ? categoryAnalytics.find((c: any) => c.category === 'Vanilla')?.volume || 0 : 0}
          </div>
          <div className="weekly-card-label">Vanilla</div>
          <div className="weekly-card-sublabel">Torneios</div>
        </div>

        <div className="weekly-summary-card metric-pko">
          <div className="weekly-card-icon">
            <div className="text-3xl text-red-400">🎖️</div>
          </div>
          <div className="weekly-card-value">
            {Array.isArray(categoryAnalytics) ? categoryAnalytics.find((c: any) => c.category === 'PKO')?.volume || 0 : 0}
          </div>
          <div className="weekly-card-label">PKO</div>
          <div className="weekly-card-sublabel">Progressive</div>
        </div>

        <div className="weekly-summary-card metric-mystery">
          <div className="weekly-card-icon">
            <div className="text-3xl text-red-400">🎁</div>
          </div>
          <div className="weekly-card-value">
            {Array.isArray(categoryAnalytics) ? categoryAnalytics.find((c: any) => c.category === 'Mystery')?.volume || 0 : 0}
          </div>
          <div className="weekly-card-label">Mystery</div>
          <div className="weekly-card-sublabel">Mystery</div>
        </div>

        <div className="weekly-summary-card metric-normal">
          <div className="weekly-card-icon">
            <div className="text-3xl text-purple-400">⏰</div>
          </div>
          <div className="weekly-card-value">
            {Array.isArray(speedAnalytics) ? Number(speedAnalytics.find((s: any) => s.speed === 'Normal')?.volume || 0) : 0}
          </div>
          <div className="weekly-card-label">Normal</div>
          <div className="weekly-card-sublabel">Velocidade</div>
        </div>

        <div className="weekly-summary-card metric-turbo">
          <div className="weekly-card-icon">
            <div className="text-3xl text-purple-400">⚡</div>
          </div>
          <div className="weekly-card-value">
            {(() => {
              const turboValue = Array.isArray(speedAnalytics) ? Number(speedAnalytics.find((s: any) => s.speed === 'Turbo')?.volume || 0) : 0;
              const hyperValue = Array.isArray(speedAnalytics) ? Number(speedAnalytics.find((s: any) => s.speed === 'Hyper')?.volume || 0) : 0;
              return turboValue + hyperValue;
            })()}
          </div>
          <div className="weekly-card-label">Turbo/Hyper</div>
          <div className="weekly-card-sublabel">Velocidade</div>
        </div>
      </div>
    </>
  );
}

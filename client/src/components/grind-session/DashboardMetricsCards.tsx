import {
  Clock,
  Trophy,
  Target,
  Calendar,
  TrendingUp,
  DollarSign,
  Award,
  BarChart3,
  Users,
  Zap,
  BookOpen,
  Heart,
  Volume2,
  ChevronDown,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { DashboardMetrics } from "./types";

interface DashboardMetricsCardsProps {
  dashboardMetrics: DashboardMetrics;
  showTournamentToggle: boolean;
  setShowTournamentToggle: (value: boolean) => void;
  showMentalToggle: boolean;
  setShowMentalToggle: (value: boolean) => void;
}

export default function DashboardMetricsCards({
  dashboardMetrics,
  showTournamentToggle,
  setShowTournamentToggle,
  showMentalToggle,
  setShowMentalToggle,
}: DashboardMetricsCardsProps) {
  return (
    <div className="mb-8">
      {/* Line 1: Contagem | Reentradas | Média Participantes | ABI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="weekly-summary-card card-contagem">
          <div className="card-icon">
            <Users className="w-8 h-8 text-blue-400" />
          </div>
          <div className="card-content">
            <div className="card-value">{dashboardMetrics.totalVolume}</div>
            <div className="card-label">Contagem</div>
          </div>
        </div>

        <div className="weekly-summary-card card-reentradas">
          <div className="card-icon">
            <Target className="w-8 h-8 text-orange-400" />
          </div>
          <div className="card-content">
            <div className="card-value">{dashboardMetrics.totalReentradas}</div>
            <div className="card-label">Reentradas</div>
          </div>
        </div>

        <div className="weekly-summary-card card-participantes">
          <div className="card-icon">
            <Users className="w-8 h-8 text-purple-400" />
          </div>
          <div className="card-content">
            <div className="card-value">{dashboardMetrics.avgParticipants > 0 ? Math.round(dashboardMetrics.avgParticipants) : '-'}</div>
            <div className="card-label">Média Participantes</div>
          </div>
        </div>

        <div className="weekly-summary-card card-abi">
          <div className="card-icon">
            <DollarSign className="w-8 h-8 text-emerald-400" />
          </div>
          <div className="card-content">
            <div className="card-value">{formatCurrency(dashboardMetrics.avgABI)}</div>
            <div className="card-label">ABI</div>
          </div>
        </div>
      </div>

      {/* Line 2: Lucro | ROI | Lucro Médio por Dia | Lucro Médio por Torneio */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="weekly-summary-card card-lucro">
          <div className="card-icon">
            <TrendingUp className="w-8 h-8 text-green-400" />
          </div>
          <div className="card-content">
            <div className="card-value">{formatCurrency(dashboardMetrics.totalProfit)}</div>
            <div className="card-label">Lucro</div>
          </div>
        </div>

        <div className="weekly-summary-card card-roi">
          <div className="card-icon">
            <BarChart3 className="w-8 h-8 text-blue-400" />
          </div>
          <div className="card-content">
            <div className="card-value">{dashboardMetrics.avgROI.toFixed(1)}%</div>
            <div className="card-label">ROI</div>
          </div>
        </div>

        <div className="weekly-summary-card card-lucro-dia">
          <div className="card-icon">
            <Calendar className="w-8 h-8 text-cyan-400" />
          </div>
          <div className="card-content">
            <div className="card-value">
              {dashboardMetrics.totalSessions > 0
                ? formatCurrency(dashboardMetrics.totalProfit / dashboardMetrics.totalSessions)
                : formatCurrency(0)
              }
            </div>
            <div className="card-label">Lucro Médio por Dia</div>
          </div>
        </div>

        <div className="weekly-summary-card card-lucro-torneio">
          <div className="card-icon">
            <Trophy className="w-8 h-8 text-yellow-400" />
          </div>
          <div className="card-content">
            <div className="card-value">
              {dashboardMetrics.totalVolume > 0
                ? formatCurrency(dashboardMetrics.totalProfit / dashboardMetrics.totalVolume)
                : formatCurrency(0)
              }
            </div>
            <div className="card-label">Lucro Médio por Torneio</div>
          </div>
        </div>
      </div>

      {/* Line 3: ITM | Mesas Finais | Cravadas | Maior Resultado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="weekly-summary-card card-itm">
          <div className="card-icon">
            <Award className="w-8 h-8 text-green-400" />
          </div>
          <div className="card-content">
            <div className="card-value">{dashboardMetrics.itmPercentage.toFixed(1)}%</div>
            <div className="card-label">ITM</div>
          </div>
        </div>

        <div className="weekly-summary-card card-ft">
          <div className="card-icon">
            <Trophy className="w-8 h-8 text-orange-400" />
          </div>
          <div className="card-content">
            <div className="card-value">{dashboardMetrics.totalFTs}</div>
            <div className="card-label">Mesas Finais</div>
          </div>
        </div>

        <div className="weekly-summary-card card-cravadas">
          <div className="card-icon">
            <Trophy className="w-8 h-8 text-emerald-400" />
          </div>
          <div className="card-content">
            <div className="card-value">{dashboardMetrics.totalCravadas}</div>
            <div className="card-label">Cravadas</div>
          </div>
        </div>

        <div className="weekly-summary-card card-maior-resultado">
          <div className="card-icon">
            <DollarSign className="w-8 h-8 text-purple-400" />
          </div>
          <div className="card-content">
            <div className="card-value">{dashboardMetrics.maiorResultado > 0 ? formatCurrency(dashboardMetrics.maiorResultado) : '-'}</div>
            <div className="card-label">Maior Resultado</div>
          </div>
        </div>
      </div>

      {/* Toggle 1 - Torneios */}
      <div className="mb-6">
        <button
          onClick={() => setShowTournamentToggle(!showTournamentToggle)}
          className="flex items-center justify-between w-full p-4 bg-slate-800/70 hover:bg-slate-700/70 transition-colors rounded-lg border border-slate-700/50"
        >
          <h3 className="text-lg font-semibold text-gray-200">🏆 Torneios</h3>
          <ChevronDown className={`w-5 h-5 text-emerald-400 transition-transform ${showTournamentToggle ? 'transform rotate-180' : ''}`} />
        </button>

        {showTournamentToggle && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="weekly-summary-card card-vanilla">
              <div className="card-icon">
                <Trophy className="w-6 h-6 text-blue-400" />
              </div>
              <div className="card-content">
                <div className="card-value">{dashboardMetrics.vanillaCount || 0}</div>
                <div className="card-label">Vanilla ({(dashboardMetrics.vanillaPercentage || 0).toFixed(1)}%)</div>
              </div>
            </div>

            <div className="weekly-summary-card card-pko">
              <div className="card-icon">
                <Target className="w-6 h-6 text-orange-400" />
              </div>
              <div className="card-content">
                <div className="card-value">{dashboardMetrics.pkoCount || 0}</div>
                <div className="card-label">PKO ({(dashboardMetrics.pkoPercentage || 0).toFixed(1)}%)</div>
              </div>
            </div>

            <div className="weekly-summary-card card-mystery">
              <div className="card-icon">
                <Trophy className="w-6 h-6 text-pink-400" />
              </div>
              <div className="card-content">
                <div className="card-value">{dashboardMetrics.mysteryCount || 0}</div>
                <div className="card-label">Mystery ({(dashboardMetrics.mysteryPercentage || 0).toFixed(1)}%)</div>
              </div>
            </div>

            <div className="weekly-summary-card card-normal">
              <div className="card-icon">
                <Clock className="w-6 h-6 text-green-400" />
              </div>
              <div className="card-content">
                <div className="card-value">{dashboardMetrics.normalCount || 0}</div>
                <div className="card-label">Normal ({(dashboardMetrics.normalPercentage || 0).toFixed(1)}%)</div>
              </div>
            </div>

            <div className="weekly-summary-card card-turbo-hyper">
              <div className="card-icon">
                <Zap className="w-6 h-6 text-yellow-400" />
              </div>
              <div className="card-content">
                <div className="card-value">{(dashboardMetrics.turboCount || 0) + (dashboardMetrics.hyperCount || 0)}</div>
                <div className="card-label">Turbo/Hyper ({((dashboardMetrics.turboPercentage || 0) + (dashboardMetrics.hyperPercentage || 0)).toFixed(1)}%)</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toggle 2 - Performance Mental */}
      <div className="mb-6">
        <button
          onClick={() => setShowMentalToggle(!showMentalToggle)}
          className="flex items-center justify-between w-full p-4 bg-slate-800/70 hover:bg-slate-700/70 transition-colors rounded-lg border border-slate-700/50"
        >
          <h3 className="text-lg font-semibold text-gray-200">🧠 Performance Mental</h3>
          <ChevronDown className={`w-5 h-5 text-emerald-400 transition-transform ${showMentalToggle ? 'transform rotate-180' : ''}`} />
        </button>

        {showMentalToggle && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="weekly-summary-card card-preparacao">
              <div className="card-icon">
                <BookOpen className="w-6 h-6 text-blue-400" />
              </div>
              <div className="card-content">
                <div className="card-value">{dashboardMetrics.avgPreparationPercentage.toFixed(0)}%</div>
                <div className="card-label">Preparação</div>
              </div>
            </div>

            <div className="weekly-summary-card card-energia">
              <div className="card-icon">
                <Zap className="w-6 h-6 text-red-400" />
              </div>
              <div className="card-content">
                <div className="card-value">{dashboardMetrics.avgEnergia.toFixed(1)}</div>
                <div className="card-label">Energia</div>
              </div>
            </div>

            <div className="weekly-summary-card card-foco">
              <div className="card-icon">
                <Target className="w-6 h-6 text-green-400" />
              </div>
              <div className="card-content">
                <div className="card-value">{dashboardMetrics.avgFoco.toFixed(1)}</div>
                <div className="card-label">Foco</div>
              </div>
            </div>

            <div className="weekly-summary-card card-confianca">
              <div className="card-icon">
                <Trophy className="w-6 h-6 text-yellow-400" />
              </div>
              <div className="card-content">
                <div className="card-value">{dashboardMetrics.avgConfianca.toFixed(1)}</div>
                <div className="card-label">Confiança</div>
              </div>
            </div>

            <div className="weekly-summary-card card-emocional">
              <div className="card-icon">
                <Heart className="w-6 h-6 text-pink-400" />
              </div>
              <div className="card-content">
                <div className="card-value">{dashboardMetrics.avgInteligenciaEmocional.toFixed(1)}</div>
                <div className="card-label">Inteligência Emocional</div>
              </div>
            </div>

            <div className="weekly-summary-card card-interferencias">
              <div className="card-icon">
                <Volume2 className="w-6 h-6 text-gray-400" />
              </div>
              <div className="card-content">
                <div className="card-value">{dashboardMetrics.avgInterferencias.toFixed(1)}</div>
                <div className="card-label">Interferências</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

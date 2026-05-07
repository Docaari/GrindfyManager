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
  Globe,
  Brain,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatCurrency as formatCurrencyDefault } from "@/lib/utils";
import { DashboardMetrics, BreakdownBucket } from "./types";
import type { GrindPageVisibility } from "@/lib/grindPagePreferences";

// Item 18: Simple SVG sparkline for mental metrics
function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const max = 10;
  const min = 0;
  const width = 60;
  const height = 20;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / (max - min)) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="inline-block ml-2 opacity-70">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface DashboardMetricsCardsProps {
  dashboardMetrics: DashboardMetrics;
  showTournamentToggle: boolean;
  setShowTournamentToggle: (value: boolean) => void;
  showMentalToggle: boolean;
  setShowMentalToggle: (value: boolean) => void;
  recentSessions?: Array<{ energiaMedia: number; focoMedio: number; confiancaMedia: number; inteligenciaEmocionalMedia: number; interferenciasMedia: number; preparationPercentage?: number }>;
  visibility?: GrindPageVisibility;
  mentalEnabled?: boolean;
  formatCurrencyBase?: (amountUsd: number) => string;
  convertCurrencyBase?: (amountUsd: number) => number;
  // v2 (Sprint Grind-Cards-Reform): toggles dos 3 breakdowns colapsaveis.
  showTypesToggle?: boolean;
  setShowTypesToggle?: (value: boolean) => void;
  showSpeedsToggle?: boolean;
  setShowSpeedsToggle?: (value: boolean) => void;
  showPlatformsToggle?: boolean;
  setShowPlatformsToggle?: (value: boolean) => void;
}

// =============================================================================
// BreakdownCard — 1 card por bucket (count + % header, profit + roi sub-values)
// =============================================================================

function BreakdownCard({
  bucket,
  testIdPrefix,
  fmt,
  iconColor,
  Icon = Trophy,
}: {
  bucket: BreakdownBucket;
  testIdPrefix: string;
  fmt: (amountUsd: number) => string;
  iconColor?: string;
  Icon?: LucideIcon;
}) {
  // testid: lowercase + replace spaces with hyphens (preserva hifens existentes).
  const slug = bucket.key.toLowerCase().replace(/\s+/g, '-');
  const roiText = bucket.roi === null ? '—' : `${bucket.roi.toFixed(1)}%`;
  const color = iconColor ?? bucket.colorHex ?? '#94a3b8';
  return (
    <div
      data-testid={`${testIdPrefix}-${slug}`}
      className="weekly-summary-card"
    >
      <div className="card-icon">
        <Icon className="w-6 h-6" style={{ color }} />
      </div>
      <div className="card-content">
        <div className="card-value">{bucket.count}</div>
        <div className="card-label">
          {bucket.label} ({bucket.percentage.toFixed(1)}%)
        </div>
        <div className="text-xs text-gray-400 mt-1">
          Lucro: {fmt(bucket.totalProfitUsd)}
        </div>
        <div className="text-xs text-gray-400">
          ROI: {roiText}
        </div>
      </div>
    </div>
  );
}

export default function DashboardMetricsCards({
  dashboardMetrics,
  showTournamentToggle,
  setShowTournamentToggle,
  showMentalToggle,
  setShowMentalToggle,
  recentSessions = [],
  visibility,
  mentalEnabled = true,
  formatCurrencyBase,
  convertCurrencyBase,
  showTypesToggle = true,
  setShowTypesToggle,
  showSpeedsToggle = true,
  setShowSpeedsToggle,
  showPlatformsToggle = true,
  setShowPlatformsToggle,
}: DashboardMetricsCardsProps) {
  // Item 18: Extract last 5 sessions for sparklines
  const last5 = recentSessions.slice(0, 5).reverse();
  const fmt = formatCurrencyBase ?? formatCurrencyDefault;
  void convertCurrencyBase; // reservado para uso futuro (gráficos por moeda base)
  void showTournamentToggle;
  void setShowTournamentToggle;
  // Visibility helper aceita chaves novas e legadas (`tournaments`).
  const show = (k: keyof GrindPageVisibility | 'tournaments') =>
    visibility ? (visibility as any)[k] !== false : true;
  const typesBreakdown = dashboardMetrics.typesBreakdown ?? [];
  const speedsBreakdown = dashboardMetrics.speedsBreakdown ?? [];
  const platformsBreakdown = dashboardMetrics.platformsBreakdown ?? [];
  return (
    <div className="mb-8">
      {/* Line 1: Contagem | Reentradas | Média Participantes | ABI */}
      {show('kpisVolume') && (
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
            <div className="card-value">{fmt(dashboardMetrics.avgABI)}</div>
            <div className="card-label">ABI</div>
          </div>
        </div>
      </div>
      )}

      {/* Line 2: Lucro | ROI | Lucro Médio por Dia | Lucro Médio por Torneio */}
      {show('kpisProfit') && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="weekly-summary-card card-lucro">
          <div className="card-icon">
            <TrendingUp className="w-8 h-8 text-green-400" />
          </div>
          <div className="card-content">
            <div className="card-value">{fmt(dashboardMetrics.totalProfit)}</div>
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
                ? fmt(dashboardMetrics.totalProfit / dashboardMetrics.totalSessions)
                : fmt(0)
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
                ? fmt(dashboardMetrics.totalProfit / dashboardMetrics.totalVolume)
                : fmt(0)
              }
            </div>
            <div className="card-label">Lucro Médio por Torneio</div>
          </div>
        </div>
      </div>
      )}

      {/* Line 3: ITM | Mesas Finais | Cravadas | Maior Resultado */}
      {show('kpisItm') && (
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
            <div className="card-value">{dashboardMetrics.maiorResultado > 0 ? fmt(dashboardMetrics.maiorResultado) : '-'}</div>
            <div className="card-label">Maior Resultado</div>
          </div>
        </div>
      </div>
      )}

      {/* v2 - Toggle Torneios (5 tipos primarios com Lucro + ROI) */}
      {show('kpisTypes') && (
      <div className="mb-6">
        <button
          onClick={() => setShowTypesToggle?.(!showTypesToggle)}
          data-testid="grind-breakdown-types"
          aria-expanded={showTypesToggle ? 'true' : 'false'}
          aria-controls="grind-breakdown-types-panel"
          className="flex items-center justify-between w-full p-4 bg-slate-800/70 hover:bg-slate-700/70 transition-colors rounded-lg border border-slate-700/50"
        >
          <h3 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-emerald-400" />
            Torneios
          </h3>
          <ChevronDown className={`w-5 h-5 text-emerald-400 transition-transform ${showTypesToggle ? 'transform rotate-180' : ''}`} />
        </button>

        {showTypesToggle && (
          <div id="grind-breakdown-types-panel" className="mt-4 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {typesBreakdown.map((bucket) => (
              <BreakdownCard
                key={bucket.key}
                bucket={bucket}
                testIdPrefix="bucket-type"
                fmt={fmt}
                Icon={Trophy}
              />
            ))}
          </div>
        )}
      </div>
      )}

      {/* v2 - Toggle Velocidade (Normal/Turbo/Hyper com Lucro + ROI) */}
      {show('kpisSpeeds') && (
      <div className="mb-6">
        <button
          onClick={() => setShowSpeedsToggle?.(!showSpeedsToggle)}
          data-testid="grind-breakdown-speeds"
          aria-expanded={showSpeedsToggle ? 'true' : 'false'}
          aria-controls="grind-breakdown-speeds-panel"
          className="flex items-center justify-between w-full p-4 bg-slate-800/70 hover:bg-slate-700/70 transition-colors rounded-lg border border-slate-700/50"
        >
          <h3 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            Velocidade
          </h3>
          <ChevronDown className={`w-5 h-5 text-emerald-400 transition-transform ${showSpeedsToggle ? 'transform rotate-180' : ''}`} />
        </button>

        {showSpeedsToggle && (
          <div id="grind-breakdown-speeds-panel" className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {speedsBreakdown.map((bucket) => {
              const speedColor =
                bucket.key === 'Turbo'
                  ? '#facc15'
                  : bucket.key === 'Hyper'
                  ? '#ef4444'
                  : '#10b981';
              return (
                <BreakdownCard
                  key={bucket.key}
                  bucket={bucket}
                  testIdPrefix="bucket-speed"
                  fmt={fmt}
                  iconColor={speedColor}
                  Icon={Zap}
                />
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* v2 - Toggle Plataformas (network agregado, N cards dinamicos) */}
      {show('kpisPlatforms') && (
      <div className="mb-6">
        <button
          onClick={() => setShowPlatformsToggle?.(!showPlatformsToggle)}
          data-testid="grind-breakdown-platforms"
          aria-expanded={showPlatformsToggle ? 'true' : 'false'}
          aria-controls="grind-breakdown-platforms-panel"
          className="flex items-center justify-between w-full p-4 bg-slate-800/70 hover:bg-slate-700/70 transition-colors rounded-lg border border-slate-700/50"
        >
          <h3 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
            <Globe className="w-5 h-5 text-cyan-400" />
            Plataformas
          </h3>
          <ChevronDown className={`w-5 h-5 text-emerald-400 transition-transform ${showPlatformsToggle ? 'transform rotate-180' : ''}`} />
        </button>

        {showPlatformsToggle && (
          platformsBreakdown.length === 0 ? (
            <div id="grind-breakdown-platforms-panel" className="mt-4 p-4 text-sm text-gray-400 italic">
              Nenhuma plataforma com registros no periodo
            </div>
          ) : (
            <div id="grind-breakdown-platforms-panel" className="mt-4 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {platformsBreakdown.map((bucket) => (
                <BreakdownCard
                  key={bucket.key}
                  bucket={bucket}
                  testIdPrefix="bucket-platform"
                  fmt={fmt}
                  iconColor="#22d3ee"
                  Icon={Globe}
                />
              ))}
            </div>
          )
        )}
      </div>
      )}

      {/* Toggle 2 - Performance Mental */}
      {mentalEnabled && (
      <div className="mb-6">
        <button
          onClick={() => setShowMentalToggle(!showMentalToggle)}
          className="flex items-center justify-between w-full p-4 bg-slate-800/70 hover:bg-slate-700/70 transition-colors rounded-lg border border-slate-700/50"
        >
          <h3 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
            <Brain className="w-5 h-5 text-pink-400" />
            Performance Mental
          </h3>
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
                <div className="card-value">
                  {dashboardMetrics.avgEnergia.toFixed(1)}
                  <MiniSparkline values={last5.map(s => s.energiaMedia)} color="#ef4444" />
                </div>
                <div className="card-label">Energia</div>
              </div>
            </div>

            <div className="weekly-summary-card card-foco">
              <div className="card-icon">
                <Target className="w-6 h-6 text-green-400" />
              </div>
              <div className="card-content">
                <div className="card-value">
                  {dashboardMetrics.avgFoco.toFixed(1)}
                  <MiniSparkline values={last5.map(s => s.focoMedio)} color="#10b981" />
                </div>
                <div className="card-label">Foco</div>
              </div>
            </div>

            <div className="weekly-summary-card card-confianca">
              <div className="card-icon">
                <Trophy className="w-6 h-6 text-yellow-400" />
              </div>
              <div className="card-content">
                <div className="card-value">
                  {dashboardMetrics.avgConfianca.toFixed(1)}
                  <MiniSparkline values={last5.map(s => s.confiancaMedia)} color="#f59e0b" />
                </div>
                <div className="card-label">Confiança</div>
              </div>
            </div>

            <div className="weekly-summary-card card-emocional">
              <div className="card-icon">
                <Heart className="w-6 h-6 text-pink-400" />
              </div>
              <div className="card-content">
                <div className="card-value">
                  {dashboardMetrics.avgInteligenciaEmocional.toFixed(1)}
                  <MiniSparkline values={last5.map(s => s.inteligenciaEmocionalMedia)} color="#ec4899" />
                </div>
                <div className="card-label">Inteligência Emocional</div>
              </div>
            </div>

            <div className="weekly-summary-card card-interferencias">
              <div className="card-icon">
                <Volume2 className="w-6 h-6 text-gray-400" />
              </div>
              <div className="card-content">
                <div className="card-value">
                  {dashboardMetrics.avgInterferencias.toFixed(1)}
                  <MiniSparkline values={last5.map(s => s.interferenciasMedia)} color="#6b7280" />
                </div>
                <div className="card-label">Interferências</div>
              </div>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

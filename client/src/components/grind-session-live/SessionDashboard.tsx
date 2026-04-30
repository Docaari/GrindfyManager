import type { SessionStats } from './types';
import { formatNumberWithDots, getScreenCapColors, countAddOnsPaid } from './helpers';

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  BRL: 'R$',
  EUR: '€',
  GBP: '£',
  CNY: '¥',
  USDT: 'USDT ',
  BTC: 'BTC ',
};

function formatNative(currency: string, value: number): string {
  const sym = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  return `${sym}${formatNumberWithDots(value)}`;
}

interface SessionDashboardProps {
  stats: SessionStats;
  showDashboard: boolean;
  onToggleDashboard: () => void;
  /** Session tournaments used to compute Add-ons Pagos KPI (Spec 2). */
  sessionTournaments?: any[];
}

export default function SessionDashboard({
  stats,
  showDashboard,
  onToggleDashboard,
  sessionTournaments,
}: SessionDashboardProps) {
  const addOnsPaid = countAddOnsPaid(sessionTournaments || []);
  return (
    <div className="dashboard-section">
      <button
        className={`dashboard-toggle ${!showDashboard ? 'collapsed' : ''}`}
        onClick={onToggleDashboard}
      >
        <span>📊 Dashboard</span>
        <span className="toggle-icon">▼</span>
      </button>

      <div className={`dashboard-content ${!showDashboard ? 'collapsed' : ''}`}>
        {/* Metricas de Status */}
        <div className="metrics-row metrics-status">
          <div className={`metric-card screen-cap ${getScreenCapColors(stats.emAndamento, stats.screenCap).alertClass}`}>
            <div className="metric-icon">🖥️</div>
            <div className="metric-value">
              {stats.emAndamento}/{stats.screenCap}
            </div>
            <div className="metric-label">Em Andamento</div>
            <div className="metric-sub">
              {Math.round((stats.emAndamento / (stats.screenCap || 10)) * 100)}% do cap
            </div>
          </div>

          <div className="metric-card metric-registered">
            <div className="metric-icon">🎯</div>
            <div className="metric-value">{stats.registros}</div>
            <div className="metric-label">Registrados</div>
          </div>

          <div className="metric-card metric-reentries">
            <div className="metric-icon">🔄</div>
            <div className="metric-value">{stats.reentradas}</div>
            <div className="metric-label">Reentradas</div>
          </div>

          <div className="metric-card metric-upcoming">
            <div className="metric-icon">⏰</div>
            <div className="metric-value">{stats.proximos}</div>
            <div className="metric-label">Proximos</div>
          </div>

          <div className="metric-card metric-finished">
            <div className="metric-icon">✅</div>
            <div className="metric-value">{stats.concluidos}</div>
            <div className="metric-label">Concluidos</div>
          </div>
        </div>

        {/* Metricas Financeiras */}
        <div className="metrics-row metrics-financial">
          <div className="metric-card metric-invested">
            <div className="metric-icon">{'\u{1F4B8}'}</div>
            <div className="metric-value" data-testid="kpi-total-invested">
              ${formatNumberWithDots(stats.totalInvestidoUSD ?? stats.totalInvestido)}
            </div>
            <div className="metric-label">Total Investido</div>
            {stats.breakdown && stats.breakdown.byCurrency.length > 1 && (
              <div className="metric-sub text-[10px] text-gray-400" data-testid="kpi-invested-breakdown">
                {stats.breakdown.byCurrency
                  .map((c) => formatNative(c.currency, c.invested))
                  .join(' + ')}
              </div>
            )}
          </div>

          <div className="metric-card metric-profit">
            <div className="metric-icon">{'\u{1F4B0}'}</div>
            <div
              className="metric-value"
              data-testid="kpi-profit"
              style={{'--value-color': (stats.profitUSD ?? stats.profit) >= 0 ? '#00ff88' : '#ff4444'} as React.CSSProperties}
            >
              ${formatNumberWithDots(stats.profitUSD ?? stats.profit)}
            </div>
            <div className="metric-label">Profit</div>
            {stats.breakdown && stats.breakdown.byCurrency.length > 1 && (
              <div className="metric-sub text-[10px] text-gray-400" data-testid="kpi-profit-breakdown">
                {stats.breakdown.byCurrency
                  .map((c) => formatNative(c.currency, c.profit))
                  .join(' + ')}
              </div>
            )}
            {stats.breakdown?.hasMissingRate && (
              <div className="metric-sub text-[10px] text-amber-400" data-testid="kpi-profit-rate-warning">
                Cotacao ausente. Configure FX em Settings.
              </div>
            )}
          </div>

          {/* Add-on + Re-entry KPIs (ADR-014) */}
          <div className="metric-card metric-addon" data-testid="kpi-addons-pagos">
            <div className="metric-icon">➕</div>
            <div className="metric-value">
              {addOnsPaid.count}
              {addOnsPaid.total > 0 && (
                <span className="text-xs text-gray-400 ml-1">
                  (${formatNumberWithDots(addOnsPaid.total)})
                </span>
              )}
            </div>
            <div className="metric-label">Add-ons Pagos</div>
          </div>

          <div className="metric-card metric-total-entries" data-testid="kpi-entradas-totais">
            <div className="metric-icon">🔁</div>
            <div className="metric-value">
              {stats.totalEntries ?? stats.registros}
            </div>
            <div className="metric-label">Entradas Totais</div>
            {(stats.totalEntries ?? stats.registros) > stats.registros && (
              <div className="metric-sub text-xs text-gray-500">
                {stats.registros} torneios + {(stats.totalEntries ?? stats.registros) - stats.registros} re-entries
              </div>
            )}
          </div>
        </div>

        {/* Metricas de Performance */}
        <div className="metrics-row metrics-performance">
          <div className="metric-card metric-itm">
            <div className="metric-icon">🎯</div>
            <div className="metric-value">{stats.itmPercent.toFixed(1)}%</div>
            <div className="metric-label">ITM%</div>
          </div>

          <div className="metric-card metric-roi">
            <div className="metric-icon">📈</div>
            <div className="metric-value" style={{'--value-color': stats.roi >= 0 ? '#00ff88' : '#ff4444'} as React.CSSProperties}>
              {stats.roi.toFixed(1)}%
            </div>
            <div className="metric-label">ROI%</div>
          </div>

          <div className="metric-card metric-fts">
            <div className="metric-icon">🏆</div>
            <div className="metric-value">{stats.fts}</div>
            <div className="metric-label">FTs</div>
          </div>

          <div className="metric-card metric-wins">
            <div className="metric-icon">💎</div>
            <div className="metric-value">{stats.cravadas}</div>
            <div className="metric-label">Cravadas</div>
          </div>
        </div>
      </div>
    </div>
  );
}

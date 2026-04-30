import type { SessionStats } from './types';
import { getScreenCapColors } from './helpers';

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  BRL: 'R$',
  EUR: '€',
  GBP: '£',
  CNY: '¥',
  USDT: 'USDT ',
  BTC: 'BTC ',
};

const moneyFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 0,
});

// Formata valor monetario com 2 casas decimais e separador de milhares pt-BR.
// Lida com NaN/Infinity/null/undefined retornando '0,00'. Substitui
// formatNumberWithDots para campos financeiros (que produzia strings invalidas
// quando recebia float, ex: "-120.72.000.000.000.").
function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value as number)) return '0,00';
  return moneyFormatter.format(value as number);
}

function formatNative(currency: string, value: number): string {
  const sym = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  return `${sym}${formatMoney(value)}`;
}

// Mesmo formatNative com sinal explicito para profit (positivos ganham '+').
function formatNativeSigned(currency: string, value: number): string {
  const sym = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}${sym}${formatMoney(abs)}`;
}

interface SessionDashboardProps {
  stats: SessionStats;
  showDashboard: boolean;
  onToggleDashboard: () => void;
  /** @deprecated Add-ons Pagos agora vem de stats.addOnsPaid (currency-aware). */
  sessionTournaments?: any[];
}

export default function SessionDashboard({
  stats,
  showDashboard,
  onToggleDashboard,
}: SessionDashboardProps) {
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
        {/* Linha 1: Status (Em Andamento, Registrados, Reentradas, Add-ons) */}
        <div className="metrics-row metrics-status">
          <div className={`metric-card screen-cap ${getScreenCapColors(stats.emAndamento, stats.screenCap).alertClass}`}>
            <div className="metric-icon">{'\u{1F5A5}'}</div>
            <div className="metric-value">
              {stats.emAndamento}/{stats.screenCap}
            </div>
            <div className="metric-label">Em Andamento</div>
            <div className="metric-sub">
              {Math.round((stats.emAndamento / (stats.screenCap || 10)) * 100)}% do cap
            </div>
          </div>

          <div className="metric-card metric-registered">
            <div className="metric-icon">{'\u{1F3AF}'}</div>
            <div className="metric-value">{stats.registros}</div>
            <div className="metric-label">Registrados</div>
          </div>

          <div className="metric-card metric-reentries">
            <div className="metric-icon">{'\u{1F501}'}</div>
            <div className="metric-value">{stats.reentradas}</div>
            <div className="metric-label">Reentradas</div>
          </div>

          <div className="metric-card metric-addon" data-testid="kpi-addons-pagos">
            <div className="metric-icon">{'\u{2795}'}</div>
            <div className="metric-value">
              {stats.addOnsPaid.count}
              {stats.addOnsPaid.totalUSD > 0 && (
                <span className="text-xs text-gray-400 ml-1">
                  (${formatMoney(stats.addOnsPaid.totalUSD)})
                </span>
              )}
            </div>
            <div className="metric-label">Add-ons</div>
            {stats.addOnsPaid.byCurrency.length > 1 && (
              <div className="metric-sub text-[10px] text-gray-400" data-testid="kpi-addons-breakdown">
                {stats.addOnsPaid.byCurrency
                  .map((c) => formatNative(c.currency, c.total))
                  .join(' + ')}
              </div>
            )}
            {stats.addOnsPaid.hasMissingRate && (
              <div className="metric-sub text-[10px] text-amber-400">
                Cotacao ausente.
              </div>
            )}
          </div>
        </div>

        {/* Linha 2: Financeiro + Volume (Total Investido, ABI, Media Part., ITM) */}
        <div className="metrics-row metrics-financial">
          <div className="metric-card metric-invested">
            <div className="metric-icon">{'\u{1F4B8}'}</div>
            <div className="metric-value" data-testid="kpi-total-invested">
              ${formatMoney(stats.totalInvestidoUSD ?? stats.totalInvestido)}
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

          <div className="metric-card metric-abi" data-testid="kpi-abi">
            <div className="metric-icon">{'\u{1F4CA}'}</div>
            <div className="metric-value">${formatMoney(stats.abi)}</div>
            <div className="metric-label">ABI</div>
            <div className="metric-sub text-[10px] text-gray-500">
              Buy-in medio (USD) por torneio
            </div>
          </div>

          <div className="metric-card metric-avg-participants" data-testid="kpi-avg-participants">
            <div className="metric-icon">{'\u{1F465}'}</div>
            <div className="metric-value">
              {integerFormatter.format(Math.round(stats.avgParticipants))}
            </div>
            <div className="metric-label">Media Participantes</div>
            <div className="metric-sub text-[10px] text-gray-500">
              Estimado via Gtd / BI{stats.avgParticipants > 0 ? '' : ' (sem Gtd)'}
            </div>
          </div>

          <div className="metric-card metric-itm">
            <div className="metric-icon">{'\u{1F3AF}'}</div>
            <div className="metric-value">{stats.itmPercent.toFixed(1)}%</div>
            <div className="metric-label">ITM%</div>
          </div>
        </div>

        {/* Linha 3: Performance (Profit, ROI, FTs, Cravadas) */}
        <div className="metrics-row metrics-performance">
          <div className="metric-card metric-profit">
            <div className="metric-icon">{'\u{1F4B0}'}</div>
            <div
              className="metric-value"
              data-testid="kpi-profit"
              style={{'--value-color': (stats.profitUSD ?? stats.profit) >= 0 ? '#00ff88' : '#ff4444'} as React.CSSProperties}
            >
              ${formatMoney(stats.profitUSD ?? stats.profit)}
            </div>
            <div className="metric-label">Profit</div>
            {stats.breakdown && stats.breakdown.byCurrency.length > 1 && (
              <div className="metric-sub text-[10px] text-gray-400" data-testid="kpi-profit-breakdown">
                {stats.breakdown.byCurrency
                  .map((c) => formatNativeSigned(c.currency, c.profit))
                  .join(', ')}
              </div>
            )}
            {stats.breakdown?.hasMissingRate && (
              <div className="metric-sub text-[10px] text-amber-400" data-testid="kpi-profit-rate-warning">
                Cotacao ausente. Configure FX em Settings.
              </div>
            )}
          </div>

          <div className="metric-card metric-roi">
            <div className="metric-icon">{'\u{1F4C8}'}</div>
            <div className="metric-value" style={{'--value-color': stats.roi >= 0 ? '#00ff88' : '#ff4444'} as React.CSSProperties}>
              {stats.roi.toFixed(1)}%
            </div>
            <div className="metric-label">ROI%</div>
          </div>

          <div className="metric-card metric-fts">
            <div className="metric-icon">{'\u{1F3C6}'}</div>
            <div className="metric-value">{stats.fts}</div>
            <div className="metric-label">FTs</div>
          </div>

          <div className="metric-card metric-wins">
            <div className="metric-icon">{'\u{1F48E}'}</div>
            <div className="metric-value">{stats.cravadas}</div>
            <div className="metric-label">Cravadas</div>
          </div>
        </div>
      </div>
    </div>
  );
}

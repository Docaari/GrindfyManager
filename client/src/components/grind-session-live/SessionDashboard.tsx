import type { SessionStats } from './types';
import { formatNumberWithDots, getScreenCapColors } from './helpers';

interface SessionDashboardProps {
  stats: SessionStats;
  showDashboard: boolean;
  onToggleDashboard: () => void;
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
            <div className="metric-icon">💸</div>
            <div className="metric-value">${formatNumberWithDots(stats.totalInvestido)}</div>
            <div className="metric-label">Total Investido</div>
          </div>

          <div className="metric-card metric-profit">
            <div className="metric-icon">💰</div>
            <div className="metric-value" style={{'--value-color': stats.profit >= 0 ? '#00ff88' : '#ff4444'} as React.CSSProperties}>
              ${formatNumberWithDots(stats.profit)}
            </div>
            <div className="metric-label">Profit</div>
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

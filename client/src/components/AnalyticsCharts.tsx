import SiteCharts from './analytics-charts/SiteCharts';
import BuyinCharts from './analytics-charts/BuyinCharts';
import CategoryCharts from './analytics-charts/CategoryCharts';
import SpeedCharts from './analytics-charts/SpeedCharts';
import PeriodCharts from './analytics-charts/PeriodCharts';
import ParticipantsCharts from './analytics-charts/ParticipantsCharts';
import PositionCharts from './analytics-charts/PositionCharts';

interface AnalyticsChartsProps {
  type: string;
  data: any[];
  period?: string;
}

const SITE_TYPES = new Set(['site', 'siteVolume', 'siteProfit', 'siteEvolution']);
const BUYIN_TYPES = new Set(['buyin', 'buyinVolume', 'buyinProfit', 'buyinProfitWithValues', 'buyinROI', 'buyinAvgProfitWithValues', 'abiEvolution']);
const CATEGORY_TYPES = new Set(['category', 'categoryVolume', 'categoryProfit', 'categoryProfitWithValues', 'categoryROI', 'categoryAvgProfit', 'categoryAvgProfitWithValues', 'categoryEvolution']);
const SPEED_TYPES = new Set(['speed', 'speedVolume', 'speedProfit', 'speedROI', 'speedAvgProfit', 'speedEvolution']);
const PERIOD_TYPES = new Set(['day', 'dayVolume', 'dayProfit', 'dayROI', 'month', 'monthProfit', 'monthVolume', 'quarterVolume', 'quarterProfit']);
const PARTICIPANTS_TYPES = new Set(['participantsVolume', 'participantsProfit', 'participantsROI', 'participantsITM', 'fieldSizeEvolution']);
const POSITION_TYPES = new Set(['field', 'fieldElimination', 'finalTable', 'finalTablePositions']);

export default function AnalyticsCharts({ type, data, period = "all" }: AnalyticsChartsProps) {
  // Proteção contra dados undefined
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400">
        <p>Sem dados disponíveis</p>
      </div>
    );
  }

  const props = { type, data, period };

  if (SITE_TYPES.has(type)) return <SiteCharts {...props} />;
  if (BUYIN_TYPES.has(type)) return <BuyinCharts {...props} />;
  if (CATEGORY_TYPES.has(type)) return <CategoryCharts {...props} />;
  if (SPEED_TYPES.has(type)) return <SpeedCharts {...props} />;
  if (PERIOD_TYPES.has(type)) return <PeriodCharts {...props} />;
  if (PARTICIPANTS_TYPES.has(type)) return <ParticipantsCharts {...props} />;
  if (POSITION_TYPES.has(type)) return <PositionCharts {...props} />;

  return (
    <div className="h-64 flex items-center justify-center text-gray-400">
      <p>Tipo de gráfico não suportado</p>
    </div>
  );
}

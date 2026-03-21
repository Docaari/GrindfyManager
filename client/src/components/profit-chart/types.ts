export interface ProfitChartProps {
  data: Array<{
    date: string;
    profit: string | number;
    buyins: string | number;
    count: string | number;
  }>;
  showComparison?: boolean;
  tournaments?: Array<{
    id: string;
    name: string;
    site: string;
    category: string;
    speed: string;
    position: number;
    fieldSize: number;
    result: number;
    prize?: number;
    bounty?: number;
    date: string;
    datePlayed: string;
    buyIn: number;
  }>;
  period?: string;
}

export interface ComparisonDataItem {
  date: string;
  cumulative: number;
  daily: number;
}

export interface ComparisonChartDataItem {
  date: string;
  cumulative: number;
  cumulative2: number;
  count: number;
  profit: number;
  buyins: number;
  p1Cumulative: number;
  p2Cumulative: number;
}

export interface BigHitDotProps {
  cx?: number;
  cy?: number;
  payload?: any;
}

export interface ProcessedChartData {
  date: string;
  fullDate: string;
  profit: number;
  cumulative: number;
  buyins: number;
  count: number;
  index: number;
  isBigHit?: boolean;
  profitJump?: number;
  tournament?: any;
}

export interface BigHitData extends ProcessedChartData {
  isBigHit: true;
  profitJump: number;
  tournament: any;
}

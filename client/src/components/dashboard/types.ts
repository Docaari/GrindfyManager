export interface DashboardFiltersState {
  sites?: string[];
  categories?: string[];
  speeds?: string[];
  keyword?: string;
  keywordType?: 'contains' | 'not_contains';
  dateFrom?: string;
  dateTo?: string;
  participantMin?: number;
  participantMax?: number;
  profileBased?: boolean;
}

export interface AvailableOptions {
  sites: string[];
  categories: string[];
  speeds: string[];
}

export interface DashboardTab {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  emoji: string;
  active: boolean;
}

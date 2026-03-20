import type { DashboardTab } from './types';

interface DashboardTabsProps {
  tabs: DashboardTab[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function DashboardTabs({ tabs, activeTab, setActiveTab }: DashboardTabsProps) {
  return (
    <div className="dashboard-tabs flex flex-wrap gap-4 mb-12">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`chart-tab-button ${tab.active ? 'active' : ''}`}
        >
          <span className="text-lg mr-3">{tab.emoji}</span>
          <tab.icon className="h-5 w-5 mr-3" />
          <span className="font-semibold">{tab.name}</span>
        </button>
      ))}
    </div>
  );
}

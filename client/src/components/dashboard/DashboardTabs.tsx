import { useRef, useState, useEffect, useCallback } from 'react';
import type { DashboardTab } from './types';

interface DashboardTabsProps {
  tabs: DashboardTab[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function DashboardTabs({ tabs, activeTab, setActiveTab }: DashboardTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  const updateFades = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeftFade(el.scrollLeft > 0);
    setShowRightFade(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);

  useEffect(() => {
    updateFades();
    window.addEventListener('resize', updateFades);
    return () => window.removeEventListener('resize', updateFades);
  }, [updateFades]);

  // Auto-scroll active tab into view on mount
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const activeBtn = el.querySelector(`[data-tab-id="${activeTab}"]`) as HTMLElement | null;
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, []);

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
    // Auto-scroll clicked tab to center
    const el = scrollRef.current;
    if (!el) return;
    const btn = el.querySelector(`[data-tab-id="${tabId}"]`) as HTMLElement | null;
    if (btn) {
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  };

  return (
    <div className="relative mb-12">
      {/* Left fade indicator (mobile only) */}
      {showLeftFade && (
        <div className="md:hidden absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-gray-900 to-transparent z-10 pointer-events-none" />
      )}

      {/* Scrollable container */}
      <div
        ref={scrollRef}
        onScroll={updateFades}
        className="dashboard-tabs flex gap-4 mb-0 md:flex-wrap overflow-x-auto md:overflow-x-visible flex-nowrap md:flex-wrap scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {tabs.map(tab => (
          <button
            key={tab.id}
            data-tab-id={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={`chart-tab-button whitespace-nowrap flex-shrink-0 ${tab.active ? 'active' : ''} md:whitespace-normal md:flex-shrink`}
          >
            <span className="text-lg mr-3 hidden md:inline">{tab.emoji}</span>
            <tab.icon className="h-5 w-5 mr-2 md:mr-3" />
            <span className="font-semibold text-sm md:text-base">{tab.name}</span>
          </button>
        ))}
      </div>

      {/* Right fade indicator (mobile only) */}
      {showRightFade && (
        <div className="md:hidden absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-900 to-transparent z-10 pointer-events-none" />
      )}

      {/* Hide scrollbar CSS */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

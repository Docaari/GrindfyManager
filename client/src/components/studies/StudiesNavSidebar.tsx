/**
 * Sprint Studies-Reform — RF-01: Sidebar de navegacao /estudos/*
 *
 * Items: Dashboard, Temas, Stats, Spots, Recomendacoes (definidos em ./navItems).
 * Inclui StudyStreakBadge no rodape.
 *
 * Lessons:
 *   #1 hooks first
 *   #2 data-testid: studies-nav-sidebar, studies-nav-item-{view}
 */

import React from 'react';
import { useLocation } from 'wouter';
import { StudyStreakBadge } from './StudyStreakBadge';
import { STUDIES_NAV_ITEMS, isStudiesNavItemActive } from './navItems';

interface StudiesNavSidebarProps {
  collapsed?: boolean;
}

export function StudiesNavSidebar({ collapsed = false }: StudiesNavSidebarProps) {
  const [location, navigate] = useLocation();

  return (
    <aside
      data-testid="studies-nav-sidebar"
      data-collapsed={collapsed ? 'true' : 'false'}
      aria-label="Navegacao Estudos"
      className={`flex flex-col bg-gray-900 border-r border-gray-800 ${collapsed ? 'w-16' : 'w-56'} h-full`}
    >
      <nav className="flex-1 p-2 space-y-1">
        {STUDIES_NAV_ITEMS.map((item) => {
          const active = isStudiesNavItemActive(item, location);
          const Icon = item.icon;
          return (
            <button
              key={item.view}
              type="button"
              data-testid={`studies-nav-item-${item.view}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 rounded px-3 py-2 text-left text-sm transition-colors ${
                active
                  ? 'bg-poker-accent/20 text-white font-semibold ring-2 ring-poker-accent/50'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-4 h-4" aria-hidden />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>
      <div className={`p-3 border-t border-gray-800 ${collapsed ? 'flex justify-center' : ''}`}>
        <StudyStreakBadge />
      </div>
    </aside>
  );
}

export default StudiesNavSidebar;

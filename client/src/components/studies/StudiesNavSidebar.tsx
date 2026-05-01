/**
 * Sprint Studies-Reform — RF-01: Sidebar de navegacao /estudos/*
 *
 * Items: Dashboard, Temas, Stats, Spots, Recomendacoes.
 * Inclui StudyStreakBadge no rodape.
 *
 * Lessons:
 *   #1 hooks first
 *   #2 data-testid: studies-nav-sidebar, studies-nav-item-{view}
 */

import React from 'react';
import { useLocation } from 'wouter';
import {
  Home,
  BookOpen,
  BarChart3,
  Bookmark,
  Sparkles,
} from 'lucide-react';
import { StudyStreakBadge } from './StudyStreakBadge';

interface NavItem {
  view: string;
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}

const NAV_ITEMS: NavItem[] = [
  { view: 'dashboard', path: '/estudos/dashboard', label: 'Dashboard', icon: Home },
  { view: 'temas', path: '/estudos/temas', label: 'Temas', icon: BookOpen },
  { view: 'stats', path: '/estudos/stats', label: 'Stats', icon: BarChart3 },
  { view: 'spots', path: '/estudos/spots', label: 'Spots', icon: Bookmark },
  { view: 'recomendacoes', path: '/estudos/recomendacoes', label: 'Recomendacoes', icon: Sparkles },
];

interface StudiesNavSidebarProps {
  collapsed?: boolean;
}

export function StudiesNavSidebar({ collapsed = false }: StudiesNavSidebarProps) {
  const [location, navigate] = useLocation();

  function isActive(item: NavItem): boolean {
    const path = item.path;
    if (item.view === 'dashboard') {
      return location === '/estudos' || location.startsWith('/estudos/dashboard');
    }
    return location === path || location.startsWith(`${path}/`) || location.startsWith(`${path}?`);
  }

  return (
    <aside
      data-testid="studies-nav-sidebar"
      data-collapsed={collapsed ? 'true' : 'false'}
      aria-label="Navegacao Estudos"
      className={`flex flex-col bg-gray-900 border-r border-gray-800 ${collapsed ? 'w-16' : 'w-56'} h-full`}
    >
      <nav className="flex-1 p-2 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
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

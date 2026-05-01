/**
 * Sprint Studies-Reform — RF-01: Bottom-nav mobile (<768px)
 *
 * 5 items na mesma ordem da sidebar. Tap target altura 64px (h-16).
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
  { view: 'recomendacoes', path: '/estudos/recomendacoes', label: 'Recs', icon: Sparkles },
];

export function StudiesBottomNav() {
  const [location, navigate] = useLocation();

  function isActive(item: NavItem): boolean {
    const path = item.path;
    if (item.view === 'dashboard') {
      return location === '/estudos' || location.startsWith('/estudos/dashboard');
    }
    return location === path || location.startsWith(`${path}/`) || location.startsWith(`${path}?`);
  }

  return (
    <nav
      data-testid="studies-bottom-nav"
      aria-label="Navegacao Estudos (mobile)"
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around bg-gray-900 border-t border-gray-800 h-16 min-h-[64px]"
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(item);
        const Icon = item.icon;
        return (
          <button
            key={item.view}
            type="button"
            data-testid={`studies-bottom-nav-item-${item.view}`}
            aria-current={active ? 'page' : undefined}
            aria-label={item.label}
            onClick={() => navigate(item.path)}
            className={`flex-1 flex items-center justify-center text-sm ${
              active ? 'text-poker-accent' : 'text-gray-400'
            }`}
          >
            <Icon className="w-5 h-5" aria-hidden />
          </button>
        );
      })}
    </nav>
  );
}

export default StudiesBottomNav;

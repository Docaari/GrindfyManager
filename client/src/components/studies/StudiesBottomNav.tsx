/**
 * Sprint Studies-Reform — RF-01: Bottom-nav mobile (<768px)
 *
 * 5 items na mesma ordem da sidebar (definidos em ./navItems).
 * Tap target altura 64px (h-16).
 */

import React from 'react';
import { useLocation } from 'wouter';
import { STUDIES_NAV_ITEMS, isStudiesNavItemActive } from './navItems';

export function StudiesBottomNav() {
  const [location, navigate] = useLocation();

  return (
    <nav
      data-testid="studies-bottom-nav"
      aria-label="Navegacao Estudos (mobile)"
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around bg-gray-900 border-t border-gray-800 h-16 min-h-[64px]"
    >
      {STUDIES_NAV_ITEMS.map((item) => {
        const active = isStudiesNavItemActive(item, location);
        const Icon = item.icon;
        return (
          <button
            key={item.view}
            type="button"
            data-testid={`studies-bottom-nav-item-${item.view}`}
            aria-current={active ? 'page' : undefined}
            aria-label={item.shortLabel ?? item.label}
            onClick={() => navigate(item.path)}
            className={`flex-1 flex items-center justify-center text-sm ${
              active ? 'text-primary' : 'text-gray-400'
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

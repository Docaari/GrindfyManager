/**
 * Shared nav items + active-route helper para sidebar e bottom-nav de /estudos.
 * Mantemos uma unica fonte de verdade para evitar drift entre as duas variantes
 * (lesson #11 — fonte de verdade unica).
 */

import {
  Home,
  BookOpen,
  BarChart3,
  Bookmark,
  Sparkles,
  Repeat,
  Clock,
  type LucideIcon,
} from 'lucide-react';

export interface StudiesNavItem {
  view: string;
  path: string;
  label: string;
  /** Label curto usado no bottom-nav mobile. */
  shortLabel?: string;
  icon: LucideIcon;
}

export const STUDIES_NAV_ITEMS: StudiesNavItem[] = [
  { view: 'dashboard', path: '/estudos/dashboard', label: 'Dashboard', icon: Home },
  { view: 'temas', path: '/estudos/temas', label: 'Temas', icon: BookOpen },
  { view: 'stats', path: '/estudos/stats', label: 'Stats', icon: BarChart3 },
  { view: 'spots', path: '/estudos/spots', label: 'Spots', icon: Bookmark },
  // Sprint Estudos-Fixes GAP-2: historico de sessoes de estudo.
  {
    view: 'sessoes',
    path: '/estudos/sessoes',
    label: 'Sessões',
    shortLabel: 'Sess.',
    icon: Clock,
  },
  // Sprint Spot-Anki-Reentry-3 RF-3: rota nova /estudos/reentry.
  {
    view: 'reentry',
    path: '/estudos/reentry',
    label: 'Reentry',
    shortLabel: 'Rev.',
    icon: Repeat,
  },
  {
    view: 'recomendacoes',
    path: '/estudos/recomendacoes',
    label: 'Recomendacoes',
    shortLabel: 'Recs',
    icon: Sparkles,
  },
];

export function isStudiesNavItemActive(item: StudiesNavItem, location: string): boolean {
  if (item.view === 'dashboard') {
    return location === '/estudos' || location.startsWith('/estudos/dashboard');
  }
  const path = item.path;
  return location === path || location.startsWith(`${path}/`) || location.startsWith(`${path}?`);
}

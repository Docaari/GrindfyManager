/**
 * Sprint Studies-Reform — RF-01: Studies wrapper reformado
 *
 * Layout shell: sidebar (>=1024px) | sidebar collapsed (768-1023px) | bottom-nav (<768px).
 * URL routing manual sobre wouter location:
 *   /estudos             -> dashboard
 *   /estudos/dashboard   -> dashboard
 *   /estudos/temas       -> ThemesView
 *   /estudos/stats       -> StatsView wrapper
 *   /estudos/spots       -> SpotsView
 *   /estudos/recomendacoes -> RecommendationsView
 *   /estudos/foo (unknown) -> Redirect /estudos/dashboard
 *
 * Cmd/Ctrl+K abre QuickSearchPalette. Sidebar collapse persiste em localStorage.
 *
 * Lessons:
 *   #1  hooks first (todos useQuery/useState/useEffect ANTES de qualquer return)
 *   #2  data-testid: studies-nav-sidebar, studies-bottom-nav, studies-view-{name}
 *  #11  sem default actions decorativas no shell
 *  #12  TanStack cache continuity: shell permanece montado entre views
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, Redirect } from 'wouter';
import { usePermission } from '@/hooks/usePermission';
import AccessDenied from '@/components/AccessDenied';
import { StudiesNavSidebar } from '@/components/studies/StudiesNavSidebar';
import { StudiesBottomNav } from '@/components/studies/StudiesBottomNav';
import { QuickSearchPalette } from '@/components/studies/QuickSearchPalette';
import { OnboardingWizard } from '@/components/studies/onboarding/OnboardingWizard';
import { ThemesView } from '@/components/studies/ThemesView';
// MEDIUM-6 reviewer: novo detail view para /estudos/temas/:id.
import ThemeDetailView from '@/components/studies/ThemeDetailView';
// Sprint Estudos-Sessao-1 RF-05: pagina dedicada /estudos/sessao/:id.
import StudySessionPage from '@/components/studies/StudySessionPage';
import { StatsView } from '@/components/studies/StatsView';
import { SpotsView } from '@/components/studies/SpotsView';
import { StudiesDashboard } from '@/components/studies/dashboard/StudiesDashboard';
import { RecommendationsView } from '@/components/studies/recommendations/RecommendationsView';
// Sprint Spot-Anki-Reentry-3 RF-3: pagina de revisao espacada (Anki-style).
import { ReentryQueuePage } from '@/pages/studies/Reentry';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type Breakpoint = 'mobile' | 'tablet' | 'desktop';
type ViewKey =
  | 'dashboard'
  | 'temas'
  | 'tema-detail'
  | 'sessao-detail'
  | 'stats'
  | 'spots'
  | 'recomendacoes'
  | 'reentry'
  | 'unknown';

const COLLAPSE_KEY = 'grindfy:studies:sidebar_collapsed';
const ONBOARDING_KEY = 'grindfy:studies:onboarding_completed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeCollapsed(v: boolean): void {
  try {
    localStorage.setItem(COLLAPSE_KEY, v ? 'true' : 'false');
  } catch {
    // ignore
  }
}

function detectBreakpoint(): Breakpoint {
  if (typeof window === 'undefined' || !window.matchMedia) return 'desktop';
  if (window.matchMedia('(min-width: 1024px)').matches) return 'desktop';
  if (window.matchMedia('(min-width: 768px)').matches) return 'tablet';
  return 'mobile';
}

// MEDIUM-6 reviewer: extrai themeId do path '/estudos/temas/:id'.
// Retorna null para `/estudos/temas` (lista) e `/estudos/temas/novo` (criacao).
function extractThemeIdFromPath(path: string): string | null {
  const stripped = path.split('?')[0].replace(/\/+$/, '');
  const m = /^\/estudos\/temas\/([^/]+)$/.exec(stripped);
  if (!m) return null;
  const id = m[1];
  // 'novo' eh rota de criacao — nao eh detail.
  if (!id || id === 'novo') return null;
  return id;
}

// Sprint Estudos-Sessao-1 RF-05: extrai sessionId do path '/estudos/sessao/:id'.
function extractSessionIdFromPath(path: string): string | null {
  const stripped = path.split('?')[0].replace(/\/+$/, '');
  const m = /^\/estudos\/sessao\/([^/]+)$/.exec(stripped);
  if (!m) return null;
  return m[1] || null;
}

function viewFromPath(path: string): ViewKey {
  const stripped = path.split('?')[0];
  if (stripped === '/estudos' || stripped === '/estudos/' || stripped.startsWith('/estudos/dashboard')) {
    return 'dashboard';
  }
  if (stripped.startsWith('/estudos/temas')) {
    return extractThemeIdFromPath(stripped) ? 'tema-detail' : 'temas';
  }
  if (stripped.startsWith('/estudos/sessao')) {
    return extractSessionIdFromPath(stripped) ? 'sessao-detail' : 'unknown';
  }
  if (stripped.startsWith('/estudos/stats')) return 'stats';
  if (stripped.startsWith('/estudos/spots')) return 'spots';
  if (stripped.startsWith('/estudos/recomendacoes')) return 'recomendacoes';
  if (stripped.startsWith('/estudos/reentry')) return 'reentry';
  return 'unknown';
}

export default function Studies() {
  // Hooks first — todos antes de qualquer return condicional.
  const hasPermission = usePermission('studies_access');
  const [location] = useLocation();
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(detectBreakpoint);
  const [manualCollapsed, setManualCollapsed] = useState<boolean>(readCollapsed);
  const [paletteOpen, setPaletteOpen] = useState<boolean>(false);
  const [onboardingOpen, setOnboardingOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(ONBOARDING_KEY) !== 'true';
    } catch {
      return false;
    }
  });

  // Resync breakpoint quando viewport muda (resize listener barato).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setBreakpoint(detectBreakpoint());
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Cmd/Ctrl+K abre QuickSearchPalette (escopo global enquanto /estudos*).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    function onKey(e: KeyboardEvent) {
      const isK = e.key === 'k' || e.key === 'K';
      if (isK && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const view = useMemo(() => viewFromPath(location || '/estudos'), [location]);
  const showSidebar = breakpoint !== 'mobile';
  const showBottomNav = breakpoint === 'mobile';
  const sidebarCollapsed = breakpoint === 'tablet' ? true : manualCollapsed;

  function toggleCollapse() {
    setManualCollapsed((prev) => {
      const next = !prev;
      writeCollapsed(next);
      return next;
    });
  }

  if (!hasPermission) {
    return (
      <AccessDenied
        featureName="Estudos"
        description="Organize seu conhecimento de poker por temas e spots"
        currentPlan="free"
        requiredPlan="pro"
        pageName="Estudos"
        onViewPlans={() => {
          window.location.href = '/subscriptions';
        }}
      />
    );
  }

  // URL desconhecida: redireciona para dashboard mas mantem o shell montado.
  function renderView() {
    switch (view) {
      case 'unknown':
        return <Redirect to="/estudos/dashboard" />;
      case 'dashboard':
        return (
          <div data-testid="studies-view-dashboard">
            <StudiesDashboard />
          </div>
        );
      case 'temas':
        return <ThemesView />;
      case 'tema-detail': {
        // MEDIUM-6 reviewer: render ThemeDetailView para /estudos/temas/:id.
        const themeId = extractThemeIdFromPath(location || '/estudos/temas');
        if (!themeId) return <ThemesView />;
        return (
          <div data-testid="studies-view-tema-detail">
            <ThemeDetailView themeId={themeId} />
          </div>
        );
      }
      case 'sessao-detail': {
        // Sprint Estudos-Sessao-1 RF-05: render StudySessionPage.
        const sessionId = extractSessionIdFromPath(location || '/estudos/sessao');
        if (!sessionId) return <Redirect to="/estudos/dashboard" />;
        return (
          <div data-testid="studies-view-sessao-detail">
            <StudySessionPage sessionId={sessionId} />
          </div>
        );
      }
      case 'stats':
        return (
          <div data-testid="studies-view-stats">
            <StatsView />
          </div>
        );
      case 'spots':
        return <SpotsView />;
      case 'recomendacoes':
        return <RecommendationsView />;
      case 'reentry':
        return (
          <div data-testid="studies-view-reentry">
            <ReentryQueuePage />
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div className="min-h-screen bg-poker-bg text-white" data-testid="studies-layout-main">
      <div className="flex">
        {showSidebar && (
          <div className="flex-shrink-0 relative">
            <StudiesNavSidebar collapsed={sidebarCollapsed} />
            {breakpoint === 'desktop' && (
              <button
                type="button"
                data-testid="studies-sidebar-toggle"
                onClick={toggleCollapse}
                aria-label={sidebarCollapsed ? 'Expandir sidebar' : 'Contrair sidebar'}
                className="absolute -right-3 top-4 w-6 h-6 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-400 hover:text-white"
              >
                {sidebarCollapsed ? (
                  <ChevronRight className="w-3 h-3" aria-hidden />
                ) : (
                  <ChevronLeft className="w-3 h-3" aria-hidden />
                )}
              </button>
            )}
          </div>
        )}
        <main
          className={`flex-1 min-w-0 ${showBottomNav ? 'pb-20' : ''}`}
          data-testid="studies-main"
        >
          {renderView()}
        </main>
      </div>
      {showBottomNav && <StudiesBottomNav />}
      {paletteOpen && (
        <QuickSearchPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      )}
      {onboardingOpen && (
        <OnboardingWizard open={onboardingOpen} onOpenChange={setOnboardingOpen} />
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/queryClient';
import BugReportModal from '@/components/BugReportModal';
import ImprovementSuggestionModal from '@/components/ImprovementSuggestionModal';
import HeaderLogo from '@/components/branding/HeaderLogo';
import { tokens } from '@/lib/ui-tokens';
import { getTrialDaysRemaining, getSubscriptionStatus, isSuperAdmin } from '../../../shared/permissions';
import {
  BarChart3,
  Upload,
  Calendar,
  PlayCircle,
  Brain,
  Trophy,
  Settings,
  BookOpen,
  Calculator,
  LogOut,
  ChevronLeft,
  ChevronRight,
  User,
  Users,
  Gamepad2,
  Wrench,
  TrendingUp,
  Bug,
  Lightbulb,
  CreditCard,
  MessageSquare,
  Wallet,
  GraduationCap,
  Layers,
  HelpCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

/**
 * Sub-componente que executa useQuery para spots pendentes.
 * Sprint coach-page-reform-1: extraido para que o `useQuery` (que precisa de
 * QueryClientProvider no escopo) seja invocado em sub-arvore isolada. Wrap
 * com ErrorBoundary garante que testes que renderizam Sidebar sem
 * QueryClientProvider nao crashem (o badge fica oculto silenciosamente).
 *
 * Reporta o resultado via callback (lift state up).
 */
const PendingSpotsFetcher: React.FC<{
  enabled: boolean;
  onResult: (count: number | null, badgeText: string | null) => void;
}> = ({ enabled, onResult }) => {
  const pendingSpotsQuery = useQuery<{ items: unknown[]; total?: number }>({
    queryKey: ['/api/starred-hands/pending', { reviewLater: 'all' }],
    queryFn: () =>
      apiRequest('GET', '/api/starred-hands/pending?reviewLater=all'),
    enabled,
    staleTime: 30_000,
  });

  const count = pendingSpotsQuery.isLoading
    ? null
    : typeof pendingSpotsQuery.data?.total === 'number'
      ? pendingSpotsQuery.data.total
      : Array.isArray(pendingSpotsQuery.data?.items)
        ? pendingSpotsQuery.data!.items.length
        : 0;

  const badgeText =
    count === null ? null : count > 99 ? '99+' : String(count);

  // Reporta apenas quando muda. useEffect evita loop de set durante render.
  React.useEffect(() => {
    onResult(count, badgeText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, badgeText]);

  return null;
};

/**
 * ErrorBoundary minimo para isolar PendingSpotsFetcher quando QueryClient
 * nao esta disponivel (ex: testes que renderizam Sidebar sem QueryClientProvider).
 */
class PendingSpotsBoundary extends React.Component<
  { children: React.ReactNode },
  { errored: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { errored: false };
  }
  static getDerivedStateFromError(): { errored: boolean } {
    return { errored: true };
  }
  componentDidCatch(): void {
    // silencioso — badge simplesmente nao renderiza.
  }
  render(): React.ReactNode {
    if (this.state.errored) return null;
    return this.props.children;
  }
}

const Sidebar: React.FC = () => {
  const [location] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { user, logout, isAdmin } = useAuth();

  // Sprint F2 W4 (RF-10): badge de Spots Pendentes em /estudos.
  // Sprint coach-page-reform-1: useQuery isolado em sub-arvore com ErrorBoundary
  // para nao crashar quando Sidebar e renderizado sem QueryClientProvider (testes).
  const [pendingSpotsState, setPendingSpotsState] = useState<{
    count: number | null;
    badgeText: string | null;
  }>({ count: null, badgeText: null });
  const handlePendingSpotsResult = React.useCallback(
    (count: number | null, badgeText: string | null) => {
      setPendingSpotsState({ count, badgeText });
    },
    []
  );
  const pendingSpotsCount = pendingSpotsState.count;
  const pendingSpotsBadgeText = pendingSpotsState.badgeText;

  // Sidebar reform 2026-05-03 (Opcao A — workflow conservador).
  // 5 grupos: VISAO / JOGAR / ESTUDAR / UTILIDADES / ADMIN.
  // URLs preservadas (zero migration). Banca sobe pra Visao.
  // Coach IA migra pra Estudar (transversal). Torneios vira Estudar (historico).
  // Import migra pra Utilidades (acao esporadica).
  const menuSections = [
    {
      slug: 'visao',
      title: 'VISAO',
      items: [
        { path: '/', icon: User, label: 'Inicio', adminOnly: false },
        { path: '/dashboard', icon: BarChart3, label: 'Dashboard', adminOnly: false },
        { path: '/bankroll', icon: Wallet, label: 'Banca', adminOnly: false },
      ]
    },
    {
      slug: 'jogar',
      title: 'JOGAR',
      items: [
        { path: '/coach', icon: Calendar, label: 'Grade', adminOnly: false },
        { path: '/mental', icon: Brain, label: 'Warm Up', adminOnly: false },
        { path: '/grind', icon: Gamepad2, label: 'Grind', adminOnly: false },
        // Sprint coach-page-reform-1 RF-07.2: aponta para aba dentro de /coach.
        { path: '/coach?tab=flights', icon: Layers, label: 'Flight', adminOnly: false },
      ]
    },
    {
      slug: 'estudar',
      title: 'ESTUDAR',
      items: [
        { path: '/estudos', icon: BookOpen, label: 'Estudos', adminOnly: false },
        { path: '/coach-ai', icon: MessageSquare, label: 'Coach IA', adminOnly: false },
        { path: '/biblioteca', icon: GraduationCap, label: 'Biblioteca', adminOnly: false },
        { path: '/library', icon: Trophy, label: 'Torneios', adminOnly: false },
      ]
    },
    {
      slug: 'utilidades',
      title: 'UTILIDADES',
      items: [
        { path: '/upload', icon: Upload, label: 'Import', adminOnly: false },
        { path: '/calculadoras', icon: Calculator, label: 'Calculadoras', adminOnly: false },
      ]
    },
    {
      slug: 'admin',
      title: 'ADMIN',
      items: [
        { path: '/analytics', icon: TrendingUp, label: 'Analytics', adminOnly: true },
        { path: '/admin/users', icon: Users, label: 'Usuarios', adminOnly: true },
        { path: '/admin/bugs', icon: Bug, label: 'Bugs', adminOnly: true },
      ]
    }
  ];

  // Filter: admin items only shown to admins
  const filteredMenuSections = menuSections.map(section => ({
    ...section,
    items: section.items.filter(item => !item.adminOnly || isAdmin)
  })).filter(section => section.items.length > 0);

  const handleLogout = async () => {
    await logout();
  };

  // Subscription status badge
  const renderSubscriptionBadge = () => {
    if (!user) return null;
    if (isSuperAdmin(user.email)) return null;

    const status = getSubscriptionStatus(user);

    if (status === 'trial') {
      const daysLeft = getTrialDaysRemaining(user.trialEndsAt);
      return (
        <Link href="/subscriptions">
          <a className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-medium hover:bg-amber-500/25 transition-colors">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            {isCollapsed ? `${daysLeft}d` : `Trial - ${daysLeft} dias`}
          </a>
        </Link>
      );
    }

    if (status === 'active') {
      return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/15 border border-green-500/30 text-green-400 text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          {isCollapsed ? '' : 'Assinante'}
        </div>
      );
    }

    // expired
    return (
      <Link href="/subscriptions">
        <a className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-medium hover:bg-red-500/25 transition-colors">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          {isCollapsed ? '!' : 'Assine agora'}
        </a>
      </Link>
    );
  };

  return (
    <div className={`
      ${isCollapsed ? 'w-16' : 'w-64'}
      h-full bg-gray-900 border-r border-gray-700 flex flex-col transition-all duration-300
    `}>
      {/* Sprint coach-page-reform-1: PendingSpotsFetcher isolado num
          ErrorBoundary — se nao ha QueryClientProvider (testes standalone),
          falha silenciosamente sem quebrar o resto do Sidebar. */}
      <PendingSpotsBoundary>
        <PendingSpotsFetcher
          enabled={!!user}
          onResult={handlePendingSpotsResult}
        />
      </PendingSpotsBoundary>
      {/* Header — Sprint home-reform-1 RF-06: <HeaderLogo> swappable. */}
      <div className="px-3 py-1 border-b border-gray-700 relative">
        {!isCollapsed && (
          <HeaderLogo
            variant="full"
            alt="Grindfy Logo"
            className="block w-full h-auto object-contain"
          />
        )}
        {isCollapsed && (
          <HeaderLogo
            variant="mark"
            alt="Grindfy Logo"
            className="block w-full h-auto object-contain"
          />
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
          className={`absolute top-2 right-2 p-1 rounded-lg bg-gray-900/70 hover:bg-gray-800 text-gray-400 hover:text-white transition-colors ${isCollapsed ? 'hidden' : ''}`}
        >
          <ChevronLeft size={18} />
        </button>
        {isCollapsed && (
          <button
            onClick={() => setIsCollapsed(false)}
            aria-label="Expandir sidebar"
            className="mt-2 w-full flex justify-center p-1 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        )}
      </div>
      {/* Navigation */}
      <nav className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-6">
          {filteredMenuSections.map((section) => (
            <div
              key={section.title}
              data-testid={`sidebar-section-${section.slug}`}
              className="space-y-2"
            >
              {/* Section Title */}
              {!isCollapsed && (
                <div className="px-3 py-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    {section.title}
                  </p>
                </div>
              )}

              {/* Section Items */}
              <ul className="space-y-1">
                {section.items.map((item) => {
                  // F7: prefix-match for sub-routes so "/biblioteca/curso/X"
                  // and "/admin/users/Y" highlight their parent nav item.
                  // Root '/' keeps strict equality plus the '/dashboard' alias.
                  const isActive =
                    location === item.path ||
                    (item.path === '/' &&
                      (location === '/' || location === '/dashboard')) ||
                    (item.path !== '/' &&
                      location.startsWith(item.path + '/'));

                  const showPendingSpotsBadge =
                    item.path === '/estudos' &&
                    pendingSpotsBadgeText !== null &&
                    pendingSpotsCount !== null &&
                    pendingSpotsCount > 0;

                  // F9: "Novo" badge ao lado de "Biblioteca" enquanto user nao
                  // visitou. Pulse nas 3 primeiras visitas. Read localStorage
                  // diretamente (defer ate render — ok porque component re-
                  // renderiza ao trocar rota).
                  const showLibraryNewBadge =
                    item.path === '/biblioteca' &&
                    (() => {
                      try {
                        return localStorage.getItem('library:visited') !== 'true';
                      } catch {
                        return false;
                      }
                    })();

                  // Sprint Flight-1 RF-10: data-testid estavel para testes
                  // (lessons-learned #2). Format: sidebar-link-<segmento>.
                  const linkTestId = `sidebar-link-${item.path.replace(/^\//, '').split('/')[0] || 'home'}`;

                  return (
                    <li key={item.path}>
                      <Link href={item.path}>
                        {/* Reviewer wave 2 MEDIUM-6 tentou remover `href`
                            redundante baseando-se em lesson #23, mas o
                            warning de validateDOMNesting + falha do teste
                            sidebar-points-coach-ai mostram que Wouter v3
                            renderiza UMA anchor adicional aqui (cloneElement
                            path nao se aplica). Mantemos `href` no inner
                            para que `.closest('a').getAttribute('href')`
                            funcione. Lesson #23 atualizada via comment. */}
                        <a
                          href={item.path}
                          data-testid={linkTestId}
                          onClick={() => {
                            // F9: marca biblioteca como visitada para esconder
                            // o badge "Novo" em proximas renderizacoes.
                            if (item.path === '/biblioteca') {
                              try {
                                localStorage.setItem('library:visited', 'true');
                              } catch {
                                // ignore
                              }
                            }
                          }}
                          className={`
                          flex items-center space-x-3 px-3 py-2 rounded-lg transition-all duration-200
                          ${isActive
                            ? 'bg-green-600/20 text-green-400 border-l-2 border-green-400'
                            : 'text-gray-300 hover:bg-green-600/10 hover:text-green-400'
                          }
                        `}>
                          <item.icon size={20} className={`flex-shrink-0 ${isActive ? 'text-green-400' : 'text-gray-400'}`} />
                          {!isCollapsed && (
                            <span className="font-medium">{item.label}</span>
                          )}
                          {showLibraryNewBadge && !isCollapsed && (
                            <span
                              data-testid="sidebar-biblioteca-new-badge"
                              className="ml-auto inline-flex items-center justify-center px-1.5 h-5 rounded-full bg-green-500/20 border border-green-500/40 text-green-300 text-[10px] font-semibold animate-pulse"
                            >
                              Novo
                            </span>
                          )}
                          {showPendingSpotsBadge && (
                            <span
                              data-testid="sidebar-pending-spots-badge"
                              className={`ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full border text-[10px] font-semibold ${tokens.color.warn.bg} ${tokens.color.warn.border} ${tokens.color.warn.text}`}
                            >
                              {pendingSpotsBadgeText}
                            </span>
                          )}
                        </a>
                      </Link>
                    </li>
                  );
                })}
              </ul>

              {/* Section Separator */}
              {!isCollapsed && (
                <div className="border-t border-gray-700 my-4"></div>
              )}
            </div>
          ))}
        </div>
      </nav>
      {/* Footer Actions */}
      <div className="p-4 border-t border-gray-700 space-y-2">
        {/* User Info */}
        {!isCollapsed && (
          <div className="pb-3 mb-2 border-b border-gray-700">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
                <User size={16} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {user?.name || user?.username || user?.firstName || user?.userPlatformId || 'Usuario'}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {user?.email}
                </p>
              </div>
            </div>
          </div>
        )}
        {/* Subscription Status Badge */}
        {renderSubscriptionBadge()}

        <Link href="/subscriptions">
          <a className={`
            flex items-center space-x-3 px-3 py-2 rounded-lg transition-all duration-200
            ${location === '/subscriptions'
              ? 'bg-green-600/20 text-green-400 border-l-2 border-green-400'
              : 'text-gray-300 hover:bg-green-600/10 hover:text-green-400'
            }
          `}>
            <CreditCard size={20} className={`flex-shrink-0 ${location === '/subscriptions' ? 'text-green-400' : 'text-gray-400'}`} />
            {!isCollapsed && (
              <span className="font-medium">Assinatura</span>
            )}
          </a>
        </Link>

        <Link href="/settings">
          <a
            data-testid="sidebar-footer-settings"
            href="/settings"
            className={`
            flex items-center space-x-3 px-3 py-2 rounded-lg transition-all duration-200
            ${location === '/settings'
              ? 'bg-green-600/20 text-green-400 border-l-2 border-green-400'
              : 'text-gray-300 hover:bg-green-600/10 hover:text-green-400'
            }
          `}>
            <Settings size={20} className={`flex-shrink-0 ${location === '/settings' ? 'text-green-400' : 'text-gray-400'}`} />
            {!isCollapsed && (
              <span className="font-medium">Configuracoes</span>
            )}
          </a>
        </Link>

        {/* Ajuda — submenu colapsavel agrupando Bug + Sugestao */}
        <div className="space-y-1">
          <button
            data-testid="sidebar-footer-help-toggle"
            onClick={() => setHelpOpen((v) => !v)}
            aria-expanded={helpOpen}
            className={`
              flex items-center space-x-3 px-3 py-2 rounded-lg transition-all duration-200
              text-gray-300 hover:bg-green-600/10 hover:text-green-400 w-full
            `}
          >
            <HelpCircle size={20} className="flex-shrink-0 text-gray-400" />
            {!isCollapsed && (
              <>
                <span className="font-medium">Ajuda</span>
                <span className="ml-auto text-gray-400">
                  {helpOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </span>
              </>
            )}
          </button>

          {helpOpen && (
            <div data-testid="sidebar-footer-help-menu" className="space-y-1 pl-2">
              <BugReportModal
                currentPage={location}
                trigger={
                  <button className={`
                    flex items-center space-x-3 px-3 py-2 rounded-lg transition-all duration-200
                    text-gray-300 hover:bg-red-600/20 hover:text-red-400 w-full
                  `}>
                    <Bug size={18} className="flex-shrink-0" />
                    {!isCollapsed && (
                      <span className="text-sm">Reportar Bug</span>
                    )}
                  </button>
                }
              />

              <ImprovementSuggestionModal
                currentPage={location}
                trigger={
                  <button className={`
                    flex items-center space-x-3 px-3 py-2 rounded-lg transition-all duration-200
                    text-gray-300 hover:bg-green-600/20 hover:text-green-400 w-full
                  `}>
                    <Lightbulb size={18} className="flex-shrink-0" />
                    {!isCollapsed && (
                      <span className="text-sm">Sugerir Melhoria</span>
                    )}
                  </button>
                }
              />
            </div>
          )}
        </div>

        <button
          data-testid="sidebar-footer-logout"
          onClick={handleLogout}
          className={`
            flex items-center space-x-3 px-3 py-2 rounded-lg transition-all duration-200
            text-gray-300 hover:bg-red-600/20 hover:text-red-400 w-full
          `}
        >
          <LogOut size={20} className="flex-shrink-0" />
          {!isCollapsed && (
            <span className="font-medium">Sair</span>
          )}
        </button>
      </div>
    </div>
  );
};

export default Sidebar;

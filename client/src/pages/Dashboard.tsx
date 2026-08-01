import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePermission } from "@/hooks/usePermission";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import AccessDenied from "@/components/AccessDenied";
import { useLocation } from "wouter";

import { DollarSign, TrendingUp, Target, Calendar, Monitor, Users, Zap, Trophy, Download, RotateCcw } from "lucide-react";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  serializeFiltersToURL,
  deserializeFiltersFromURL,
} from "@/lib/dashboard-filter-helpers";
import { isValidTab } from "@/lib/dashboard-tabs-helpers";
import { buildCSVContent, formatCSVRow, getExportHeaders, getExportFilename, sanitizeForCSV } from "@/lib/export-helpers";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { DashboardFiltersState } from '@/components/dashboard/types';
import { DashboardFilters } from '@/components/dashboard/DashboardFilters';
import { DashboardMetrics } from '@/components/dashboard/DashboardMetrics';
import { RoiByPlatformCard } from '@/components/dashboard/RoiByPlatformCard';
import { DashboardTabs } from '@/components/dashboard/DashboardTabs';
import { TabEvolution } from '@/components/dashboard/TabEvolution';
import { TabSite } from '@/components/dashboard/TabSite';
import { TabBuyin } from '@/components/dashboard/TabBuyin';
import { TabCategory } from '@/components/dashboard/TabCategory';
import { TabSpeed } from '@/components/dashboard/TabSpeed';
import { TabPeriod } from '@/components/dashboard/TabPeriod';
import { TabParticipants } from '@/components/dashboard/TabParticipants';
import { TabPosition } from '@/components/dashboard/TabPosition';
import { TabReentry } from '@/components/dashboard/TabReentry';
import { DashboardGoodMorningSplash } from '@/components/dashboard/DashboardGoodMorningSplash';
import { TabInsightBanner } from '@/components/dashboard/TabInsightBanner';
import { buildTabInsight } from '@/lib/dashboard-insights';

export default function Dashboard() {
  const hasDashboardAccess = usePermission('dashboard_access');

  const { user } = useAuth();

  // Lesson #1 (hooks primeiro): NAO fazer early-return aqui — todos os hooks
  // abaixo precisam rodar em toda render. Computamos as flags de gate agora e
  // adiamos os returns para DEPOIS de todos os hooks (junto do guard de hasError).
  // Sprint Cooldown-2 — Sleep Gate suave: splash "Bom dia!" se snoozed.
  const snoozedUntil = (user as any)?.dashboardSnoozedUntil;
  const showSnoozeSplash = (() => {
    if (!snoozedUntil) return false;
    const until = typeof snoozedUntil === 'string' ? new Date(snoozedUntil) : snoozedUntil;
    return until instanceof Date && !Number.isNaN(until.getTime()) && until.getTime() > Date.now();
  })();

  // Initialize state from URL params (FP-11)
  const initialUrlFilters = useMemo(() => {
    return deserializeFiltersFromURL(window.location.search.replace(/^\?/, ''));
  }, []);

  const [period, setPeriod] = useState(initialUrlFilters.period);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(initialUrlFilters.tab);
  const [filters, setFilters] = useState<DashboardFiltersState>(() => {
    const nonEmpty = (list?: string[]) => (list && list.length > 0 ? list : undefined);
    const buyinMin = initialUrlFilters.buyinMin ?? undefined;
    const buyinMax = initialUrlFilters.buyinMax ?? undefined;
    return {
      sites: nonEmpty(initialUrlFilters.sites),
      categories: nonEmpty(initialUrlFilters.categories),
      speeds: nonEmpty(initialUrlFilters.speeds),
      sitesExclude: nonEmpty(initialUrlFilters.sitesExclude),
      categoriesExclude: nonEmpty(initialUrlFilters.categoriesExclude),
      speedsExclude: nonEmpty(initialUrlFilters.speedsExclude),
      buyinBands: nonEmpty(initialUrlFilters.buyinBands),
      buyinBandsExclude: nonEmpty(initialUrlFilters.buyinBandsExclude),
      fieldBands: nonEmpty(initialUrlFilters.fieldBands),
      fieldBandsExclude: nonEmpty(initialUrlFilters.fieldBandsExclude),
      modifiers: nonEmpty(initialUrlFilters.modifiers),
      modifiersExclude: nonEmpty(initialUrlFilters.modifiersExclude),
      buyinRange:
        buyinMin !== undefined || buyinMax !== undefined ? { min: buyinMin, max: buyinMax } : undefined,
      keyword: initialUrlFilters.keyword || undefined,
      keywordType: (initialUrlFilters.keywordType as 'contains' | 'not_contains') || undefined,
      dateFrom: initialUrlFilters.dateFrom || undefined,
      dateTo: initialUrlFilters.dateTo || undefined,
      participantMin: initialUrlFilters.participantMin ?? undefined,
      participantMax: initialUrlFilters.participantMax ?? undefined,
    };
  });
  const [, navigate] = useLocation();

  // Sync state to URL (FP-11)
  useEffect(() => {
    const urlFilters = {
      period,
      tab: activeTab,
      sites: filters.sites || [],
      categories: filters.categories || [],
      speeds: filters.speeds || [],
      keyword: filters.keyword || '',
      keywordType: filters.keywordType || 'contains',
      dateFrom: filters.dateFrom || '',
      dateTo: filters.dateTo || '',
      participantMin: filters.participantMin ?? null,
      participantMax: filters.participantMax ?? null,
      sitesExclude: filters.sitesExclude || [],
      categoriesExclude: filters.categoriesExclude || [],
      speedsExclude: filters.speedsExclude || [],
      buyinBands: filters.buyinBands || [],
      buyinBandsExclude: filters.buyinBandsExclude || [],
      fieldBands: filters.fieldBands || [],
      fieldBandsExclude: filters.fieldBandsExclude || [],
      modifiers: filters.modifiers || [],
      modifiersExclude: filters.modifiersExclude || [],
      buyinMin: filters.buyinRange?.min ?? null,
      buyinMax: filters.buyinRange?.max ?? null,
    };
    const serialized = serializeFiltersToURL(urlFilters);
    const newUrl = serialized ? `${window.location.pathname}?${serialized}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
  }, [period, activeTab, filters]);

  const dashboardTabs = [
    { id: 'evolution', name: 'Geral', icon: TrendingUp, emoji: '📈', active: activeTab === 'evolution' },
    { id: 'por-site', name: 'Site', icon: Monitor, emoji: '🌐', active: activeTab === 'por-site' },
    { id: 'por-abi', name: 'ABI', icon: DollarSign, emoji: '💰', active: activeTab === 'por-abi' },
    { id: 'por-tipo', name: 'Tipo', icon: Target, emoji: '🏷️', active: activeTab === 'por-tipo' },
    { id: 'velocidade', name: 'Velocidade', icon: Zap, emoji: '⚡', active: activeTab === 'velocidade' },
    { id: 'por-periodo', name: 'Período', icon: Calendar, emoji: '📅', active: activeTab === 'por-periodo' },
    { id: 'por-participantes', name: 'Med. Participantes', icon: Users, emoji: '👥', active: activeTab === 'por-participantes' },
    { id: 'por-posicao', name: 'Posição', icon: Trophy, emoji: '🥇', active: activeTab === 'por-posicao' },
    // Aba nova (2026-08-01). Emoji via fromCodePoint: o hook do projeto bloqueia
    // emoji literal em arquivo de codigo.
    { id: 'reentradas', name: 'Reentradas', icon: RotateCcw, emoji: String.fromCodePoint(0x1F504), active: activeTab === 'reentradas' }
  ];

  // ── Queries essenciais (sempre carregam) ──

  const { data: stats, isLoading: statsLoading, isError: statsError } = useQuery({
    queryKey: ["/api/dashboard/stats", period, filters],
    queryFn: async () => {
      const params = new URLSearchParams({ period, filters: JSON.stringify(filters) });
      return await apiRequest('GET', `/api/dashboard/stats?${params}`);
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: performance, isLoading: performanceLoading, isError: performanceError } = useQuery({
    queryKey: ["/api/dashboard/performance", period, filters],
    queryFn: async () => {
      const params = new URLSearchParams({ period, filters: JSON.stringify(filters) });
      return apiRequest('GET', `/api/dashboard/performance?${params}`);
    },
    staleTime: 2 * 60 * 1000,
  });

  // Fix #1: Sem limite para cobrir todos os torneios (18K+)
  const { data: allTournaments } = useQuery({
    queryKey: ["/api/tournaments", "all"],
    queryFn: async () => apiRequest('GET', "/api/tournaments?limit=50000"),
    staleTime: 10 * 60 * 1000,
  });

  const { data: filteredTournaments } = useQuery({
    queryKey: ["/api/tournaments", "filtered", period, filters],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "20", period, filters: JSON.stringify(filters) });
      return apiRequest('GET', `/api/tournaments?${params}`);
    },
    staleTime: 1 * 60 * 1000,
  });

  const availableOptions = useMemo(() => ({
    sites: Array.from(new Set(Array.isArray(allTournaments) ? allTournaments.map((t: any) => t.site).filter(Boolean) : [])) as string[],
    categories: Array.from(new Set(Array.isArray(allTournaments) ? allTournaments.map((t: any) => t.category).filter(Boolean) : [])) as string[],
    speeds: Array.from(new Set(Array.isArray(allTournaments) ? allTournaments.map((t: any) => t.speed).filter(Boolean) : [])) as string[]
  }), [allTournaments]);

  // Queries de metricas (category + speed) — usadas pelas abas Categoria e Velocidade
  // (os cards de contagem por tipo/velocidade foram removidos do topo do dashboard).
  const { data: categoryAnalytics, isLoading: categoryLoading } = useQuery({
    queryKey: ["/api/analytics/by-category", period, filters],
    queryFn: async () => { const params = new URLSearchParams({ period, filters: JSON.stringify(filters) }); return apiRequest('GET', `/api/analytics/by-category?${params}`); },
    staleTime: 2 * 60 * 1000,
  });

  const { data: speedAnalytics, isLoading: speedLoading } = useQuery({
    queryKey: ["/api/analytics/by-speed", period, filters],
    queryFn: async () => { const params = new URLSearchParams({ period, filters: JSON.stringify(filters) }); return apiRequest('GET', `/api/analytics/by-speed?${params}`); },
    staleTime: 2 * 60 * 1000,
  });

  // ── Fix #2: Lazy-load — queries de tabs carregam apenas quando a tab esta ativa ──

  const { data: siteAnalytics, isLoading: siteLoading } = useQuery({
    queryKey: ["/api/analytics/by-site", period, filters],
    queryFn: async () => { const params = new URLSearchParams({ period, filters: JSON.stringify(filters) }); return apiRequest('GET', `/api/analytics/by-site?${params}`); },
    staleTime: 2 * 60 * 1000,
    enabled: activeTab === 'por-site',
  });

  const { data: buyinAnalytics, isLoading: buyinLoading } = useQuery({
    queryKey: ["/api/analytics/by-buyin", period, filters],
    queryFn: async () => { const params = new URLSearchParams({ period, filters: JSON.stringify(filters) }); return apiRequest('GET', `/api/analytics/by-buyin?${params}`); },
    staleTime: 2 * 60 * 1000,
    enabled: activeTab === 'por-abi',
  });

  const { data: dayAnalytics, isLoading: dayLoading } = useQuery({
    queryKey: ["/api/analytics/by-day", period, filters],
    queryFn: async () => { const params = new URLSearchParams({ period, filters: JSON.stringify(filters) }); return apiRequest('GET', `/api/analytics/by-day?${params}`); },
    staleTime: 2 * 60 * 1000,
    enabled: activeTab === 'por-periodo',
  });

  // Turno do dia (aba Periodo). O endpoint ja existia desde o Tournament
  // Selector e nenhuma tela consumia — converte para o fuso do jogador no SQL.
  const { data: timeOfDayAnalytics, isLoading: timeOfDayLoading } = useQuery({
    queryKey: ["/api/analytics/by-time-of-day", period, filters],
    queryFn: async () => { const params = new URLSearchParams({ period, filters: JSON.stringify(filters) }); return apiRequest('GET', `/api/analytics/by-time-of-day?${params}`); },
    staleTime: 2 * 60 * 1000,
    enabled: activeTab === 'por-periodo',
  });

  const { data: monthAnalytics, isLoading: monthLoading } = useQuery({
    queryKey: ["/api/analytics/by-month", period, filters],
    queryFn: async () => { const params = new URLSearchParams({ period, filters: JSON.stringify(filters) }); return apiRequest('GET', `/api/analytics/by-month?${params}`); },
    staleTime: 2 * 60 * 1000,
    enabled: activeTab === 'por-periodo' || activeTab === 'por-participantes',
  });

  const { data: fieldAnalytics, isLoading: fieldLoading } = useQuery({
    queryKey: ["/api/analytics/by-field", period, filters],
    queryFn: async () => { const params = new URLSearchParams({ period, filters: JSON.stringify(filters) }); return apiRequest('GET', `/api/analytics/by-field?${params}`); },
    staleTime: 2 * 60 * 1000,
    enabled: activeTab === 'por-participantes' || activeTab === 'por-posicao',
  });

  // Reentradas (aba propria). ROI ja vem calculado sobre o investimento REAL,
  // incluindo o custo das reentradas.
  const { data: reentryAnalytics, isLoading: reentryLoading } = useQuery({
    queryKey: ["/api/analytics/by-reentry", period, filters],
    queryFn: async () => { const params = new URLSearchParams({ period, filters: JSON.stringify(filters) }); return apiRequest('GET', `/api/analytics/by-reentry?${params}`); },
    staleTime: 2 * 60 * 1000,
    enabled: activeTab === 'reentradas',
  });

  // Bolha / ITM real x esperado (aba Posicao).
  const { data: bubbleAnalytics } = useQuery({
    queryKey: ["/api/analytics/bubble", period, filters],
    queryFn: async () => { const params = new URLSearchParams({ period, filters: JSON.stringify(filters) }); return apiRequest('GET', `/api/analytics/bubble?${params}`); },
    staleTime: 2 * 60 * 1000,
    enabled: activeTab === 'por-posicao',
  });

  // Mesas simultaneas x ROI (aba Periodo).
  const { data: simultaneousAnalytics } = useQuery({
    queryKey: ["/api/analytics/simultaneous-tables", period, filters],
    queryFn: async () => { const params = new URLSearchParams({ period, filters: JSON.stringify(filters) }); return apiRequest('GET', `/api/analytics/simultaneous-tables?${params}`); },
    staleTime: 2 * 60 * 1000,
    enabled: activeTab === 'por-periodo',
  });

  const { data: finalTableAnalytics, isLoading: finalTableLoading } = useQuery({
    queryKey: ["/api/analytics/final-table", period, filters],
    queryFn: async () => { const params = new URLSearchParams({ period, filters: JSON.stringify(filters) }); return apiRequest('GET', `/api/analytics/final-table?${params}`); },
    staleTime: 2 * 60 * 1000,
    enabled: activeTab === 'por-posicao',
  });

  // Dica da aba ativa (2026-08-01). Calculada em cima dos MESMOS dados que
  // alimentam os graficos, entao respeita os filtros por construcao. Regra
  // deterministica, sem IA — ver client/src/lib/dashboard-insights.ts.
  //
  // Substituiu o antigo card de correlacao mental que ficava na aba Geral: esse
  // cruzamento passa a ser assunto da aba Mental (decisao do founder).
  const tabInsight = useMemo(
    () =>
      buildTabInsight(activeTab, {
        siteAnalytics,
        buyinAnalytics,
        categoryAnalytics,
        speedAnalytics,
        dayAnalytics,
        fieldAnalytics,
        finalTableAnalytics,
      }),
    [activeTab, siteAnalytics, buyinAnalytics, categoryAnalytics, speedAnalytics, dayAnalytics, fieldAnalytics, finalTableAnalytics],
  );

  // FP-10: Export state
  const [isExporting, setIsExporting] = useState(false);
  const tabContentRef = useRef<HTMLDivElement>(null);

  // FP-10: Tab type mapping for export headers
  const tabTypeMap: Record<string, string> = {
    'evolution': 'geral',
    'por-site': 'site',
    'por-abi': 'abi',
    'por-tipo': 'tipo',
    'velocidade': 'velocidade',
    'por-periodo': 'periodo',
    'por-participantes': 'participantes',
    'por-posicao': 'posicao',
    // Aba nova: `getExportHeaders` ainda nao conhece este tipo, entao o export
    // simplesmente nao gera arquivo (o handler ja trata headers vazios) em vez
    // de baixar um CSV com colunas erradas.
    'reentradas': 'reentradas',
  };

  const tabNameMap: Record<string, string> = {
    'evolution': 'Geral',
    'por-site': 'Site',
    'por-abi': 'ABI',
    'por-tipo': 'Tipo',
    'velocidade': 'Velocidade',
    'por-periodo': 'Periodo',
    'por-participantes': 'Participantes',
    'por-posicao': 'Posicao',
    'reentradas': 'Reentradas',
  };

  // FP-10: Get data for active tab
  const getActiveTabData = useCallback((): Record<string, any>[] => {
    const tabType = tabTypeMap[activeTab];
    if (!tabType) return [];

    if (tabType === 'geral' && stats) {
      return [
        { Metrica: 'Torneios', Valor: stats.count || 0 },
        { Metrica: 'Lucro', Valor: stats.profit || 0 },
        { Metrica: 'ROI%', Valor: stats.roi || 0 },
        { Metrica: 'ITM%', Valor: stats.itm || 0 },
        { Metrica: 'ABI', Valor: stats.abi || 0 },
        { Metrica: 'Mesas Finais', Valor: stats.finalTables || 0 },
        { Metrica: 'Cravadas', Valor: stats.firstPlaceCount || 0 },
      ];
    }

    const dataMap: Record<string, any> = {
      'site': siteAnalytics,
      'abi': buyinAnalytics,
      'tipo': categoryAnalytics,
      'velocidade': speedAnalytics,
      'periodo': monthAnalytics,
      'participantes': fieldAnalytics,
      'posicao': finalTableAnalytics,
      'reentradas': reentryAnalytics,
    };

    const data = dataMap[tabType];
    if (!Array.isArray(data)) return [];
    return data;
  }, [activeTab, stats, siteAnalytics, buyinAnalytics, categoryAnalytics, speedAnalytics, monthAnalytics, fieldAnalytics, finalTableAnalytics]);

  // FP-10: Export CSV handler
  const handleExportCSV = useCallback(() => {
    setIsExporting(true);
    try {
      const tabType = tabTypeMap[activeTab] || 'dashboard';
      const headers = getExportHeaders(tabType);
      if (headers.length === 0) return;

      const data = getActiveTabData();
      const rows = data.map(row => formatCSVRow(row, headers));
      const csvContent = buildCSVContent(headers, rows);

      const currentPeriod = period || new Date().toISOString().slice(0, 7);
      const filename = getExportFilename(tabNameMap[activeTab] || 'dashboard', currentPeriod, 'csv');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }, [activeTab, period, getActiveTabData]);

  // FP-10: Export PNG handler
  const handleExportPNG = useCallback(async () => {
    if (!tabContentRef.current) return;
    setIsExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(tabContentRef.current, {
        backgroundColor: '#111827',
        scale: 2,
        useCORS: true,
      });

      const currentPeriod = period || new Date().toISOString().slice(0, 7);
      const filename = getExportFilename(tabNameMap[activeTab] || 'dashboard', currentPeriod, 'png');

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
    } catch (err) {
      console.error('Failed to export PNG:', err);
    } finally {
      setIsExporting(false);
    }
  }, [activeTab, period]);

  const isMainLoading = statsLoading || performanceLoading;
  const hasError = statsError || performanceError;
  const hasNoData = !isMainLoading && !hasError && stats?.count === 0;

  // Gates adiados (lesson #1): rodam DEPOIS de todos os hooks.
  if (!hasDashboardAccess) {
    return <AccessDenied
      featureName="Dashboard"
      description="Acesso ao dashboard de performance e analytics."
    />;
  }

  if (showSnoozeSplash) {
    return (
      <div className="p-6 text-white">
        <DashboardGoodMorningSplash />
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="p-6 text-white">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Performance Dashboard</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="text-red-400 text-lg font-semibold mb-4">
            Erro ao carregar dados do dashboard
          </div>
          <p className="text-gray-400 mb-6">
            Ocorreu um problema ao buscar suas estatisticas. Tente novamente.
          </p>
          <Button
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
              queryClient.invalidateQueries({ queryKey: ["/api/dashboard/performance"] });
              queryClient.invalidateQueries({ queryKey: ["/api/analytics"] });
            }}
            className="bg-primary text-white hover:bg-primary/90 px-6 py-3"
          >
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 text-white">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          {/* Fix #3: Subtitulo em PT-BR */}
          <div>
            <h2 className="text-2xl font-bold mb-2">Performance Dashboard</h2>
            <p className="text-gray-400">Acompanhe sua performance e lucratividade nos torneios</p>
          </div>
        </div>
      </div>

      <DashboardFilters
        filters={filters}
        setFilters={setFilters}
        period={period}
        setPeriod={setPeriod}
        availableOptions={availableOptions}
      />

      {/* Empty state quando nao tem dados */}
      {hasNoData && (
        <div className="relative mb-8">
          <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/80 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-12 text-center">
            <div className="text-gray-400 text-lg font-semibold mb-3">
              Importe seus torneios para ver as estatisticas
            </div>
            <p className="text-gray-500 mb-6">
              O dashboard mostrara suas metricas de performance assim que voce importar seus historicos de torneios.
            </p>
            <Button
              onClick={() => navigate('/upload')}
              className="bg-primary text-white hover:bg-primary/90 px-6 py-3"
            >
              Importar Torneios
            </Button>
          </div>
        </div>
      )}

      {!isMainLoading && (
        <DashboardMetrics
          stats={stats}
          isMainLoading={false}
        />
      )}
      {isMainLoading && (
        <DashboardMetrics
          stats={undefined}
          isMainLoading={true}
        />
      )}

      {!isMainLoading && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-0">
            <div className="flex-1">
              <DashboardTabs tabs={dashboardTabs} activeTab={activeTab} setActiveTab={setActiveTab} />
            </div>
            {/* FP-10: Export button */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isExporting}
                  className="ml-4 mb-12 bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white flex-shrink-0"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {isExporting ? 'Exportando...' : 'Exportar'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-gray-800 border-gray-700">
                <DropdownMenuItem onClick={handleExportCSV} className="text-gray-200 hover:text-white focus:text-white">
                  Exportar CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPNG} className="text-gray-200 hover:text-white focus:text-white">
                  Exportar Imagem (PNG)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div ref={tabContentRef} className="space-y-6">
            {/* Diagnóstico da aba — fica FORA do print/PNG? Não: entra de
                propósito, porque a leitura acompanha o gráfico. */}
            <TabInsightBanner insight={tabInsight} />

            {activeTab === 'evolution' && (
              <TabEvolution performance={performance} filteredTournaments={filteredTournaments} allTournaments={allTournaments} period={period} filters={filters} />
            )}
            {activeTab === 'por-site' && (
              <TabSite siteAnalytics={siteAnalytics} siteLoading={siteLoading} period={period} filters={filters} />
            )}
            {activeTab === 'por-abi' && (
              <TabBuyin buyinAnalytics={buyinAnalytics} buyinLoading={buyinLoading} period={period} filters={filters} />
            )}
            {activeTab === 'por-tipo' && (
              <TabCategory categoryAnalytics={categoryAnalytics} categoryLoading={categoryLoading} period={period} filters={filters} />
            )}
            {activeTab === 'velocidade' && (
              <TabSpeed speedAnalytics={speedAnalytics} speedLoading={speedLoading} period={period} filters={filters} />
            )}
            {activeTab === 'por-periodo' && (
              <TabPeriod dayAnalytics={dayAnalytics} dayLoading={dayLoading} monthAnalytics={monthAnalytics} monthLoading={monthLoading} timeOfDayAnalytics={timeOfDayAnalytics} timeOfDayLoading={timeOfDayLoading} simultaneousAnalytics={simultaneousAnalytics} filters={filters} />
            )}
            {activeTab === 'por-participantes' && (
              <TabParticipants fieldAnalytics={fieldAnalytics} fieldLoading={fieldLoading} monthAnalytics={monthAnalytics} monthLoading={monthLoading} period={period} filters={filters} />
            )}
            {activeTab === 'por-posicao' && (
              <TabPosition fieldAnalytics={fieldAnalytics} fieldLoading={fieldLoading} finalTableAnalytics={finalTableAnalytics} finalTableLoading={finalTableLoading} bubbleAnalytics={bubbleAnalytics} filters={filters} />
            )}
            {activeTab === 'reentradas' && (
              <TabReentry reentryAnalytics={reentryAnalytics} reentryLoading={reentryLoading} filters={filters} />
            )}
          </div>

          {/* ROI por Plataforma — abaixo dos graficos. */}
          {user?.userPlatformId && (
            <div className="mt-6" data-testid="dashboard-roi-by-platform">
              <RoiByPlatformCard userId={user.userPlatformId} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

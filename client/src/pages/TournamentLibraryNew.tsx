import { useState, useMemo, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Trophy, Eye, AlertCircle, RefreshCw, XCircle, Filter, ChevronUp, ChevronDown, Download, ArrowUpDown } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChipGroup, type FilterChipGroupChip } from "@/components/ui/FilterChip";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { getConfidenceTooltip, getVolatilityTooltip } from "@/components/tournament-library/tooltip-helpers";
import { hasActiveFilters } from "@/components/tournament-library/filter-helpers";
import { getLibrarySiteColor, getLibraryCategoryColor, getLibrarySpeedColor } from "@/lib/poker-colors";
import { formatPercentage } from "@/lib/formatting";
import { buildCSVContent, formatCSVRow, getExportFilename } from "@/lib/export-helpers";
import { tokens } from "@/lib/ui-tokens";
import { GRADE_COLORS, GRADE_ORDER } from "@shared/library-grades";
import { OverviewPanel } from "@/components/library/OverviewPanel";
import { SavedHighlightsStrip } from "@/components/library/SavedHighlightsStrip";

// Tipo para os filtros (definindo aqui para remover dependência externa)
type TournamentLibraryFiltersType = {
  period: string;
  sites: string[];
  categories: string[];
  speeds: string[];
  buyinRange: {
    min: number | null;
    max: number | null;
  };
  roiFilter: string;
  profitFilter: string;
  volumeFilter: string;
  minimumVolume: number | null;
};

interface TournamentGroup {
  id: string;
  groupName: string;
  site: string;
  category: string;
  speed: string;
  format: string;
  volume: number;
  totalProfit: number;
  avgProfit: number;
  roi: number;
  avgBuyin: number;
  finalTables: number;
  finalTableRate: number;
  bigHits: number;
  bigHitRate: number;
  itm: number;
  itmRate: number;
  avgFieldSize: number;
  totalReentries: number;
  bestResult: number;
  worstResult: number;
  confidenceGrade: string;
  sdBuyins: number;
  volatilityLevel: string;
  roiLower: number;
  roiUpper: number;
  normalizedPosition: number | null;
  roiWithoutOutliers: number | null;
  outlierDependent: boolean;
  tournaments: any[];
  // Sprint library-evolution Fase 1: agrupamento 2 niveis.
  isFamily?: boolean;
  parentFamilyKey?: string;
  buyInTier?: string;
  lowConfidence?: boolean;
  specifics?: TournamentGroup[];
  // Fase 4: $/hora-mesa + deepstack
  profitPerTableHour?: number | null;
  durationCoverage?: number;
  deepStackRate?: number;
}

interface LibraryInsight {
  kind: 'highlight' | 'leak';
  dimension: string;
  bucketLabel: string;
  roi: number;
  baselineRoi: number;
  delta: number;
  sample: number;
  confidence: 'high' | 'medium' | 'low';
  reason: 'roi' | 'low_variance';
  message: string;
}

// Grades centralizadas em shared/library-grades.ts (SSoT server+client).
const confidenceGradeOrder = GRADE_ORDER as Record<string, number>;
const confidenceGradeColors = GRADE_COLORS as Record<string, string>;

// --- Pure helper functions ---

const getSortValue = (group: TournamentGroup, sortField: string) => {
  switch (sortField) {
    case "confidence": return (confidenceGradeOrder[group.confidenceGrade] || 0) * 10000 + group.roi;
    case "avgProfit": return group.avgProfit;
    case "roi": return group.roi;
    case "volume": return group.volume;
    case "totalProfit": return group.totalProfit;
    case "finalTableRate": return group.finalTableRate;
    case "itmRate": return group.itmRate;
    case "sdBuyins": return group.sdBuyins;
    case "normalizedPosition": return group.normalizedPosition ?? 1;
    default: return 0;
  }
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'USD'
  }).format(value);
};

// formatPercentage imported from @/lib/formatting
// Color functions imported from @/lib/poker-colors
const getSiteColor = getLibrarySiteColor;
const getCategoryColor = getLibraryCategoryColor;
const getSpeedColor = getLibrarySpeedColor;

// RF-05 + RF-06 (UI-T1-Library): conteudo do modal de detalhe extraido para
// componente proprio. Permite useState isolado para sort + export sem hooks
// dentro de .map() do parent.
type ModalSortColumn =
  | 'date'
  | 'site'
  | 'name'
  | 'category'
  | 'speed'
  | 'buyIn'
  | 'position'
  | 'profit';
type SortOrder = 'asc' | 'desc';

interface GroupDetailDialogContentProps {
  group: TournamentGroup;
}

function GroupDetailDialogContent({ group }: GroupDetailDialogContentProps) {
  const [modalSortColumn, setModalSortColumn] = useState<ModalSortColumn>('date');
  const [modalSortOrder, setModalSortOrder] = useState<SortOrder>('desc');

  const sortedTournaments = useMemo(() => {
    const list = [...group.tournaments];
    list.sort((a: any, b: any) => {
      let aVal: number | string;
      let bVal: number | string;
      switch (modalSortColumn) {
        case 'date':
          aVal = new Date(a.datePlayed).getTime();
          bVal = new Date(b.datePlayed).getTime();
          break;
        case 'site':
          aVal = String(a.site ?? '');
          bVal = String(b.site ?? '');
          break;
        case 'name':
          aVal = String(a.name ?? '');
          bVal = String(b.name ?? '');
          break;
        case 'category':
          aVal = String(a.category ?? '');
          bVal = String(b.category ?? '');
          break;
        case 'speed':
          aVal = String(a.speed ?? '');
          bVal = String(b.speed ?? '');
          break;
        case 'buyIn':
          aVal = parseFloat(String(a.buyIn ?? 0));
          bVal = parseFloat(String(b.buyIn ?? 0));
          break;
        case 'position':
          aVal = a.position ?? 9999;
          bVal = b.position ?? 9999;
          break;
        case 'profit':
          aVal = parseFloat(String(a.prize ?? 0));
          bVal = parseFloat(String(b.prize ?? 0));
          break;
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return modalSortOrder === 'desc' ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
      }
      return modalSortOrder === 'desc' ? Number(bVal) - Number(aVal) : Number(aVal) - Number(bVal);
    });
    return list;
  }, [group.tournaments, modalSortColumn, modalSortOrder]);

  const toggleSort = (col: ModalSortColumn) => {
    if (modalSortColumn === col) {
      setModalSortOrder((p) => (p === 'desc' ? 'asc' : 'desc'));
    } else {
      setModalSortColumn(col);
      setModalSortOrder('desc');
    }
  };

  const handleExportCSV = useCallback(() => {
    const headers = ['Data', 'Site', 'Nome', 'Tipo', 'Velocidade', 'Buy-in', 'Posicao', 'Total', 'Profit'];
    const rows = sortedTournaments.map((t: any) =>
      formatCSVRow(
        {
          Data: new Date(t.datePlayed).toLocaleDateString('pt-BR'),
          Site: t.site ?? '',
          Nome: t.name ?? '',
          Tipo: t.category ?? '',
          Velocidade: t.speed ?? '',
          'Buy-in': parseFloat(String(t.buyIn ?? 0)).toFixed(2),
          Posicao: t.position ?? '',
          Total: t.fieldSize ?? '',
          Profit: parseFloat(String(t.prize ?? 0)).toFixed(2),
        },
        headers,
      ),
    );
    const csv = buildCSVContent(headers, rows);
    const periodSlug = new Date().toISOString().slice(0, 7);
    const safeName = (group.groupName || 'grupo').replace(/[^\w-]/g, '-').slice(0, 60);
    const filename = getExportFilename(`library-${safeName}`, periodSlug, 'csv');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [sortedTournaments, group.groupName]);

  const SortableHead = ({ col, label }: { col: ModalSortColumn; label: string }) => {
    const active = modalSortColumn === col;
    return (
      <TableHead
        onClick={() => toggleSort(col)}
        data-sort-active={active ? modalSortOrder : undefined}
        className="text-gray-400 cursor-pointer hover:text-white select-none"
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {active ? (
            modalSortOrder === 'desc' ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronUp className="h-3 w-3" />
            )
          ) : (
            <ArrowUpDown className="h-3 w-3 opacity-40" />
          )}
        </span>
      </TableHead>
    );
  };

  return (
    <>
      <DialogHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-white text-xl truncate">
              {group.groupName}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Lista detalhada de todos os torneios desta categoria
            </DialogDescription>
          </div>
          {/* RF-05 (L7): Exportar CSV no header do modal */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            data-testid="library-modal-export-csv"
            className="shrink-0 border-gray-600 text-gray-200 hover:bg-gray-700"
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        </div>
        <div className="flex gap-2 mt-2">
          <Badge className={`text-xs font-medium ${getSiteColor(group.site)}`}>
            {group.site}
          </Badge>
          <Badge className={`text-xs font-medium ${getCategoryColor(group.category)}`}>
            {group.category}
          </Badge>
          <Badge className={`text-xs font-medium ${getSpeedColor(group.speed)}`}>
            {group.speed}
          </Badge>
        </div>
      </DialogHeader>

      {/* Summary Stats - Linha 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <div className="text-poker-accent font-bold text-lg">{group.volume}</div>
          <div className="text-xs text-gray-400">Torneios</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <div
            className={`font-bold text-lg ${group.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}
          >
            {formatCurrency(group.totalProfit)}
          </div>
          <div className="text-xs text-gray-400">Lucro Total</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <div className={`font-bold text-lg ${group.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatPercentage(group.roi)}
          </div>
          <div className="text-xs text-gray-400">
            ROI (IC: {formatPercentage(group.roiLower)} a {formatPercentage(group.roiUpper)})
          </div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          {/* RF-07 (L9): tooltip confidence consistente com card */}
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <div
                className={`font-bold text-lg ${confidenceGradeColors[group.confidenceGrade]} text-white px-2 py-0.5 rounded inline-block cursor-help`}
              >
                {group.confidenceGrade}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              {getConfidenceTooltip(group.confidenceGrade)}
            </TooltipContent>
          </Tooltip>
          <div className="text-xs text-gray-400 mt-1">Confiabilidade</div>
        </div>
      </div>
      {/* Summary Stats - Linha 2 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <div className="text-white font-bold">{formatPercentage(group.itmRate)}</div>
          <div className="text-xs text-gray-400">ITM%</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <div
            className={`font-bold ${group.volatilityLevel === 'low' ? 'text-emerald-400' : group.volatilityLevel === 'medium' ? 'text-yellow-400' : 'text-red-400'}`}
          >
            {group.sdBuyins.toFixed(1)} BI
          </div>
          <div className="text-xs text-gray-400">Volatilidade</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <div
            className={`font-bold ${group.normalizedPosition !== null && group.normalizedPosition < 0.5 ? 'text-emerald-400' : 'text-red-400'}`}
          >
            {group.normalizedPosition !== null ? `${(group.normalizedPosition * 100).toFixed(1)}%` : '—'}
          </div>
          <div className="text-xs text-gray-400">Pos. Normalizada</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <div className="text-emerald-400 font-bold">{formatCurrency(group.bestResult)}</div>
          <div className="text-xs text-gray-400">Melhor</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <div className="text-red-400 font-bold">{formatCurrency(group.worstResult)}</div>
          <div className="text-xs text-gray-400">Pior</div>
        </div>
      </div>

      {/* Fase 4: $/hora-mesa — so quando ha cobertura de duracao razoavel (>=60%).
          Rotulo honesto: e tempo-de-mesa, nao wall-clock (multi-tabling). */}
      {group.profitPerTableHour != null && (group.durationCoverage ?? 0) >= 0.6 && (
        <div className="mb-6">
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <div className="inline-flex items-center gap-2 bg-gray-800/50 rounded-lg px-3 py-2 cursor-help">
                <span className="text-xs text-gray-400">$/hora-mesa</span>
                <span className={`font-bold ${group.profitPerTableHour >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatCurrency(group.profitPerTableHour)}/h
                </span>
                <span className="text-[10px] text-gray-500">
                  ({Math.round((group.durationCoverage ?? 0) * 100)}% cobertura)
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              Lucro por hora de mesa. Não é lucro por hora real — se você joga várias
              mesas ao mesmo tempo, seu lucro/hora real é maior.
            </TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Variações (Fase 1): torneios especificos dentro da familia. So aparece
          quando a familia tem mais de uma variacao (nomes/velocidades distintos). */}
      {group.isFamily && (group.specifics?.length ?? 0) > 1 && (
        <div className="mb-6">
          <div className="text-sm font-semibold text-gray-300 mb-2">
            Variações ({group.specifics!.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {group.specifics!.map((spec) => (
              <div
                key={spec.id}
                className="flex items-center justify-between bg-gray-800/40 rounded-lg px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-white text-sm font-medium truncate">
                    {spec.groupName}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Badge className={`text-[10px] ${getSpeedColor(spec.speed)}`}>
                      {spec.speed}
                    </Badge>
                    <span className="text-xs text-gray-400">
                      {spec.volume.toLocaleString()} torneios
                    </span>
                    {spec.lowConfidence && (
                      <span className="text-[10px] text-amber-400">amostra baixa</span>
                    )}
                  </div>
                </div>
                <div
                  className={`text-sm font-bold shrink-0 ml-2 ${spec.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                >
                  {formatPercentage(spec.roi)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tournament List */}
      <ScrollArea className="h-96">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-700">
              {/* RF-06 (L8): sortable headers */}
              <SortableHead col="date" label="Data" />
              <SortableHead col="site" label="Site" />
              <SortableHead col="name" label="Nome" />
              <SortableHead col="category" label="Tipo" />
              <SortableHead col="speed" label="Velocidade" />
              <SortableHead col="buyIn" label="Buy-in" />
              <SortableHead col="position" label="Posicao/Total" />
              <SortableHead col="profit" label="Profit" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedTournaments.map((tournament: any, index: number) => {
              const profit = parseFloat(String(tournament.prize));
              return (
                <TableRow key={`${tournament.id}-${index}`} className="border-gray-700">
                  <TableCell className="text-white text-sm">
                    {new Date(tournament.datePlayed).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                    })}
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${getSiteColor(tournament.site)}`}>
                      {tournament.site}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-white text-sm max-w-32 truncate">
                    {tournament.name}
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${getCategoryColor(tournament.category)}`}>
                      {tournament.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${getSpeedColor(tournament.speed)}`}>
                      {tournament.speed}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-white text-sm">
                    {formatCurrency(parseFloat(String(tournament.buyIn)))}
                  </TableCell>
                  <TableCell className="text-white text-sm">
                    {tournament.position || '-'}/{tournament.fieldSize || '-'}
                    {tournament.position &&
                      tournament.position <= 9 &&
                      tournament.position > 0 && (
                        <Badge className="ml-1 text-xs bg-yellow-600">FT</Badge>
                      )}
                    {tournament.position === 1 && (
                      <Badge className="ml-1 text-xs bg-green-600">WIN</Badge>
                    )}
                  </TableCell>
                  <TableCell
                    className={`text-sm font-medium ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {formatCurrency(profit)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>
    </>
  );
}

export default function TournamentLibraryNew() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  // RF-03 (L5): sort em URL. Hidrata state inicial dos query params no mount.
  // Default sem param = confidence/desc (mantem comportamento atual).
  const VALID_SORT_KEYS = new Set([
    'confidence', 'roi', 'totalProfit', 'volume', 'avgProfit',
    'sdBuyins', 'normalizedPosition', 'finalTableRate', 'itmRate',
  ]);
  const initialSort = useMemo(() => {
    if (typeof window === 'undefined') return { sort: 'confidence', order: 'desc' as SortOrder };
    const params = new URLSearchParams(window.location.search);
    const sort = params.get('sort') ?? 'confidence';
    const order: SortOrder = params.get('order') === 'asc' ? 'asc' : 'desc';
    return { sort: VALID_SORT_KEYS.has(sort) ? sort : 'confidence', order };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [sortBy, setSortBy] = useState(initialSort.sort);
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialSort.order);
  const [filtersExpanded, setFiltersExpanded] = useState(true);

  // RF-02 (L3): density mode (compact|detail) com persistencia localStorage.
  // Default = compact pra reduzir muro de numeros (15 datapoints -> 3 visiveis).
  const [densityMode, setDensityMode] = useState<'compact' | 'detail'>(() => {
    if (typeof window === 'undefined') return 'compact';
    try {
      const stored = localStorage.getItem('grindfy.library.density');
      return stored === 'detail' ? 'detail' : 'compact';
    } catch {
      return 'compact';
    }
  });
  const toggleDensity = useCallback((mode: 'compact' | 'detail') => {
    setDensityMode(mode);
    try {
      localStorage.setItem('grindfy.library.density', mode);
    } catch {
      // ignore
    }
  }, []);

  // RF-03: sync state -> URL on change (replace, no history pollution)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (sortBy === 'confidence') params.delete('sort');
    else params.set('sort', sortBy);
    if (sortOrder === 'desc') params.delete('order');
    else params.set('order', sortOrder);
    const qs = params.toString();
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    if (newUrl !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, '', newUrl);
    }
  }, [sortBy, sortOrder]);
  
  // Sprint tournament-selector-reform: default periodo = "all" (Tudo). Founder
  // tem 15k+ torneios importados; "Tudo" e a visao desejada por padrao tanto na
  // pagina /library quanto na aba Torneios que reflete ela. (Revertido o RF-08/L10
  // que usava 90d.)
  const [filters, setFilters] = useState<TournamentLibraryFiltersType>({
    period: "all",
    sites: [],
    categories: [],
    speeds: [],
    buyinRange: {
      min: null,
      max: null,
    },
    roiFilter: "all",
    profitFilter: "all",
    volumeFilter: "all",
    minimumVolume: null,
  });

  const { data: libraryGroups, isLoading, isError, refetch } = useQuery({
    queryKey: ["/api/tournament-library-grouped", filters],
    queryFn: async () => {
      const filterParams = {
        sites: filters.sites,
        categories: filters.categories,
        speeds: filters.speeds,
        buyinRange: filters.buyinRange,
        roiFilter: filters.roiFilter
      };

      const params = new URLSearchParams({
        period: filters.period,
        filters: JSON.stringify(filterParams)
      });

      return await apiRequest('GET', `/api/tournament-library-grouped?${params}`) as TournamentGroup[];
    },
  });

  // Fase 2: insights "Destaques e Vazamentos" (endpoint dedicado, cacheavel).
  const { data: insightsData } = useQuery({
    queryKey: ["/api/tournament-library-insights", filters],
    queryFn: async () => {
      const filterParams = {
        sites: filters.sites,
        categories: filters.categories,
        speeds: filters.speeds,
        buyinRange: filters.buyinRange,
        roiFilter: filters.roiFilter,
      };
      const params = new URLSearchParams({
        period: filters.period,
        filters: JSON.stringify(filterParams),
      });
      return await apiRequest('GET', `/api/tournament-library-insights?${params}`) as {
        baseline: { roi: number; sample: number };
        insights: LibraryInsight[];
      };
    },
  });

  // Apply client-side filtering and sorting (memoized)
  const filteredAndSortedGroups = useMemo(() => (libraryGroups || [])
    .filter((group) => {
      const matchesSearch = group.groupName.toLowerCase().includes(searchTerm.toLowerCase());

      let matchesBuyinRange = true;
      if (filters.buyinRange.min !== null || filters.buyinRange.max !== null) {
        const min = filters.buyinRange.min || 0;
        const max = filters.buyinRange.max || Infinity;
        matchesBuyinRange = group.avgBuyin >= min && group.avgBuyin <= max;
      }

      const matchesRoi = filters.roiFilter === "all" ||
        (filters.roiFilter === "positive" && group.roi > 0) ||
        (filters.roiFilter === "negative" && group.roi < 0) ||
        (filters.roiFilter === "high" && group.roi > 20) ||
        (filters.roiFilter === "medium" && group.roi >= 0 && group.roi <= 20);

      let matchesProfit = true;
      if (filters.profitFilter === "higher" || filters.profitFilter === "lower") {
        const allGroups = libraryGroups || [];
        const avgProfit = allGroups.reduce((sum, g) => sum + g.avgProfit, 0) / allGroups.length;
        matchesProfit = filters.profitFilter === "higher" ? group.avgProfit > avgProfit : group.avgProfit < avgProfit;
      }

      let matchesVolume = true;
      if (filters.volumeFilter === "higher") {
        const allGroups = libraryGroups || [];
        const avgVolume = allGroups.reduce((sum, g) => sum + g.volume, 0) / allGroups.length;
        matchesVolume = group.volume > avgVolume;
      } else if (filters.volumeFilter === "minimum" && filters.minimumVolume !== null) {
        matchesVolume = group.volume >= filters.minimumVolume;
      }

      return matchesSearch && matchesBuyinRange && matchesRoi && matchesProfit && matchesVolume;
    })
    .sort((a, b) => {
      const aValue = getSortValue(a, sortBy);
      const bValue = getSortValue(b, sortBy);
      return sortOrder === "desc" ? bValue - aValue : aValue - bValue;
    }), [libraryGroups, searchTerm, filters, sortBy, sortOrder]);

  // Get unique values for filters
  const sites = useMemo(() => Array.from(new Set((libraryGroups || []).map(g => g.site))), [libraryGroups]);
  const categories = useMemo(() => Array.from(new Set((libraryGroups || []).map(g => g.category))), [libraryGroups]);
  const speeds = useMemo(() => Array.from(new Set((libraryGroups || []).map(g => g.speed))), [libraryGroups]);

  // KPI calculations (memoized)
  const kpis = useMemo(() => {
    if (filteredAndSortedGroups.length === 0) {
      return { bestROIGroup: null as TournamentGroup | null, worstROIGroup: null as TournamentGroup | null, selectionProfit: 0, filteredTournaments: 0 };
    }
    const reliableGroups = filteredAndSortedGroups.filter(g => g.confidenceGrade === 'A' || g.confidenceGrade === 'B');
    const bestROIGroup = reliableGroups.length > 0
      ? reliableGroups.reduce((a, b) => a.roi > b.roi ? a : b)
      : null;
    const worstROIGroup = reliableGroups.length > 0
      ? reliableGroups.reduce((a, b) => a.roi < b.roi ? a : b)
      : null;
    return {
      bestROIGroup,
      worstROIGroup,
      selectionProfit: filteredAndSortedGroups.reduce((sum, g) => sum + g.totalProfit, 0),
      filteredTournaments: filteredAndSortedGroups.reduce((sum, g) => sum + g.volume, 0),
    };
  }, [filteredAndSortedGroups]);
  const totalGroups = libraryGroups?.length || 0;

  const filtersActive = hasActiveFilters(filters, searchTerm);

  const handleClearFilters = useCallback(() => {
    // Clear filters volta ao default "all" (Tudo).
    setFilters({
      period: "all", sites: [], categories: [], speeds: [],
      buyinRange: { min: null, max: null },
      roiFilter: "all", profitFilter: "all", volumeFilter: "all", minimumVolume: null,
    });
    setSearchTerm("");
    setSortBy("confidence");
    setSortOrder("desc");
  }, []);

  // RF-07 (G7): chips canonicos via FilterChipGroup. Memoizado para evitar
  // re-render. Tons mapeados por semantica do filtro (Foundation tokens).
  const activeFilterChips = useMemo<FilterChipGroupChip[]>(() => {
    const chips: FilterChipGroupChip[] = [];
    if (filters.period !== 'all') {
      const periodLabel =
        filters.period === 'month' ? 'Mes atual'
        : filters.period === 'year' ? 'Ano atual'
        : filters.period === '90d' ? 'Ultimos 3M'
        : filters.period === '180d' ? 'Ultimos 6M'
        : filters.period === '365d' ? 'Ultimos 12M'
        : filters.period;
      chips.push({
        key: 'period',
        label: `Periodo: ${periodLabel}`,
        onRemove: () => setFilters(prev => ({ ...prev, period: 'all' })),
        tone: 'info',
      });
    }
    if (filters.sites.length > 0) {
      chips.push({
        key: 'sites',
        label: `Site: ${filters.sites.join(', ')}`,
        onRemove: () => setFilters(prev => ({ ...prev, sites: [] })),
        tone: 'success',
      });
    }
    if (filters.categories.length > 0) {
      chips.push({
        key: 'categories',
        label: `Categoria: ${filters.categories.join(', ')}`,
        onRemove: () => setFilters(prev => ({ ...prev, categories: [] })),
        tone: 'accent',
      });
    }
    if (filters.speeds.length > 0) {
      chips.push({
        key: 'speeds',
        label: `Velocidade: ${filters.speeds.join(', ')}`,
        onRemove: () => setFilters(prev => ({ ...prev, speeds: [] })),
        tone: 'warn',
      });
    }
    if (filters.roiFilter !== 'all') {
      const roiLabel = filters.roiFilter === 'positive' ? 'Lucrativos'
        : filters.roiFilter === 'negative' ? 'Prejuizo'
        : filters.roiFilter === 'high' ? 'ROI > 20%'
        : filters.roiFilter;
      chips.push({
        key: 'roi',
        label: `ROI: ${roiLabel}`,
        onRemove: () => setFilters(prev => ({ ...prev, roiFilter: 'all' })),
        tone: filters.roiFilter === 'negative' ? 'danger' : 'success',
      });
    }
    if (filters.minimumVolume !== null) {
      chips.push({
        key: 'volume',
        label: `Volume: ${filters.minimumVolume}+`,
        onRemove: () => setFilters(prev => ({ ...prev, minimumVolume: null })),
        tone: 'info',
      });
    }
    if (filters.buyinRange.min !== null || filters.buyinRange.max !== null) {
      chips.push({
        key: 'buyin',
        label: `Buy-in: $${filters.buyinRange.min ?? 0} — $${filters.buyinRange.max ?? '∞'}`,
        onRemove: () => setFilters(prev => ({
          ...prev,
          buyinRange: { min: null, max: null },
        })),
        tone: 'warn',
      });
    }
    return chips;
  }, [filters]);

  if (isError) {
    return (
      <div className="p-6 text-white">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Biblioteca de Torneios</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-16">
          <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Erro ao carregar biblioteca</h3>
          <p className="text-gray-400 mb-4">Não foi possível carregar os dados dos torneios.</p>
          <Button onClick={() => refetch()} variant="outline" className="text-white border-gray-600">
            <RefreshCw className="w-4 h-4 mr-2" />
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    // RF-09 (L11): skeleton matching layout final (4 KPIs + filtros + grid 4col).
    // Antes: 1col sidebar + 6 cards 3col -> layout shift garantido on data load.
    return (
      <div className="p-6 text-white">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Biblioteca de Torneios</h2>
          <p className="text-gray-400">Carregando analise estatistica dos torneios...</p>
        </div>
        {/* 4 KPIs */}
        <div className="bg-gray-800 rounded-xl p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="text-center space-y-2">
                <Skeleton className="h-4 w-20 mx-auto bg-gray-700" />
                <Skeleton className="h-8 w-16 mx-auto bg-gray-700" />
                <Skeleton className="h-3 w-24 mx-auto bg-gray-700" />
              </div>
            ))}
          </div>
        </div>
        {/* Filtros expandidos (header + 3 secoes + ROI/Volume/Buy-in) */}
        <div className="bg-poker-surface border border-gray-700 rounded-2xl mb-8 p-6 space-y-4">
          <div className="flex items-center justify-between mb-3">
            <Skeleton className="h-6 w-24 bg-gray-700" />
            <Skeleton className="h-9 w-48 bg-gray-700" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-24 w-full bg-gray-700/60" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-24 w-full bg-gray-700/60" />
            ))}
          </div>
        </div>
        {/* Grid 4col matching final layout */}
        <div className="flex justify-between items-center mb-6">
          <Skeleton className="h-7 w-40 bg-gray-700" />
          <Skeleton className="h-9 w-48 bg-gray-700" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <Card key={i} className="bg-poker-surface border-gray-700">
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-9 w-9 bg-gray-700 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-3/4 bg-gray-700" />
                    <Skeleton className="h-5 w-16 bg-gray-700 rounded-full" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <Skeleton className="h-16 w-full bg-gray-700/80" />
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map(j => (
                    <Skeleton key={j} className="h-12 w-full bg-gray-700/60" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 text-white">
      {/* Header Principal */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold mb-2">Biblioteca de Torneios</h2>
            <p className="text-gray-400">Analise estatistica de performance por grupo de torneio</p>
          </div>
          <OverviewPanel />
        </div>
      </div>

      {/* Fase 5/6: destaques salvos (familias) fixados no topo, por plataforma. */}
      <SavedHighlightsStrip sites={filters.sites} />

      {/* KPIs */}
      <div className="bg-gray-800 rounded-xl p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Card: Melhor ROI (confiavel) */}
          <div className="text-center">
            <p className="text-sm text-gray-400">Melhor ROI (confiavel)</p>
            <p className="text-2xl font-bold text-[#24c25e]">
              {kpis.bestROIGroup ? formatPercentage(kpis.bestROIGroup.roi) : "N/A"}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {kpis.bestROIGroup?.groupName || "Sem grupos A/B"}
            </p>
          </div>

          {/* Card: Pior ROI (confiavel) */}
          <div className="text-center">
            <p className="text-sm text-gray-400">Pior ROI (confiavel)</p>
            <p className="text-2xl font-bold text-red-400">
              {kpis.worstROIGroup ? formatPercentage(kpis.worstROIGroup.roi) : "N/A"}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {kpis.worstROIGroup?.groupName || "Sem grupos A/B"}
            </p>
          </div>
          
          {/* Card: Grupos Filtrados */}
          <div className="text-center">
            <p className="text-sm text-gray-400">Grupos Filtrados</p>
            <p className="text-2xl font-bold text-white">{filteredAndSortedGroups.length}</p>
            <p className="text-xs text-gray-500">de {totalGroups} total</p>
          </div>
          
          {/* Card: Lucro da Seleção */}
          <div className="text-center">
            <p className="text-sm text-gray-400">Lucro da Seleção</p>
            <p className={`text-2xl font-bold ${kpis.selectionProfit >= 0 ? 'text-[#24c25e]' : 'text-red-400'}`}>
              {formatCurrency(kpis.selectionProfit)}
            </p>
            <p className="text-xs text-gray-500">{kpis.filteredTournaments} torneios</p>
          </div>
        </div>
      </div>

      {/* Fase 2 (library-evolution): Destaques e Vazamentos — onde voce ganha/
          perde acima/abaixo da sua media, com significancia estatistica. */}
      {insightsData && insightsData.insights.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-bold mb-3">Destaques e Vazamentos</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insightsData.insights.map((ins, i) => {
              const isHi = ins.kind === 'highlight';
              const confColor =
                ins.confidence === 'high' ? 'bg-emerald-400'
                  : ins.confidence === 'medium' ? 'bg-yellow-400'
                  : 'bg-gray-500';
              return (
                <div
                  key={`${ins.dimension}-${ins.bucketLabel}-${i}`}
                  className={`rounded-lg p-3 border flex items-start gap-3 ${
                    isHi
                      ? 'bg-emerald-900/30 border-emerald-600/40'
                      : 'bg-red-900/30 border-red-600/40'
                  }`}
                >
                  <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${confColor}`} title={`Confiança: ${ins.confidence}`} />
                  <div className="min-w-0">
                    {/* Motivo do destaque (alinha com cards salvos — Fase 5/6) */}
                    {ins.reason === 'low_variance' && (
                      <span className="inline-block mb-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-sky-900/60 text-sky-300 border border-sky-600/40">
                        Baixa variância
                      </span>
                    )}
                    <p className={`text-sm ${isHi ? 'text-emerald-200' : 'text-red-200'}`}>
                      {ins.message}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* RF-01 (L1): Filtros uniformes — sem 7 gradientes ad-hoc.
          Estilo neutro padrao + cor so no chip ATIVO via tokens.color.
          Header da pagina e secoes internas usam mesmo background. */}
      <div className="bg-poker-surface border border-gray-700 rounded-2xl mb-8">
        {/* Header fixo */}
        <div className="p-6 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-800 border border-gray-700 rounded-lg">
                <Filter className="h-5 w-5 text-gray-300" />
              </div>
              <h3 className="text-lg font-semibold text-white">Filtros</h3>
              {filtersActive && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-lg border border-poker-accent/40 bg-poker-accent/10">
                  <div className="w-2 h-2 bg-poker-accent rounded-full animate-pulse"></div>
                  <span className="text-sm text-poker-accent font-medium">Filtros ativos</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              {filtersActive && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="px-4 py-1.5 text-sm font-medium text-red-400 hover:text-red-300 border border-red-700/40 rounded-lg hover:bg-red-900/20 transition-colors"
                >
                  Limpar Todos
                </button>
              )}
              {/* Busca inline */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar grupo..."
                  className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 pr-9 text-sm text-white placeholder-gray-500 focus:border-poker-accent focus:ring-1 focus:ring-poker-accent w-48"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Conteudo colapsavel */}
        <div className={`overflow-hidden transition-all duration-300 ease-in-out ${filtersExpanded ? 'max-h-none opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="px-6 pb-4 space-y-5">

            {/* Periodo */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
              <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Periodo de Analise
              </h4>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'all', label: 'Tudo' },
                  { key: 'month', label: 'Mes Atual' },
                  { key: '90d', label: 'Ultimos 3M' },
                  { key: '180d', label: 'Ultimos 6M' },
                  { key: 'year', label: 'Ano Atual' },
                  { key: '365d', label: 'Ultimos 12M' },
                ].map((opt) => {
                  const active = filters.period === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setFilters(prev => ({ ...prev, period: opt.key }))}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                        active
                          ? `${tokens.color.info.bg} ${tokens.color.info.text} ${tokens.color.info.border}`
                          : 'bg-poker-surface text-gray-300 border-gray-600 hover:border-gray-500 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filtros multi-select em grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Sites */}
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Sites
                </h4>
                <div className="flex flex-wrap gap-2">
                  {sites.map((site: string) => {
                    const active = filters.sites.includes(site);
                    return (
                      <button
                        key={site}
                        type="button"
                        onClick={() => {
                          const cur = filters.sites;
                          setFilters(prev => ({ ...prev, sites: cur.includes(site) ? cur.filter(s => s !== site) : [...cur, site] }));
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                          active
                            ? `${tokens.color.success.bg} ${tokens.color.success.text} ${tokens.color.success.border}`
                            : 'bg-poker-surface text-gray-300 border-gray-600 hover:border-gray-500 hover:text-white'
                        }`}
                      >
                        {site}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Categorias */}
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Categorias
                </h4>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat: string) => {
                    const active = filters.categories.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          const cur = filters.categories;
                          setFilters(prev => ({ ...prev, categories: cur.includes(cat) ? cur.filter(c => c !== cat) : [...cur, cat] }));
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                          active
                            ? `${tokens.color.accent.bg} ${tokens.color.accent.text} ${tokens.color.accent.border}`
                            : 'bg-poker-surface text-gray-300 border-gray-600 hover:border-gray-500 hover:text-white'
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Velocidades */}
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Velocidades
                </h4>
                <div className="flex flex-wrap gap-2">
                  {speeds.map((spd: string) => {
                    const active = filters.speeds.includes(spd);
                    return (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => {
                          const cur = filters.speeds;
                          setFilters(prev => ({ ...prev, speeds: cur.includes(spd) ? cur.filter(s => s !== spd) : [...cur, spd] }));
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                          active
                            ? `${tokens.color.warn.bg} ${tokens.color.warn.text} ${tokens.color.warn.border}`
                            : 'bg-poker-surface text-gray-300 border-gray-600 hover:border-gray-500 hover:text-white'
                        }`}
                      >
                        {spd}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Filtros avancados — ROI + Volume + Buy-in */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* ROI */}
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  ROI
                </h4>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'all', label: 'Todos' },
                    { key: 'positive', label: 'Lucrativos' },
                    { key: 'negative', label: 'Prejuizo' },
                    { key: 'high', label: 'ROI > 20%' },
                  ].map((opt) => {
                    const active = filters.roiFilter === opt.key;
                    // RF-12: tone semantico — danger pra negative, success pros positivos
                    const tone = opt.key === 'negative' ? 'danger' : 'success';
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setFilters(prev => ({ ...prev, roiFilter: prev.roiFilter === opt.key && opt.key !== 'all' ? 'all' : opt.key }))}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                          active
                            ? `${tokens.color[tone].bg} ${tokens.color[tone].text} ${tokens.color[tone].border}`
                            : 'bg-poker-surface text-gray-300 border-gray-600 hover:border-gray-500 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Volume Minimo */}
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Volume Minimo
                </h4>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: null, label: 'Todos' },
                    { key: 30, label: '30+' },
                    { key: 50, label: '50+ (D)' },
                    { key: 100, label: '100+ (C)' },
                    { key: 200, label: '200+ (B)' },
                    { key: 500, label: '500+ (A)' },
                  ].map((opt) => {
                    const active = filters.minimumVolume === opt.key;
                    return (
                      <button
                        key={String(opt.key)}
                        type="button"
                        onClick={() => setFilters(prev => ({ ...prev, minimumVolume: prev.minimumVolume === opt.key ? null : opt.key }))}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                          active
                            ? `${tokens.color.info.bg} ${tokens.color.info.text} ${tokens.color.info.border}`
                            : 'bg-poker-surface text-gray-300 border-gray-600 hover:border-gray-500 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Faixa de Buy-in */}
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Faixa de Buy-in
                </h4>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="Min $"
                    className="flex-1 bg-poker-surface border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-poker-accent focus:outline-none"
                    value={filters.buyinRange.min || ''}
                    onChange={(e) => setFilters(prev => ({
                      ...prev,
                      buyinRange: { ...prev.buyinRange, min: e.target.value ? parseFloat(e.target.value) : null }
                    }))}
                  />
                  <span className="text-gray-500 text-sm">—</span>
                  <input
                    type="number"
                    placeholder="Max $"
                    className="flex-1 bg-poker-surface border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-poker-accent focus:outline-none"
                    value={filters.buyinRange.max || ''}
                    onChange={(e) => setFilters(prev => ({
                      ...prev,
                      buyinRange: { ...prev.buyinRange, max: e.target.value ? parseFloat(e.target.value) : null }
                    }))}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RF-10 (L12): Botao toggle filtros visivel — antes era 16x8px chevron isolado.
            Agora label explicito + posicionado no centro com largura adequada. */}
        <div className="flex justify-center p-3 pt-0">
          <button
            type="button"
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            data-testid="library-filters-toggle"
            aria-expanded={filtersExpanded}
            className="group inline-flex items-center gap-2 px-4 h-9 bg-poker-surface border border-gray-600 rounded-lg text-sm font-medium text-gray-300 hover:border-gray-500 hover:text-white transition-all duration-200"
          >
            {filtersExpanded ? (
              <>
                <ChevronUp className="h-4 w-4" />
                <span>Ocultar filtros</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                <span>Mostrar filtros</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Area Principal — full width */}
      <div>
          {/* RF-07 (G7): Tags de filtros ativos via FilterChipGroup canonico */}
          {activeFilterChips.length > 0 && (
            <div className="mb-4">
              <FilterChipGroup
                chips={activeFilterChips}
                onClearAll={handleClearFilters}
              />
            </div>
          )}

          {/* Controles de Visualização */}
          <div className="flex justify-between items-center mb-6 gap-4 flex-wrap">
            <h2 className="text-xl font-bold text-white">
              {filteredAndSortedGroups.length} grupos encontrados
            </h2>

            <div className="flex items-center gap-4 flex-wrap">
              {/* RF-02 (L3): Density toggle */}
              <div
                className="inline-flex items-center bg-poker-surface border border-gray-600 rounded-lg p-0.5"
                role="group"
                aria-label="Densidade dos cards"
                data-testid="library-density-toggle"
              >
                <button
                  type="button"
                  onClick={() => toggleDensity('compact')}
                  data-active={densityMode === 'compact'}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    densityMode === 'compact'
                      ? `${tokens.color.action.bg} ${tokens.color.action.text}`
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Compacto
                </button>
                <button
                  type="button"
                  onClick={() => toggleDensity('detail')}
                  data-active={densityMode === 'detail'}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    densityMode === 'detail'
                      ? `${tokens.color.action.bg} ${tokens.color.action.text}`
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Detalhado
                </button>
              </div>

              {/* Ordenação */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">Ordenar por:</span>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="bg-gray-700 border-gray-600 text-white w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="confidence">Confianca</SelectItem>
                    <SelectItem value="roi">ROI</SelectItem>
                    <SelectItem value="totalProfit">Lucro Total</SelectItem>
                    <SelectItem value="volume">Volume</SelectItem>
                    <SelectItem value="avgProfit">Lucro Medio</SelectItem>
                    <SelectItem value="sdBuyins">Volatilidade</SelectItem>
                    <SelectItem value="normalizedPosition">Posicao</SelectItem>
                    <SelectItem value="finalTableRate">Final Table %</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
                  className="border-gray-600 text-gray-300"
                >
                  {sortOrder === "desc" ? "↓" : "↑"}
                </Button>
              </div>
            </div>
          </div>

          {/* Cards de Grupo com Metricas Estatisticas */}
          {filteredAndSortedGroups.length === 0 ? (
        <Card className="bg-poker-surface border-gray-700">
          <CardContent className="p-12">
            {filtersActive ? (
              // RF-06 (G6) + RF-11 (UI-T1-Library): EmptyState canonico — filtros zerados
              <EmptyState
                icon={<Search className="w-full h-full" />}
                title="Nenhum torneio encontrado com esses filtros"
                description="Tente ajustar seus criterios de busca ou limpe os filtros para ver todos os grupos."
                ctaLabel="Limpar filtros"
                ctaAction={handleClearFilters}
                area="library-filters-empty"
              />
            ) : (
              // RF-06 (G6) + RF-11 (UI-T1-Library): EmptyState canonico — sem grupos
              <EmptyState
                icon={<Trophy className="w-full h-full" />}
                title="Nenhum grupo encontrado"
                description="Grupos sao criados automaticamente quando voce tem 10+ torneios similares. Importe mais historico para ver a biblioteca."
                ctaLabel="Importar torneios"
                ctaAction={() => setLocation('/upload')}
                area="library-no-groups"
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredAndSortedGroups.map((group) => {
            const roiColor = group.roi >= 0 ? 'text-emerald-400' : 'text-red-400';
            const volatilityColor = group.volatilityLevel === 'low' ? 'text-emerald-400' : group.volatilityLevel === 'medium' ? 'text-yellow-400' : 'text-red-400';
            const posColor = group.normalizedPosition !== null ? (group.normalizedPosition < 0.5 ? 'text-emerald-400' : 'text-red-400') : 'text-gray-500';
            const gradeColor = confidenceGradeColors[group.confidenceGrade] || 'bg-gray-600';
            const variationCount = group.specifics?.length ?? 0;

            return (
              <Dialog key={group.id}>
              <DialogTrigger asChild>
              <Card className="bg-poker-surface border-gray-700 hover:border-[#24c25e] transition-all duration-300 cursor-pointer hover:shadow-lg hover:shadow-[#24c25e]/20 relative overflow-hidden">
                <CardHeader className="pb-3">
                  {/* Header: Badge + Name + Site */}
                  <div className="flex items-start gap-3">
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <span
                          className={`inline-flex items-center justify-center w-9 h-9 rounded-lg text-white font-bold text-sm shrink-0 ${gradeColor}`}
                        >
                          {group.confidenceGrade}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {getConfidenceTooltip(group.confidenceGrade)}
                      </TooltipContent>
                    </Tooltip>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-white text-base font-bold line-clamp-2 leading-tight mb-1">
                        {group.groupName}
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge className={`text-xs font-medium ${getSiteColor(group.site)}`}>
                          {group.site}
                        </Badge>
                        {variationCount > 1 && (
                          <Badge className="text-xs font-medium bg-gray-700 text-gray-200">
                            {variationCount} variações
                          </Badge>
                        )}
                        {group.lowConfidence && (
                          <Badge className="text-xs font-medium bg-amber-900/60 text-amber-300 border border-amber-600/40">
                            amostra baixa
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0 space-y-3">
                  {/* ROI + IC + Profit */}
                  <div className="bg-gray-800/30 rounded-lg p-3">
                    <div className="flex justify-between items-baseline">
                      <div>
                        <span className={`text-2xl font-bold ${roiColor}`}>
                          {formatPercentage(group.roi)}
                        </span>
                        <span className="text-xs text-gray-400 ml-1">ROI</span>
                      </div>
                      <div className={`text-lg font-bold ${group.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatCurrency(group.totalProfit)}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      IC 95%: {formatPercentage(group.roiLower)} — {formatPercentage(group.roiUpper)}
                    </div>
                  </div>

                  {/* RF-02: Compact mode mostra so Volume isolado + tags + outlier.
                      Detail mode adiciona 3-grids de stats (15 datapoints totais). */}
                  {densityMode === 'compact' ? (
                    <>
                      <div className="flex justify-between items-center text-sm bg-gray-800/30 rounded-lg p-2">
                        <span className="text-gray-400">Volume</span>
                        <span className="text-white font-bold">{group.volume.toLocaleString()}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Badge className={`text-xs font-medium ${getCategoryColor(group.category)}`}>
                          {group.category}
                        </Badge>
                        <Badge className={`text-xs font-medium ${getSpeedColor(group.speed)}`}>
                          {group.speed}
                        </Badge>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Volume + ABI + Field */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="text-center bg-gray-800/30 rounded-lg p-2">
                          <div className="text-white font-bold">{group.volume.toLocaleString()}</div>
                          <div className="text-xs text-gray-400">Volume</div>
                        </div>
                        <div className="text-center bg-gray-800/30 rounded-lg p-2">
                          <div className="text-white font-bold">{formatCurrency(group.avgBuyin)}</div>
                          <div className="text-xs text-gray-400">ABI</div>
                        </div>
                        <div className="text-center bg-gray-800/30 rounded-lg p-2">
                          <div className="text-white font-bold">{group.avgFieldSize.toLocaleString()}</div>
                          <div className="text-xs text-gray-400">Field</div>
                        </div>
                      </div>

                      {/* Volatility + Pos + ROI s/outliers */}
                      <div className="grid grid-cols-3 gap-2">
                        <Tooltip delayDuration={200}>
                          <TooltipTrigger asChild>
                            <div className="text-center bg-gray-800/30 rounded-lg p-2 cursor-help">
                              <div className={`font-bold ${volatilityColor}`}>{group.sdBuyins.toFixed(1)} BI</div>
                              <div className="text-xs text-gray-400">Volat.</div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            {getVolatilityTooltip()}
                          </TooltipContent>
                        </Tooltip>
                        <div className="text-center bg-gray-800/30 rounded-lg p-2">
                          <div className={`font-bold ${posColor}`}>
                            {group.normalizedPosition !== null ? `${(group.normalizedPosition * 100).toFixed(1)}%` : '—'}
                          </div>
                          <div className="text-xs text-gray-400">Pos.</div>
                        </div>
                        <div className="text-center bg-gray-800/30 rounded-lg p-2">
                          <div className={`font-bold ${group.roiWithoutOutliers !== null ? (group.roiWithoutOutliers >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-gray-500'}`}>
                            {group.roiWithoutOutliers !== null ? formatPercentage(group.roiWithoutOutliers) : '—'}
                          </div>
                          <div className="text-xs text-gray-400" title="ROI recalculado sem os 3 maiores resultados">ROI Ajustado</div>
                        </div>
                      </div>

                      {/* ITM + FT + Reentries */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="text-center bg-gray-800/30 rounded-lg p-2">
                          <div className="text-white font-bold">{formatPercentage(group.itmRate)}</div>
                          <div className="text-xs text-gray-400">ITM%</div>
                        </div>
                        <div className="text-center bg-gray-800/30 rounded-lg p-2">
                          <div className="text-white font-bold">{formatPercentage(group.finalTableRate)}</div>
                          <div className="text-xs text-gray-400">FT%</div>
                        </div>
                        <div className="text-center bg-gray-800/30 rounded-lg p-2">
                          <div className="text-white font-bold">{group.totalReentries || 0}</div>
                          <div className="text-xs text-gray-400">Reentradas</div>
                        </div>
                      </div>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-1">
                        <Badge className={`text-xs font-medium ${getCategoryColor(group.category)}`}>
                          {group.category}
                        </Badge>
                        <Badge className={`text-xs font-medium ${getSpeedColor(group.speed)}`}>
                          {group.speed}
                        </Badge>
                      </div>

                      {/* Outlier alert */}
                      {group.outlierDependent && (
                        <div className="bg-orange-900/50 border border-orange-500/50 rounded-lg px-3 py-2 text-xs text-orange-300 flex items-center gap-2">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          Dependente de outliers
                        </div>
                      )}
                    </>
                  )}

                </CardContent>
              </Card>
              </DialogTrigger>
                    <DialogContent className="max-w-6xl max-h-[80vh] bg-poker-surface border-gray-700">
                      <GroupDetailDialogContent group={group} />
                    </DialogContent>
              </Dialog>
          );
        })}
        </div>
      )}
      </div>
    </div>
  );
}
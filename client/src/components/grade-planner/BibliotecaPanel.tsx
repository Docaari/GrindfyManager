import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { filterLibraryTournaments } from "@shared/library-filters";
import {
  readBibliotecaFilters,
  writeBibliotecaFilters,
  DEFAULT_BIBLIOTECA_FILTERS,
} from "@/lib/bibliotecaFilters";
import { getCurrencyForSite } from "@shared/platform-currency";
import { LibraryCard } from "./LibraryCard";
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  RotateCcw,
  Download,
  Filter,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Draggable } from "react-beautiful-dnd";
import { StrictModeDroppable as Droppable } from "./StrictModeDroppable";
import { sites, types, speeds } from "./types";
import SupremaImportModal from "@/components/SupremaImportModal";
import { BibliotecaQuickFilters } from "./BibliotecaQuickFilters";

interface BibliotecaPanelProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function BibliotecaPanel({
  collapsed,
  onToggleCollapsed,
}: BibliotecaPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  // Filtros hidratam de localStorage no mount; useEffect abaixo re-persiste.
  const [persistedInit] = useState(readBibliotecaFilters);
  const [search, setSearch] = useState("");
  const [showTrash, setShowTrash] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSupremaModal, setShowSupremaModal] = useState(false);
  const [filterType, setFilterType] = useState<string>(persistedInit.filterType);
  const [filterSpeed, setFilterSpeed] = useState<string>(persistedInit.filterSpeed);
  // RF-05.1: filterSites multi-select (substitui filterSite single).
  const [filterSites, setFilterSites] = useState<string[]>(persistedInit.filterSites);
  const [filterCurrency, setFilterCurrency] = useState<string>(persistedInit.filterCurrency);
  const [filterMinBuyIn, setFilterMinBuyIn] = useState<string>(persistedInit.filterMinBuyIn);
  const [filterMaxBuyIn, setFilterMaxBuyIn] = useState<string>(persistedInit.filterMaxBuyIn);
  const [sortMode, setSortMode] = useState<string>(persistedInit.sortMode);

  // Persiste filtros a cada mudanca. `search` fica de fora de proposito —
  // busca textual e transiente. Skip do mount: nao reescreve o que acabou
  // de ser lido (evita criar a key pra quem nunca mexeu nos filtros).
  const skipFirstPersist = useRef(true);
  useEffect(() => {
    if (skipFirstPersist.current) {
      skipFirstPersist.current = false;
      return;
    }
    writeBibliotecaFilters({
      filterType,
      filterSpeed,
      filterSites,
      filterCurrency,
      filterMinBuyIn,
      filterMaxBuyIn,
      sortMode,
    });
  }, [filterType, filterSpeed, filterSites, filterCurrency, filterMinBuyIn, filterMaxBuyIn, sortMode]);

  // Manual add form state
  const [addSite, setAddSite] = useState("");
  const [addName, setAddName] = useState("");
  const [addBuyIn, setAddBuyIn] = useState("");
  const [addTime, setAddTime] = useState("");
  const [addType, setAddType] = useState("");
  const [addSpeed, setAddSpeed] = useState("");
  const [addGuaranteed, setAddGuaranteed] = useState("");

  // Queries
  const { data: libraryTournaments = [], isLoading: libraryLoading } = useQuery({
    queryKey: ["/api/tournament-library"],
    queryFn: () => apiRequest("GET", "/api/tournament-library"),
  });

  const { data: trashTournaments = [] } = useQuery({
    queryKey: ["/api/tournament-library/trash"],
    queryFn: () => apiRequest("GET", "/api/tournament-library/trash"),
    enabled: showTrash,
  });

  const { data: importableTournaments = [] } = useQuery({
    queryKey: ["/api/tournament-library/import/grind-live/available"],
    queryFn: () => apiRequest("GET", "/api/tournament-library/import/grind-live/available"),
    enabled: showImportModal,
  });

  // Mutations
  const addMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/tournament-library", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournament-library"] });
      toast({ title: "Torneio Adicionado", description: "Torneio adicionado a biblioteca" });
      resetAddForm();
      setShowAddForm(false);
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao adicionar torneio", variant: "destructive" });
    },
  });

  const trashMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/tournament-library/${id}/trash`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournament-library"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tournament-library/trash"] });
      toast({ title: "Movido para Lixeira" });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/tournament-library/${id}/restore`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournament-library"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tournament-library/trash"] });
      toast({ title: "Torneio Restaurado" });
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/tournament-library/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournament-library/trash"] });
      toast({ title: "Deletado Permanentemente" });
    },
  });

  const importGrindLiveMutation = useMutation({
    mutationFn: (tournaments: any[]) =>
      apiRequest("POST", "/api/tournament-library/import/grind-live", { tournaments }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournament-library"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tournament-library/import/grind-live/available"] });
      toast({ title: "Importacao Concluida", description: `${data.imported} torneios importados` });
      setShowImportModal(false);
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao importar torneios", variant: "destructive" });
    },
  });

  const syncSupremaMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/tournament-library/sync/suprema", {}),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournament-library"] });
      toast({ title: "Sincronizacao Concluida", description: `${data.synced} torneios sincronizados` });
    },
    onError: (error: any) => {
      toast({
        title: "Erro na Sincronizacao",
        description: error.message || "Falha ao sincronizar com Suprema",
        variant: "destructive",
      });
    },
  });

  // Filter and sort tournaments
  const filtered = useMemo(() => {
    const tournaments = Array.isArray(libraryTournaments) ? libraryTournaments : [];
    const result = filterLibraryTournaments(tournaments, {
      search: search || undefined,
      types: filterType ? [filterType] : undefined,
      speeds: filterSpeed ? [filterSpeed] : undefined,
      filterSites: filterSites.length > 0 ? filterSites : undefined,
      currencies: filterCurrency ? [filterCurrency] : undefined,
      minBuyIn: filterMinBuyIn ? parseFloat(filterMinBuyIn) : undefined,
      maxBuyIn: filterMaxBuyIn ? parseFloat(filterMaxBuyIn) : undefined,
    });

    // Sort
    return [...result].sort((a: any, b: any) => {
      switch (sortMode) {
        case "platform-buyin":
          if (a.site !== b.site) return a.site.localeCompare(b.site);
          if (parseFloat(a.buyIn) !== parseFloat(b.buyIn)) return parseFloat(a.buyIn) - parseFloat(b.buyIn);
          return (a.time || "").localeCompare(b.time || "");
        case "buyin":
          return parseFloat(a.buyIn) - parseFloat(b.buyIn);
        case "horario":
          return (a.time || "99:99").localeCompare(b.time || "99:99");
        case "nome":
          return (a.name || a.site || "").localeCompare(b.name || b.site || "");
        default:
          return 0;
      }
    });
  }, [libraryTournaments, search, filterType, filterSpeed, filterSites, filterCurrency, filterMinBuyIn, filterMaxBuyIn, sortMode]);

  const totalCount = Array.isArray(libraryTournaments) ? libraryTournaments.length : 0;
  const trashCount = Array.isArray(trashTournaments) ? trashTournaments.length : 0;

  const resetAddForm = () => {
    setAddSite("");
    setAddName("");
    setAddBuyIn("");
    setAddTime("");
    setAddType("");
    setAddSpeed("");
    setAddGuaranteed("");
  };

  const handleAddSubmit = () => {
    if (!addSite || !addName || !addBuyIn) {
      toast({ title: "Campos obrigatorios", description: "Site, nome e buy-in sao obrigatorios", variant: "destructive" });
      return;
    }
    addMutation.mutate({
      site: addSite,
      name: addName,
      buyIn: addBuyIn,
      time: addTime || null,
      type: addType || null,
      speed: addSpeed || null,
      guaranteed: addGuaranteed || null,
      source: "manual",
    });
  };

  const clearFilters = () => {
    setFilterType(DEFAULT_BIBLIOTECA_FILTERS.filterType);
    setFilterSpeed(DEFAULT_BIBLIOTECA_FILTERS.filterSpeed);
    setFilterSites([]);
    setFilterCurrency(DEFAULT_BIBLIOTECA_FILTERS.filterCurrency);
    setFilterMinBuyIn(DEFAULT_BIBLIOTECA_FILTERS.filterMinBuyIn);
    setFilterMaxBuyIn(DEFAULT_BIBLIOTECA_FILTERS.filterMaxBuyIn);
    setSearch("");
  };

  const hasActiveFilters =
    filterType || filterSpeed || filterSites.length > 0 ||
    filterCurrency || filterMinBuyIn || filterMaxBuyIn;

  // =========================================================================
  // Collapsed mode
  // =========================================================================
  if (collapsed) {
    return (
      <div className="w-full bg-gray-900 border border-gray-700 rounded-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-3 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Biblioteca</h3>
          <button
            onClick={onToggleCollapsed}
            className="text-gray-400 hover:text-white transition-colors"
            title="Expandir biblioteca"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="p-2 border-b border-gray-700">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full pl-8 pr-3 py-1.5 bg-gray-800 border border-gray-600 rounded text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Compact list */}
        <Droppable droppableId="library" isDropDisabled={true}>
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="flex-1 overflow-y-auto p-1 space-y-0.5"
            >
              {filtered.length === 0 ? (
                <div className="text-center text-gray-500 text-xs py-6">
                  {totalCount === 0
                    ? "Biblioteca vazia"
                    : "Nenhum resultado"}
                </div>
              ) : (
                filtered.map((t: any, index: number) => (
                  <Draggable key={t.id} draggableId={`library-${t.id}`} index={index}>
                    {(dragProvided) => (
                      <LibraryCard
                        tournament={t}
                        compact
                        innerRef={dragProvided.innerRef}
                        draggableProps={dragProvided.draggableProps}
                        dragHandleProps={dragProvided.dragHandleProps}
                      />
                    )}
                  </Draggable>
                ))
              )}
              {provided.placeholder}
            </div>
          )}
        </Droppable>

        {/* Footer counter */}
        <div className="p-2 border-t border-gray-700 text-center text-xs text-gray-400">
          {filtered.length} de {totalCount} torneios
        </div>
      </div>
    );
  }

  // =========================================================================
  // Expanded mode
  // =========================================================================
  return (
    <div className="w-full bg-gray-900 border border-gray-700 rounded-lg flex flex-col overflow-hidden h-full">
      {/* Header */}
      <div className="p-3 border-b border-gray-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Biblioteca de Torneios</h3>
        <button
          onClick={onToggleCollapsed}
          className="text-gray-400 hover:text-white transition-colors"
          title="Recolher biblioteca"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Search + quick filters + filter toggle */}
      <div className="p-3 border-b border-gray-700 space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar torneio..."
            className="w-full pl-8 pr-3 py-1.5 bg-gray-800 border border-gray-600 rounded text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Chips multi-select de plataforma. */}
        <BibliotecaQuickFilters
          filterSites={filterSites}
          onFilterSitesChange={setFilterSites}
        />

        {/* Filter toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors focus:ring-2 focus:ring-emerald-400 focus:outline-none ${
              showFilters || hasActiveFilters
                ? "bg-emerald-600/20 text-emerald-400"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            <Filter className="w-3 h-3" />
            Filtros
            {hasActiveFilters && (
              <span className="bg-emerald-600 text-white text-xs px-1 rounded-full">!</span>
            )}
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              Limpar
            </button>
          )}
        </div>

        {/* Filtros avancados (chips de site/dia ja estao acima via BibliotecaQuickFilters) */}
        {showFilters && (
          <div className="space-y-2 pt-1">
            <div className="flex gap-2">
              <Select value={filterType || "_all"} onValueChange={(v) => setFilterType(v === "_all" ? "" : v)}>
                <SelectTrigger className="bg-gray-800 border-gray-600 text-xs h-8">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  <SelectItem value="_all">Todos</SelectItem>
                  {types.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterSpeed || "_all"} onValueChange={(v) => setFilterSpeed(v === "_all" ? "" : v)}>
                <SelectTrigger className="bg-gray-800 border-gray-600 text-xs h-8">
                  <SelectValue placeholder="Speed" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  <SelectItem value="_all">Todos</SelectItem>
                  {speeds.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Currency filter */}
            <Select value={filterCurrency || "_all"} onValueChange={(v) => setFilterCurrency(v === "_all" ? "" : v)}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-xs h-8">
                <SelectValue placeholder="Moeda" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                <SelectItem value="_all">Todas as moedas</SelectItem>
                <SelectItem value="USD">USD ($)</SelectItem>
                <SelectItem value="BRL">BRL (R$)</SelectItem>
                <SelectItem value="EUR">EUR (&euro;)</SelectItem>
              </SelectContent>
            </Select>
            {/* Buy-in range */}
            <div className="flex gap-2">
              <Input
                type="number"
                step="0.01"
                value={filterMinBuyIn}
                onChange={(e) => setFilterMinBuyIn(e.target.value)}
                placeholder="Buy-in min"
                className="bg-gray-800 border-gray-600 text-xs h-8 flex-1"
              />
              <Input
                type="number"
                step="0.01"
                value={filterMaxBuyIn}
                onChange={(e) => setFilterMaxBuyIn(e.target.value)}
                placeholder="Buy-in max"
                className="bg-gray-800 border-gray-600 text-xs h-8 flex-1"
              />
            </div>
            {/* Sort */}
            <Select value={sortMode} onValueChange={setSortMode}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-xs h-8">
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                <SelectItem value="platform-buyin">Plataforma + Buy-in</SelectItem>
                <SelectItem value="buyin">Buy-in</SelectItem>
                <SelectItem value="horario">Hor&aacute;rio</SelectItem>
                <SelectItem value="nome">Nome</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Import section */}
      <div className="p-3 border-b border-gray-700 space-y-1.5">
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Importar</div>
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm(true)}
            className="bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700 text-xs h-7"
          >
            <Plus className="w-3 h-3 mr-1" />
            Manual
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImportModal(true)}
            className="bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700 text-xs h-7"
          >
            <Download className="w-3 h-3 mr-1" />
            Historico
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSupremaModal(true)}
            className="bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700 text-xs h-7"
          >
            <Download className="w-3 h-3 mr-1" />
            Suprema
          </Button>
          {/* GP-G (UX 2026-04-24): botao Bodog "Em breve" removido — slot morto ate ter integracao real. */}
        </div>
      </div>

      {/* Manual add form (inline) */}
      {showAddForm && (
        <div className="p-3 border-b border-gray-700 space-y-2 bg-gray-800/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-white">Adicionar Manualmente</span>
            <button
              onClick={() => { setShowAddForm(false); resetAddForm(); }}
              className="text-gray-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <Select value={addSite} onValueChange={setAddSite}>
            <SelectTrigger className="bg-gray-800 border-gray-600 text-xs h-8">
              <SelectValue placeholder="Site *" />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-600">
              {sites.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Nome do torneio *"
            className="bg-gray-800 border-gray-600 text-xs h-8"
          />
          <div className="flex gap-2">
            <Input
              type="number"
              step="0.01"
              value={addBuyIn}
              onChange={(e) => setAddBuyIn(e.target.value)}
              placeholder="Buy-in *"
              className="bg-gray-800 border-gray-600 text-xs h-8 flex-1"
            />
            <Input
              type="time"
              value={addTime}
              onChange={(e) => setAddTime(e.target.value)}
              className="bg-gray-800 border-gray-600 text-xs h-8 w-24"
            />
          </div>
          <div className="flex gap-2">
            <Select value={addType} onValueChange={setAddType}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-xs h-8">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                {types.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={addSpeed} onValueChange={setAddSpeed}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-xs h-8">
                <SelectValue placeholder="Speed" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                {speeds.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            onClick={handleAddSubmit}
            disabled={addMutation.isPending}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7"
          >
            {addMutation.isPending ? "Adicionando..." : "Adicionar"}
          </Button>
        </div>
      )}

      {/* Trash toggle */}
      <div className="px-3 py-1.5 border-b border-gray-700">
        <button
          onClick={() => setShowTrash(!showTrash)}
          className={`flex items-center gap-1.5 text-xs transition-colors ${
            showTrash ? "text-red-400" : "text-gray-400 hover:text-white"
          }`}
        >
          <Trash2 className="w-3 h-3" />
          Lixeira{trashCount > 0 && ` (${trashCount})`}
        </button>
      </div>

      {/* Main list or trash view */}
      {showTrash ? (
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {trashCount === 0 ? (
            <div className="text-center text-gray-500 text-xs py-6">
              Nenhum torneio na lixeira
            </div>
          ) : (
            (trashTournaments as any[]).map((t: any) => (
              <div key={t.id} className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white text-sm">{t.name || t.site}</div>
                    <div className="text-gray-400 text-xs">
                      ${parseFloat(t.buyIn || "0").toFixed(0)} - {t.site}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => restoreMutation.mutate(t.id)}
                      className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-emerald-400 transition-colors"
                      title="Restaurar"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => permanentDeleteMutation.mutate(t.id)}
                      className="p-1.5 rounded hover:bg-red-900/50 text-gray-400 hover:text-red-400 transition-colors"
                      title="Deletar permanentemente"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <Droppable droppableId="library" isDropDisabled={true}>
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="flex-1 overflow-y-auto p-2 space-y-2"
            >
              {libraryLoading ? (
                <div className="text-center text-gray-500 text-xs py-6">Carregando...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center text-gray-500 text-xs py-6">
                  {totalCount === 0 ? (
                    <div className="space-y-2">
                      <p>Biblioteca vazia</p>
                      <p className="text-xs">Use os botoes acima para importar torneios</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p>Nenhum torneio encontrado</p>
                      <button
                        onClick={clearFilters}
                        className="text-emerald-400 hover:text-emerald-300 text-xs"
                      >
                        Limpar filtros
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                filtered.map((t: any, index: number) => (
                  <Draggable key={t.id} draggableId={`library-${t.id}`} index={index}>
                    {(dragProvided) => (
                      <LibraryCard
                        tournament={t}
                        onTrash={(id) => trashMutation.mutate(id)}
                        innerRef={dragProvided.innerRef}
                        draggableProps={dragProvided.draggableProps}
                        dragHandleProps={dragProvided.dragHandleProps}
                      />
                    )}
                  </Draggable>
                ))
              )}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      )}

      {/* Footer counter */}
      <div className="p-2 border-t border-gray-700 text-center text-xs text-gray-400">
        {filtered.length} de {totalCount} torneios
      </div>

      {/* ================================================================= */}
      {/* Import from Grind-Live Modal */}
      {/* ================================================================= */}
      <ImportGrindLiveModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        tournaments={importableTournaments}
        onImport={(selected) => importGrindLiveMutation.mutate(selected)}
        isPending={importGrindLiveMutation.isPending}
      />

      {/* ================================================================= */}
      {/* Suprema Import Modal */}
      {/* ================================================================= */}
      <SupremaImportModal
        open={showSupremaModal}
        onClose={() => setShowSupremaModal(false)}
        onImport={async (selectedTournaments) => {
          if (selectedTournaments && selectedTournaments.length > 0) {
            // Import only selected tournaments
            importGrindLiveMutation.mutate(selectedTournaments);
          } else {
            // Fallback: full sync
            syncSupremaMutation.mutate();
          }
          setShowSupremaModal(false);
        }}
      />
    </div>
  );
}

// =============================================================================
// Import Grind-Live Modal (internal component)
// =============================================================================

function ImportGrindLiveModal({
  open,
  onClose,
  tournaments,
  onImport,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  tournaments: any[];
  onImport: (selected: any[]) => void;
  isPending: boolean;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggleSelect = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === tournaments.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(tournaments.map((_, i) => i)));
    }
  };

  const handleImport = () => {
    const selectedTournaments = tournaments.filter((_, i) => selected.has(i));
    if (selectedTournaments.length > 0) {
      onImport(selectedTournaments);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-emerald-400">Importar do Historico</DialogTitle>
        </DialogHeader>

        <div className="text-xs text-gray-400 mb-2">
          Torneios das ultimas 7 sessoes de grind que ainda nao estao na biblioteca.
        </div>

        {tournaments.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">
            Todas as sessoes ja foram importadas
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={selectAll}
                className="text-xs text-emerald-400 hover:text-emerald-300"
              >
                {selected.size === tournaments.length ? "Desmarcar todos" : "Selecionar todos"}
              </button>
              <span className="text-xs text-gray-500">
                {selected.size} selecionado(s)
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {tournaments.map((t: any, i: number) => (
                <label
                  key={i}
                  className="flex items-center gap-3 p-2 rounded hover:bg-gray-700/50 cursor-pointer"
                >
                  <Checkbox
                    checked={selected.has(i)}
                    onCheckedChange={() => toggleSelect(i)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">
                      {t.name || t.site}
                    </div>
                    <div className="text-xs text-gray-400">
                      ${parseFloat(t.buyIn || "0").toFixed(0)} - {t.site}
                      {t.time && ` - ${t.time}`}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-700 mt-2">
              <Button
                variant="outline"
                onClick={onClose}
                className="bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleImport}
                disabled={selected.size === 0 || isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
              >
                {isPending ? "Importando..." : `Importar (${selected.size})`}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

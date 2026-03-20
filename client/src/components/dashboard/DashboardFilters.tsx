import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Filter, CalendarIcon, ChevronUp, ChevronDown } from "lucide-react";
import type { DashboardFiltersState, AvailableOptions } from './types';

interface DashboardFiltersProps {
  filters: DashboardFiltersState;
  setFilters: React.Dispatch<React.SetStateAction<DashboardFiltersState>>;
  period: string;
  setPeriod: (period: string) => void;
  availableOptions: AvailableOptions;
}

export function DashboardFilters({ filters, setFilters, period, setPeriod, availableOptions }: DashboardFiltersProps) {
  const queryClient = useQueryClient();

  // Custom date range modal state
  const [showDateModal, setShowDateModal] = useState(false);
  const [customDateRange, setCustomDateRange] = useState({
    from: '',
    to: ''
  });
  const [tempDateRange, setTempDateRange] = useState({
    from: '',
    to: ''
  });

  // Temporary filter states for text filters (not applied until button click)
  const [tempKeyword, setTempKeyword] = useState('');
  const [tempKeywordType, setTempKeywordType] = useState<'contains' | 'not_contains'>('contains');
  const [tempParticipantRange, setTempParticipantRange] = useState({ min: '', max: '' });

  // Collapsible filter section state
  const [filtersExpanded, setFiltersExpanded] = useState(true);

  // Functions for custom date range
  const formatDateForDisplay = (date: string) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
  };

  const isValidDateRange = (from: string, to: string) => {
    if (!from || !to) return false;
    return new Date(from) <= new Date(to);
  };

  const handleOpenDateModal = () => {
    const today = new Date();
    const oneMonthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    setTempDateRange({
      from: customDateRange.from || oneMonthAgo.toISOString().split('T')[0],
      to: customDateRange.to || today.toISOString().split('T')[0]
    });
    setShowDateModal(true);
  };

  const handleApplyDateRange = () => {
    if (!isValidDateRange(tempDateRange.from, tempDateRange.to)) {
      return;
    }

    setCustomDateRange(tempDateRange);
    setPeriod('custom');
    setFilters(prev => ({
      ...prev,
      dateFrom: tempDateRange.from,
      dateTo: tempDateRange.to
    }));
    setShowDateModal(false);

    // Invalidar queries principais apenas - mais eficiente
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/analytics"] });
  };

  const handleCancelDateRange = () => {
    setTempDateRange(customDateRange);
    setShowDateModal(false);
  };

  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod);
    if (newPeriod !== 'custom') {
      setFilters(prev => {
        const newFilters = { ...prev };
        delete newFilters.dateFrom;
        delete newFilters.dateTo;
        return newFilters;
      });
    }
  };

  // Quick participant filter handlers - immediate application
  const handleParticipantQuickFilter = (min: number, max?: number) => {
    setFilters(prev => ({
      ...prev,
      participantMin: min,
      participantMax: max
    }));
  };

  // Text filter application handler
  const applyTextFilter = () => {
    if (tempKeyword.trim()) {
      setFilters(prev => ({
        ...prev,
        keyword: tempKeyword.trim(),
        keywordType: tempKeywordType
      }));
    }
  };

  // Manual participant range application handler
  const applyParticipantRange = () => {
    const min = tempParticipantRange.min ? parseInt(tempParticipantRange.min) : undefined;
    const max = tempParticipantRange.max ? parseInt(tempParticipantRange.max) : undefined;

    if (min || max) {
      setFilters(prev => ({
        ...prev,
        participantMin: min,
        participantMax: max
      }));
    }
  };

  // Remove specific filter tag
  const removeFilterTag = (filterType: string) => {
    setFilters(prev => {
      const newFilters = { ...prev };
      if (filterType === 'keyword') {
        delete newFilters.keyword;
        delete newFilters.keywordType;
        setTempKeyword('');
      } else if (filterType === 'participants') {
        delete newFilters.participantMin;
        delete newFilters.participantMax;
        setTempParticipantRange({ min: '', max: '' });
      }
      return newFilters;
    });
  };

  return (
    <div className="bg-gradient-to-br from-poker-surface/50 to-gray-900/50 backdrop-blur-sm border border-gray-700/50 rounded-2xl mb-8 shadow-xl">
      {/* Header fixo - sempre visível */}
      <div className="p-8 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-poker-green/20 rounded-lg">
              <Filter className="h-5 w-5 text-poker-green" />
            </div>
            <h3 className="text-lg font-semibold text-white">Filtros</h3>
          </div>

          {/* Contador de Filtros Ativos */}
          {Object.keys(filters).filter(key => {
            const value = filters[key as keyof typeof filters];
            return value && (Array.isArray(value) ? value.length > 0 : true);
          }).length > 0 && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-poker-green/20 px-3 py-1.5 rounded-lg border border-poker-green/30">
                <div className="w-2 h-2 bg-poker-green rounded-full animate-pulse"></div>
                <span className="text-sm text-poker-green font-medium">
                  {Object.keys(filters).filter(key => {
                    const value = filters[key as keyof typeof filters];
                    return value && (Array.isArray(value) ? value.length > 0 : true);
                  }).length} filtros ativos
                </span>
              </div>
              <button
                onClick={() => setFilters({})}
                className="px-4 py-1.5 text-sm font-medium text-red-400 hover:text-red-300 bg-red-900/20 hover:bg-red-900/30 border border-red-700/30 rounded-lg transition-all duration-200 hover:scale-105"
              >
                Limpar Todos
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Conteúdo dos filtros - colapsável */}
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${filtersExpanded ? 'max-h-none opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="px-8 pb-6 space-y-6">

        {/* Card de Período - Modernizado */}
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 border border-gray-700/50 rounded-xl p-8 mb-12 shadow-2xl">
          <div className="mb-6">
            <h4 className="text-lg font-bold text-white flex items-center gap-3">
              ⚡ Período de Análise
            </h4>
            <p className="text-gray-400 text-sm mt-1">Selecione o período para visualização das métricas</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            {[
              { key: 'current_month', label: 'Mês Atual' },
              { key: 'last_3_months', label: 'Últimos 3M' },
              { key: 'last_6_months', label: 'Últimos 6M' },
              { key: 'current_year', label: 'Ano Atual' },
              { key: 'last_12_months', label: 'Últimos 12M' },
              { key: 'last_24_months', label: 'Últimos 24M' },
              { key: 'last_36_months', label: 'Últimos 36M' },
              { key: 'all', label: 'Tudo' }
            ].map((periodOption) => (
              <button
                key={periodOption.key}
                onClick={() => handlePeriodChange(periodOption.key)}
                className={`px-5 py-4 rounded-xl text-sm font-bold transition-all duration-300 border transform ${
                  period === periodOption.key
                    ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white border-emerald-500 shadow-xl shadow-emerald-500/30 scale-110'
                    : 'bg-gray-800/70 text-gray-300 border-gray-600/50 hover:bg-gray-700/70 hover:text-white hover:border-gray-500 hover:scale-105 hover:shadow-lg'
                }`}
              >
                {periodOption.label}
              </button>
            ))}

            {/* Custom Date Range */}
            <Dialog open={showDateModal} onOpenChange={setShowDateModal}>
              <DialogTrigger asChild>
                <button
                  onClick={handleOpenDateModal}
                  className={`px-5 py-4 rounded-xl text-sm font-bold transition-all duration-300 border flex items-center gap-2 transform ${
                    period === 'custom'
                      ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white border-blue-500 shadow-xl shadow-blue-500/30 scale-110'
                      : 'bg-gray-800/70 text-gray-300 border-gray-600/50 hover:bg-gray-700/70 hover:text-white hover:border-gray-500 hover:scale-105 hover:shadow-lg'
                  }`}
                >
                  <CalendarIcon className="h-4 w-4" />
                  {period === 'custom' && customDateRange.from && customDateRange.to
                    ? `${formatDateForDisplay(customDateRange.from)} - ${formatDateForDisplay(customDateRange.to)}`
                    : 'Personalizado'
                  }
                </button>
              </DialogTrigger>
              <DialogContent className="bg-gray-900 border-gray-700">
                <DialogHeader>
                  <DialogTitle className="text-white">Período Personalizado</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        De:
                      </label>
                      <div className="relative">
                        <Input
                          type="date"
                          value={tempDateRange.from}
                          onChange={(e) => setTempDateRange(prev => ({ ...prev, from: e.target.value }))}
                          className="bg-gray-800 border-gray-600 text-white focus:border-poker-green"
                        />
                        <CalendarIcon className="absolute right-3 top-3 h-4 w-4 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Até:
                      </label>
                      <div className="relative">
                        <Input
                          type="date"
                          value={tempDateRange.to}
                          onChange={(e) => setTempDateRange(prev => ({ ...prev, to: e.target.value }))}
                          className="bg-gray-800 border-gray-600 text-white focus:border-poker-green"
                        />
                        <CalendarIcon className="absolute right-3 top-3 h-4 w-4 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  {/* Validation Message */}
                  {tempDateRange.from && tempDateRange.to && !isValidDateRange(tempDateRange.from, tempDateRange.to) && (
                    <p className="text-red-400 text-sm">
                      A data "De" não pode ser maior que a data "Até"
                    </p>
                  )}

                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      variant="outline"
                      onClick={handleCancelDateRange}
                      className="bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600"
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleApplyDateRange}
                      disabled={!isValidDateRange(tempDateRange.from, tempDateRange.to)}
                      className="bg-poker-green text-white hover:bg-poker-green/90 disabled:opacity-50"
                    >
                      Aplicar
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Filtros Rápidos - Multiple Choice */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Card Sites */}
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-600/50 rounded-xl p-4">
            <div className="mb-3">
              <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                Sites de Poker
              </h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {availableOptions.sites.map(site => (
                <button
                  key={site}
                  onClick={() => {
                    const currentSites = filters.sites || [];
                    const newSites = currentSites.includes(site)
                      ? currentSites.filter(s => s !== site)
                      : [...currentSites, site];
                    setFilters(prev => ({ ...prev, sites: newSites.length > 0 ? newSites : undefined }));
                  }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${
                    (filters.sites || []).includes(site)
                      ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white border-blue-500 shadow-md shadow-blue-500/20'
                      : 'bg-gray-700/50 text-gray-300 border-gray-600/50 hover:bg-gray-600/50 hover:text-white hover:border-gray-500'
                  }`}
                >
                  {site}
                </button>
              ))}
            </div>
          </div>

          {/* Card Categories */}
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-600/50 rounded-xl p-4">
            <div className="mb-3">
              <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide flex items-center gap-2">
                <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                Categorias
              </h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {availableOptions.categories.map(category => (
                <button
                  key={category}
                  onClick={() => {
                    const currentCategories = filters.categories || [];
                    const newCategories = currentCategories.includes(category)
                      ? currentCategories.filter(c => c !== category)
                      : [...currentCategories, category];
                    setFilters(prev => ({ ...prev, categories: newCategories.length > 0 ? newCategories : undefined }));
                  }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${
                    (filters.categories || []).includes(category)
                      ? 'bg-gradient-to-r from-orange-600 to-orange-700 text-white border-orange-500 shadow-md shadow-orange-500/20'
                      : 'bg-gray-700/50 text-gray-300 border-gray-600/50 hover:bg-gray-600/50 hover:text-white hover:border-gray-500'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Card Speeds */}
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-600/50 rounded-xl p-4">
            <div className="mb-3">
              <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide flex items-center gap-2">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                Velocidades
              </h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {availableOptions.speeds.map(speed => (
                <button
                  key={speed}
                  onClick={() => {
                    const currentSpeeds = filters.speeds || [];
                    const newSpeeds = currentSpeeds.includes(speed)
                      ? currentSpeeds.filter(s => s !== speed)
                      : [...currentSpeeds, speed];
                    setFilters(prev => ({ ...prev, speeds: newSpeeds.length > 0 ? newSpeeds : undefined }));
                  }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${
                    (filters.speeds || []).includes(speed)
                      ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white border-purple-500 shadow-md shadow-purple-500/20'
                      : 'bg-gray-700/50 text-gray-300 border-gray-600/50 hover:bg-gray-600/50 hover:text-white hover:border-gray-500'
                  }`}
                >
                  {speed}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filtros de Participantes */}
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-600/50 rounded-xl p-5">
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide flex items-center gap-2">
              <div className="w-2 h-2 bg-cyan-500 rounded-full"></div>
              Filtros por Participantes
            </h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: '<100', min: 0, max: 99 },
              { label: '100-300', min: 100, max: 300 },
              { label: '300-700', min: 300, max: 700 },
              { label: '700-1500', min: 700, max: 1500 },
              { label: '1500-3000', min: 1500, max: 3000 },
              { label: '3000-6000', min: 3000, max: 6000 },
              { label: '6000-12000', min: 6000, max: 12000 },
              { label: '12000+', min: 12000 }
            ].map((range) => (
              <button
                key={range.label}
                onClick={() => handleParticipantQuickFilter(range.min, range.max)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${
                  (filters.participantMin === range.min && filters.participantMax === range.max) ||
                  (filters.participantMin === range.min && !range.max && !filters.participantMax)
                    ? 'bg-gradient-to-r from-cyan-600 to-cyan-700 text-white border-cyan-500 shadow-md shadow-cyan-500/20'
                    : 'bg-gray-700/50 text-gray-300 border-gray-600/50 hover:bg-gray-600/50 hover:text-white hover:border-gray-500'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filtros Especiais - Texto e Range Manual */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Card Filtro de Texto */}
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-600/50 rounded-xl p-5">
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                Busca por Palavra-chave
              </h4>
            </div>
            <div className="space-y-3">
              <div className="flex gap-2">
                <select
                  value={tempKeywordType}
                  onChange={(e) => setTempKeywordType(e.target.value as 'contains' | 'not_contains')}
                  className="bg-gray-700/50 border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-white focus:border-green-500 focus:outline-none transition-colors"
                >
                  <option value="contains">Contém</option>
                  <option value="not_contains">Não Contém</option>
                </select>
                <input
                  type="text"
                  value={tempKeyword}
                  onChange={(e) => setTempKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applyTextFilter()}
                  placeholder="Digite o texto para buscar..."
                  className="flex-1 bg-gray-700/50 border border-gray-600/50 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-400 focus:border-green-500 focus:outline-none transition-colors"
                />
              </div>
              <button
                onClick={applyTextFilter}
                disabled={!tempKeyword.trim()}
                className="w-full px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white font-medium rounded-lg hover:from-green-700 hover:to-green-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed transition-all duration-200 shadow-lg disabled:shadow-none"
              >
                {tempKeyword.trim() ? 'Aplicar Filtro de Texto' : 'Digite uma palavra-chave'}
              </button>
            </div>
          </div>

          {/* Card Range Manual de Participantes */}
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-600/50 rounded-xl p-5">
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide flex items-center gap-2">
                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                Range Manual de Participantes
              </h4>
            </div>
            <div className="space-y-3">
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  value={tempParticipantRange.min}
                  onChange={(e) => setTempParticipantRange(prev => ({ ...prev, min: e.target.value }))}
                  placeholder="Mínimo"
                  className="flex-1 bg-gray-700/50 border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:border-yellow-500 focus:outline-none transition-colors"
                  min="0"
                />
                <span className="text-gray-400 text-sm font-medium">até</span>
                <input
                  type="number"
                  value={tempParticipantRange.max}
                  onChange={(e) => setTempParticipantRange(prev => ({ ...prev, max: e.target.value }))}
                  placeholder="Máximo"
                  className="flex-1 bg-gray-700/50 border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:border-yellow-500 focus:outline-none transition-colors"
                  min="1"
                />
              </div>
              <button
                onClick={applyParticipantRange}
                disabled={!tempParticipantRange.min && !tempParticipantRange.max}
                className="w-full px-4 py-2 bg-gradient-to-r from-yellow-600 to-yellow-700 text-white font-medium rounded-lg hover:from-yellow-700 hover:to-yellow-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed transition-all duration-200 shadow-lg disabled:shadow-none"
              >
                {(tempParticipantRange.min || tempParticipantRange.max) ? 'Aplicar Range Manual' : 'Digite valores mín/máx'}
              </button>
            </div>
          </div>
        </div>

        {/* Tags de Filtros Especiais Ativos */}
        {(filters.keyword || (filters.participantMin !== undefined || filters.participantMax !== undefined)) && (
          <div className="bg-gray-800/30 backdrop-blur-sm border border-gray-600/40 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-poker-green rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-gray-300">Filtros Especiais Ativos:</span>
              </div>

              {filters.keyword && (
                <div className="flex items-center gap-2 bg-gradient-to-r from-green-600/30 to-green-700/30 border border-green-500/40 rounded-lg px-4 py-2 shadow-lg shadow-green-500/10">
                  <span className="text-sm font-medium text-green-200">
                    {filters.keywordType === 'contains' ? 'Contém' : 'Não Contém'}: "{filters.keyword}"
                  </span>
                  <button
                    onClick={() => removeFilterTag('keyword')}
                    className="text-green-300 hover:text-red-400 transition-colors duration-200 font-bold text-lg"
                  >
                    ×
                  </button>
                </div>
              )}

              {(filters.participantMin !== undefined || filters.participantMax !== undefined) && (
                <div className="flex items-center gap-2 bg-gradient-to-r from-yellow-600/30 to-yellow-700/30 border border-yellow-500/40 rounded-lg px-4 py-2 shadow-lg shadow-yellow-500/10">
                  <span className="text-sm font-medium text-yellow-200">
                    Range Manual: {filters.participantMin || '0'} - {filters.participantMax || '\u221e'}
                  </span>
                  <button
                    onClick={() => removeFilterTag('participants')}
                    className="text-yellow-300 hover:text-red-400 transition-colors duration-200 font-bold text-lg"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Botão de Toggle para Expandir/Colapsar */}
      <div className="flex justify-center p-4 pt-0">
        <button
          onClick={() => setFiltersExpanded(!filtersExpanded)}
          className="group flex items-center justify-center w-16 h-10 bg-gradient-to-r from-poker-surface/70 to-gray-800/70 backdrop-blur-sm border border-gray-600/50 rounded-lg hover:from-poker-surface/90 hover:to-gray-800/90 hover:border-gray-500/70 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-poker-green/10"
        >
          {filtersExpanded ? (
            <ChevronUp className="h-6 w-6 text-gray-300 group-hover:text-poker-green transition-all duration-300 transform group-hover:scale-110" />
          ) : (
            <ChevronDown className="h-6 w-6 text-gray-300 group-hover:text-poker-green transition-all duration-300 transform group-hover:scale-110" />
          )}
        </button>
      </div>
    </div>
  );
}

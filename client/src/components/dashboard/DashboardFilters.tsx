import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Filter, CalendarIcon, ChevronUp, ChevronDown, Check, Ban, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { tokens } from "@/lib/ui-tokens";
import {
  BUYIN_BANDS,
  FIELD_BANDS,
  MODIFIER_FILTERS,
} from "@shared/dashboard-filter-bands";
import type {
  DashboardFiltersState,
  AvailableOptions,
  FilterGroupKey,
  FilterMode,
} from './types';

interface DashboardFiltersProps {
  filters: DashboardFiltersState;
  setFilters: React.Dispatch<React.SetStateAction<DashboardFiltersState>>;
  period: string;
  setPeriod: (period: string) => void;
  availableOptions: AvailableOptions;
}

/** Chave do conjunto "excluir" correspondente a cada grupo. */
const EXCLUDE_KEY: Record<FilterGroupKey, keyof DashboardFiltersState> = {
  sites: 'sitesExclude',
  categories: 'categoriesExclude',
  speeds: 'speedsExclude',
  buyinBands: 'buyinBandsExclude',
  fieldBands: 'fieldBandsExclude',
  modifiers: 'modifiersExclude',
};

const GROUP_LABEL: Record<FilterGroupKey, string> = {
  sites: 'Site',
  categories: 'Tipo',
  speeds: 'Velocidade',
  buyinBands: 'ABI (buy-in)',
  fieldBands: 'Participantes',
  modifiers: 'Especiais',
};

const PERIOD_OPTIONS = [
  { key: 'current_month', label: 'Mês Atual' },
  { key: 'last_3_months', label: 'Últimos 3M' },
  { key: 'last_6_months', label: 'Últimos 6M' },
  { key: 'current_year', label: 'Ano Atual' },
  { key: 'last_12_months', label: 'Últimos 12M' },
  { key: 'last_24_months', label: 'Últimos 24M' },
  { key: 'last_36_months', label: 'Últimos 36M' },
  { key: 'all', label: 'Tudo' },
];

/** Quantos filtros o jogador tem ligados (arrays vazios nao contam). */
export function countActiveFilters(filters: DashboardFiltersState): number {
  return Object.entries(filters).filter(([key, value]) => {
    if (key === 'keywordType') return false; // acompanha `keyword`, nao conta sozinho
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') {
      return Object.values(value).some((v) => v !== undefined && v !== null && v !== '');
    }
    return value !== undefined && value !== null && value !== '';
  }).length;
}

export function DashboardFilters({ filters, setFilters, period, setPeriod, availableOptions }: DashboardFiltersProps) {
  const queryClient = useQueryClient();

  const [showDateModal, setShowDateModal] = useState(false);
  const [customDateRange, setCustomDateRange] = useState({ from: '', to: '' });
  const [tempDateRange, setTempDateRange] = useState({ from: '', to: '' });

  const [tempKeyword, setTempKeyword] = useState('');
  const [tempKeywordType, setTempKeywordType] = useState<'contains' | 'not_contains'>('contains');
  const [tempParticipantRange, setTempParticipantRange] = useState({ min: '', max: '' });
  const [tempBuyinRange, setTempBuyinRange] = useState({ min: '', max: '' });

  const [filtersExpanded, setFiltersExpanded] = useState(false);

  /**
   * Modo do painel. Enquanto estiver em "Excluir", clicar numa opcao manda ela
   * para o conjunto de exclusao em vez do de inclusao.
   */
  const [mode, setMode] = useState<FilterMode>('include');

  const activeCount = countActiveFilters(filters);

  // ── Invalidacao ──────────────────────────────────────────────────────────
  // As tabs usam chaves distintas (/api/analytics/by-site, by-buyin, ...), entao
  // invalidar por queryKey ["/api/analytics"] NAO casa. Usa predicate de prefixo.
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    queryClient.invalidateQueries({
      predicate: (query) => {
        const first = query.queryKey?.[0];
        return typeof first === "string" && first.startsWith("/api/analytics");
      },
    });
  };

  // ── Datas ────────────────────────────────────────────────────────────────
  const formatDateForDisplay = (date: string) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
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
      to: customDateRange.to || today.toISOString().split('T')[0],
    });
    setShowDateModal(true);
  };

  const handleApplyDateRange = () => {
    if (!isValidDateRange(tempDateRange.from, tempDateRange.to)) return;
    setCustomDateRange(tempDateRange);
    setPeriod('custom');
    setFilters(prev => ({ ...prev, dateFrom: tempDateRange.from, dateTo: tempDateRange.to }));
    setShowDateModal(false);
    invalidateAll();
  };

  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod);
    if (newPeriod !== 'custom') {
      setFilters(prev => {
        const next = { ...prev };
        delete next.dateFrom;
        delete next.dateTo;
        return next;
      });
    }
  };

  // ── Selecao de opcao (o coracao do Incluir/Excluir) ──────────────────────
  const stateOf = (group: FilterGroupKey, value: string): 'included' | 'excluded' | 'neutral' => {
    if ((filters[group] as string[] | undefined)?.includes(value)) return 'included';
    if ((filters[EXCLUDE_KEY[group]] as string[] | undefined)?.includes(value)) return 'excluded';
    return 'neutral';
  };

  /**
   * Clique numa opcao:
   *  - ja esta no conjunto do modo atual  -> sai (volta a neutro)
   *  - nao esta                            -> entra no modo atual e sai do outro
   *
   * Uma opcao nunca fica incluida e excluida ao mesmo tempo.
   */
  const toggleOption = (group: FilterGroupKey, value: string) => {
    const includeKey = group;
    const excludeKey = EXCLUDE_KEY[group];
    setFilters(prev => {
      const included = new Set((prev[includeKey] as string[] | undefined) ?? []);
      const excluded = new Set((prev[excludeKey] as string[] | undefined) ?? []);
      const target = mode === 'include' ? included : excluded;
      const other = mode === 'include' ? excluded : included;

      if (target.has(value)) {
        target.delete(value);
      } else {
        target.add(value);
        other.delete(value);
      }

      const next: DashboardFiltersState = { ...prev };
      if (included.size > 0) (next as any)[includeKey] = Array.from(included);
      else delete (next as any)[includeKey];
      if (excluded.size > 0) (next as any)[excludeKey] = Array.from(excluded);
      else delete (next as any)[excludeKey];
      return next;
    });
  };

  const clearGroup = (group: FilterGroupKey) => {
    setFilters(prev => {
      const next = { ...prev };
      delete (next as any)[group];
      delete (next as any)[EXCLUDE_KEY[group]];
      return next;
    });
  };

  // ── Faixas manuais ───────────────────────────────────────────────────────
  const applyParticipantRange = () => {
    const min = tempParticipantRange.min ? parseInt(tempParticipantRange.min, 10) : undefined;
    const max = tempParticipantRange.max ? parseInt(tempParticipantRange.max, 10) : undefined;
    if (min === undefined && max === undefined) return;
    setFilters(prev => ({ ...prev, participantMin: min, participantMax: max }));
  };

  const applyBuyinRange = () => {
    const min = tempBuyinRange.min ? parseFloat(tempBuyinRange.min) : undefined;
    const max = tempBuyinRange.max ? parseFloat(tempBuyinRange.max) : undefined;
    if (min === undefined && max === undefined) return;
    setFilters(prev => ({ ...prev, buyinRange: { min, max } }));
  };

  const applyTextFilter = () => {
    if (!tempKeyword.trim()) return;
    setFilters(prev => ({ ...prev, keyword: tempKeyword.trim(), keywordType: tempKeywordType }));
  };

  // ── Resumo dos filtros ligados ───────────────────────────────────────────
  const labelForOption = (group: FilterGroupKey, value: string): string => {
    if (group === 'buyinBands') return BUYIN_BANDS.find(b => b.id === value)?.label ?? value;
    if (group === 'fieldBands') return FIELD_BANDS.find(b => b.id === value)?.label ?? value;
    if (group === 'modifiers') return MODIFIER_FILTERS.find(m => m.id === value)?.label ?? value;
    return value;
  };

  const activeChips: Array<{ key: string; label: string; onRemove: () => void; excluded: boolean }> = [];
  (Object.keys(EXCLUDE_KEY) as FilterGroupKey[]).forEach(group => {
    ((filters[group] as string[] | undefined) ?? []).forEach(value => {
      activeChips.push({
        key: `${group}-inc-${value}`,
        label: `${GROUP_LABEL[group]}: ${labelForOption(group, value)}`,
        excluded: false,
        onRemove: () => { setMode('include'); toggleOption(group, value); },
      });
    });
    ((filters[EXCLUDE_KEY[group]] as string[] | undefined) ?? []).forEach(value => {
      activeChips.push({
        key: `${group}-exc-${value}`,
        label: `${GROUP_LABEL[group]}: ${labelForOption(group, value)}`,
        excluded: true,
        onRemove: () => { setMode('exclude'); toggleOption(group, value); },
      });
    });
  });
  if (filters.participantMin !== undefined || filters.participantMax !== undefined) {
    activeChips.push({
      key: 'participants-manual',
      label: `Participantes: ${filters.participantMin ?? '0'}–${filters.participantMax ?? '∞'}`,
      excluded: false,
      onRemove: () => {
        setTempParticipantRange({ min: '', max: '' });
        setFilters(prev => {
          const next = { ...prev };
          delete next.participantMin;
          delete next.participantMax;
          return next;
        });
      },
    });
  }
  if (filters.buyinRange?.min !== undefined || filters.buyinRange?.max !== undefined) {
    activeChips.push({
      key: 'buyin-manual',
      label: `Buy-in: $${filters.buyinRange?.min ?? '0'}–$${filters.buyinRange?.max ?? '∞'}`,
      excluded: false,
      onRemove: () => {
        setTempBuyinRange({ min: '', max: '' });
        setFilters(prev => {
          const next = { ...prev };
          delete next.buyinRange;
          return next;
        });
      },
    });
  }
  if (filters.keyword) {
    activeChips.push({
      key: 'keyword',
      label: `Nome ${filters.keywordType === 'not_contains' ? 'não contém' : 'contém'}: "${filters.keyword}"`,
      excluded: filters.keywordType === 'not_contains',
      onRemove: () => {
        setTempKeyword('');
        setFilters(prev => {
          const next = { ...prev };
          delete next.keyword;
          delete next.keywordType;
          return next;
        });
      },
    });
  }

  // ── Bloco reutilizavel de opcoes ─────────────────────────────────────────
  const OptionGroup = ({
    group,
    options,
    hint,
  }: {
    group: FilterGroupKey;
    options: Array<{ id: string; label: string }>;
    hint?: string;
  }) => {
    const hasSelection =
      ((filters[group] as string[] | undefined)?.length ?? 0) > 0 ||
      ((filters[EXCLUDE_KEY[group]] as string[] | undefined)?.length ?? 0) > 0;

    return (
      <div className="space-y-2" data-testid={`filter-group-${group}`}>
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-foreground">
            {GROUP_LABEL[group]}
            {hint && <span className="ml-2 text-xs text-muted-foreground font-normal">{hint}</span>}
          </h4>
          {hasSelection && (
            <button
              onClick={() => clearGroup(group)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              limpar
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {options.length === 0 && (
            <span className="text-xs text-muted-foreground">Nenhuma opção no histórico.</span>
          )}
          {options.map(option => {
            const state = stateOf(group, option.id);
            return (
              <button
                key={option.id}
                onClick={() => toggleOption(group, option.id)}
                data-testid={`filter-option-${group}-${option.id}`}
                data-state={state}
                title={
                  state === 'included' ? 'Incluído — clique para tirar'
                    : state === 'excluded' ? 'Excluído — clique para tirar'
                    : mode === 'include' ? 'Clique para incluir' : 'Clique para excluir'
                }
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs font-medium transition-all',
                  state === 'neutral' &&
                    'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
                  state === 'included' &&
                    cn(tokens.color.success.bg, tokens.color.success.text, tokens.color.success.border),
                  state === 'excluded' &&
                    cn(tokens.color.danger.bg, tokens.color.danger.text, tokens.color.danger.border, 'line-through'),
                )}
              >
                {state === 'included' && <Check className="h-3 w-3" />}
                {state === 'excluded' && <Ban className="h-3 w-3" />}
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  /** Par de campos min/max + botao, compacto, para colar embaixo das faixas. */
  const RangeInputs = ({
    value,
    onChange,
    onApply,
    prefix,
    testId,
  }: {
    value: { min: string; max: string };
    onChange: (v: { min: string; max: string }) => void;
    onApply: () => void;
    prefix?: string;
    testId: string;
  }) => (
    <div className="flex items-center gap-1.5" data-testid={testId}>
      <span className="text-xs text-muted-foreground whitespace-nowrap">ou de</span>
      <Input
        type="number"
        placeholder={prefix ? `${prefix}min` : 'mín'}
        value={value.min}
        onChange={(e) => onChange({ ...value, min: e.target.value })}
        className="h-7 w-20 text-xs px-2"
      />
      <span className="text-xs text-muted-foreground">a</span>
      <Input
        type="number"
        placeholder={prefix ? `${prefix}máx` : 'máx'}
        value={value.max}
        onChange={(e) => onChange({ ...value, max: e.target.value })}
        className="h-7 w-20 text-xs px-2"
      />
      <Button size="sm" variant="outline" onClick={onApply} className="h-7 px-2 text-xs">
        Aplicar
      </Button>
    </div>
  );

  return (
    <div className="bg-card/50 backdrop-blur-sm border border-border rounded-2xl mb-8 shadow-xl">
      {/* ── Cabecalho ───────────────────────────────────────────────────── */}
      <div className="p-5 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/20 rounded-lg">
              <Filter className="h-5 w-5 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Filtros</h3>

            {/* Modo: define o que o clique numa opcao faz. */}
            <div className="flex items-center rounded-lg border border-border overflow-hidden" data-testid="filter-mode-switch">
              {(['include', 'exclude'] as FilterMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  data-testid={`filter-mode-${m}`}
                  aria-pressed={mode === m}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium transition-colors',
                    mode === m
                      ? m === 'include'
                        ? cn(tokens.color.success.bg, tokens.color.success.text)
                        : cn(tokens.color.danger.bg, tokens.color.danger.text)
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {m === 'include' ? 'Incluir' : 'Excluir'}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground hidden md:inline">
              {mode === 'include'
                ? 'clicando numa opção, só ela entra na conta'
                : 'clicando numa opção, ela sai da conta'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {activeCount > 0 && (
              <>
                <div className="flex items-center gap-2 bg-primary/20 px-3 py-1.5 rounded-lg border border-primary/30">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                  <span className="text-sm text-primary font-medium" data-testid="filter-active-count">
                    {activeCount} {activeCount === 1 ? 'filtro ativo' : 'filtros ativos'}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setFilters({});
                    setTempParticipantRange({ min: '', max: '' });
                    setTempBuyinRange({ min: '', max: '' });
                    setTempKeyword('');
                  }}
                  data-testid="filter-clear-all"
                  className={cn(
                    'px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors',
                    tokens.color.danger.text, tokens.color.danger.bg, tokens.color.danger.border,
                  )}
                >
                  Limpar todos
                </button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFiltersExpanded(v => !v)}
              data-testid="filter-toggle-expand"
              className="text-muted-foreground hover:text-foreground"
            >
              {filtersExpanded ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
              {filtersExpanded ? 'Recolher' : 'Mais filtros'}
            </Button>
          </div>
        </div>

        {/* ── Etiquetas do que esta ligado ─────────────────────────────── */}
        {activeChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3" data-testid="filter-active-chips">
            {activeChips.map(chip => (
              <button
                key={chip.key}
                onClick={chip.onRemove}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border transition-opacity hover:opacity-70',
                  chip.excluded
                    ? cn(tokens.color.danger.bg, tokens.color.danger.text, tokens.color.danger.border)
                    : cn(tokens.color.success.bg, tokens.color.success.text, tokens.color.success.border),
                )}
              >
                {chip.excluded && <Ban className="h-3 w-3" />}
                {chip.label}
                <X className="h-3 w-3" />
              </button>
            ))}
          </div>
        )}

        {/* ── Periodo (sempre visivel) ─────────────────────────────────── */}
        <div className="mt-4 space-y-2">
          <h4 className="text-sm font-medium text-foreground">Período</h4>
          <div className="flex flex-wrap gap-1.5">
            {PERIOD_OPTIONS.map(option => (
              <button
                key={option.key}
                onClick={() => handlePeriodChange(option.key)}
                data-testid={`filter-period-${option.key}`}
                className={cn(
                  'px-2.5 py-1 rounded-md border text-xs font-medium transition-all',
                  period === option.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
                )}
              >
                {option.label}
              </button>
            ))}
            <button
              onClick={handleOpenDateModal}
              data-testid="filter-period-custom"
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs font-medium transition-all',
                period === 'custom'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
              )}
            >
              <CalendarIcon className="h-3 w-3" />
              {period === 'custom' && customDateRange.from
                ? `${formatDateForDisplay(customDateRange.from)} – ${formatDateForDisplay(customDateRange.to)}`
                : 'Escolher datas'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Corpo colapsavel ────────────────────────────────────────────── */}
      {filtersExpanded && (
        <div className="px-5 pb-5 pt-1 border-t border-border grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-5">
          <OptionGroup
            group="sites"
            options={availableOptions.sites.map(s => ({ id: s, label: s }))}
          />
          <OptionGroup
            group="categories"
            options={availableOptions.categories.map(c => ({ id: c, label: c }))}
          />
          <OptionGroup
            group="speeds"
            options={availableOptions.speeds.map(s => ({ id: s, label: s }))}
          />
          <OptionGroup
            group="modifiers"
            options={MODIFIER_FILTERS.map(m => ({ id: m.id, label: m.label }))}
            hint="satélite e flight são independentes do Tipo"
          />

          <div className="space-y-2">
            <OptionGroup
              group="buyinBands"
              options={BUYIN_BANDS.map(b => ({ id: b.id, label: b.label }))}
            />
            <RangeInputs
              value={tempBuyinRange}
              onChange={setTempBuyinRange}
              onApply={applyBuyinRange}
              prefix="$"
              testId="filter-buyin-manual"
            />
          </div>

          <div className="space-y-2">
            <OptionGroup
              group="fieldBands"
              options={FIELD_BANDS.map(b => ({ id: b.id, label: b.label }))}
            />
            <RangeInputs
              value={tempParticipantRange}
              onChange={setTempParticipantRange}
              onApply={applyParticipantRange}
              testId="filter-participants-manual"
            />
          </div>

          {/* Nome do torneio */}
          <div className="space-y-2 lg:col-span-2">
            <h4 className="text-sm font-medium text-foreground">Nome do torneio</h4>
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                value={tempKeywordType}
                onChange={(e) => setTempKeywordType(e.target.value as 'contains' | 'not_contains')}
                data-testid="filter-keyword-type"
                className="h-7 rounded-md border border-border bg-background text-foreground text-xs px-2"
              >
                <option value="contains">Contém</option>
                <option value="not_contains">Não contém</option>
              </select>
              <Input
                value={tempKeyword}
                onChange={(e) => setTempKeyword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyTextFilter(); }}
                placeholder="ex: Bounty Hunter"
                data-testid="filter-keyword-input"
                className="h-7 w-56 text-xs px-2"
              />
              <Button size="sm" variant="outline" onClick={applyTextFilter} className="h-7 px-2 text-xs">
                Aplicar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de datas ──────────────────────────────────────────────── */}
      <Dialog open={showDateModal} onOpenChange={setShowDateModal}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Período personalizado</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">De</label>
              <Input
                type="date"
                value={tempDateRange.from}
                onChange={(e) => setTempDateRange(prev => ({ ...prev, from: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Até</label>
              <Input
                type="date"
                value={tempDateRange.to}
                onChange={(e) => setTempDateRange(prev => ({ ...prev, to: e.target.value }))}
              />
            </div>
            {!isValidDateRange(tempDateRange.from, tempDateRange.to) && (tempDateRange.from || tempDateRange.to) && (
              <p className={cn('text-xs', tokens.color.danger.text)}>
                A data inicial precisa ser anterior à final.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDateModal(false)}>Cancelar</Button>
              <Button
                onClick={handleApplyDateRange}
                disabled={!isValidDateRange(tempDateRange.from, tempDateRange.to)}
              >
                Aplicar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

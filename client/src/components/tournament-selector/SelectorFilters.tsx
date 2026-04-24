/**
 * Tournament Selector — SelectorFilters
 *
 * Painel de filtros do widget. Atualiza o estado pai (controlled component).
 */

import { Card, CardContent } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { Slider } from '../ui/slider';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import type { TournamentSelectorFilters } from '../../hooks/useTournamentSelector';

export interface SelectorFiltersProps {
  filters: TournamentSelectorFilters;
  onChange: (next: TournamentSelectorFilters) => void;
  bankrollConfigured: boolean;
}

const SOURCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'suprema,library', label: 'Suprema + Biblioteca' },
  { value: 'suprema', label: 'Apenas Suprema' },
  { value: 'library', label: 'Apenas Biblioteca' },
];

const LOOKBACK_OPTIONS = [
  { value: 30, label: 'Ultimos 30 dias' },
  { value: 90, label: 'Ultimos 90 dias' },
  { value: 180, label: 'Ultimos 180 dias' },
  { value: 365, label: 'Ultimo ano' },
];

export function SelectorFilters({ filters, onChange, bankrollConfigured }: SelectorFiltersProps) {
  const set = (patch: Partial<TournamentSelectorFilters>) => onChange({ ...filters, ...patch });

  return (
    <Card data-testid="selector-filters">
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="selector-date">Data</Label>
            <Input
              id="selector-date"
              type="date"
              value={filters.date ?? ''}
              onChange={(e) => set({ date: e.target.value })}
              data-testid="selector-filter-date"
            />
          </div>

          <div>
            <Label htmlFor="selector-sources">Fonte</Label>
            <Select
              value={filters.sources ?? 'suprema,library'}
              onValueChange={(v) => set({ sources: v })}
            >
              <SelectTrigger id="selector-sources" data-testid="selector-filter-sources">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="selector-lookback">Lookback</Label>
            <Select
              value={String(filters.lookbackDays ?? 90)}
              onValueChange={(v) => set({ lookbackDays: parseInt(v, 10) })}
            >
              <SelectTrigger id="selector-lookback" data-testid="selector-filter-lookback">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOOKBACK_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={String(s.value)}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Score minimo: {filters.minScore ?? 0}</Label>
            <Slider
              value={[filters.minScore ?? 0]}
              onValueChange={(v) => set({ minScore: v[0] })}
              min={0}
              max={100}
              step={5}
              data-testid="selector-filter-min-score"
            />
          </div>

          <div>
            <Label>Sample minimo (buy-in/categoria): {filters.minSample ?? 0}</Label>
            <Slider
              value={[filters.minSample ?? 0]}
              onValueChange={(v) => set({ minSample: v[0] })}
              min={0}
              max={100}
              step={5}
              data-testid="selector-filter-min-sample"
            />
          </div>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="selector-bankroll" className={bankrollConfigured ? '' : 'text-muted-foreground'}>
                    Filtrar por bankroll
                  </Label>
                  <Switch
                    id="selector-bankroll"
                    checked={!!filters.bankrollFilter && bankrollConfigured}
                    onCheckedChange={(v) => set({ bankrollFilter: v })}
                    disabled={!bankrollConfigured}
                    data-testid="selector-filter-bankroll"
                  />
                </div>
              </TooltipTrigger>
              {!bankrollConfigured && (
                <TooltipContent>
                  Configure seu bankroll em /settings para habilitar este filtro.
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}

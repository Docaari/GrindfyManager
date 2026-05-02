/**
 * Sprint UI-FND-1 — RF-03: FilterChip + FilterChipGroup (canonico Foundation)
 *
 * Spec: Docs/specs/ui-fnd-1-foundation.md (RF-03 + D9)
 * ADR:  Docs/architecture/decisions/078-design-tokens-ui-patterns.md (secao 2.2)
 *
 * Chip removivel para representar 1 filtro ativo. Helper opcional
 * FilterChipGroup renderiza lista + botao "Limpar tudo" (so aparece com >=2
 * chips E onClearAll definido).
 *
 * Lessons aplicadas:
 *   #11 onRemove obrigatorio (chip sempre removivel — sem default decorativo).
 *   #2  data-testid estavel.
 */

import React from 'react';
import { X } from 'lucide-react';
import { tokens, type ColorKey } from '@/lib/ui-tokens';
import { cn } from '@/lib/utils';

export type FilterChipVariant = 'default' | 'subtle';

export interface FilterChipProps {
  label: string;
  onRemove: () => void;
  variant?: FilterChipVariant;
  tone?: ColorKey;
  /** Se passado, gera data-testid="filter-chip-{keyId}". Senao, "filter-chip". */
  keyId?: string;
}

export function FilterChip({
  label,
  onRemove,
  variant = 'default',
  tone = 'neutral',
  keyId,
}: FilterChipProps) {
  const swatch = tokens.color[tone];
  const testId = keyId ? `filter-chip-${keyId}` : 'filter-chip';

  return (
    <span
      data-testid={testId}
      data-tone={tone}
      data-variant={variant}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        'transition-colors',
        swatch.bg,
        swatch.text,
        swatch.border,
        variant === 'subtle' && 'opacity-80',
      )}
    >
      <span>{label}</span>
      <button
        type="button"
        aria-label={`Remover filtro ${label}`}
        onClick={onRemove}
        className={cn(
          'inline-flex items-center justify-center rounded-full',
          'min-w-[24px] min-h-[24px] -mr-1',
          'hover:bg-white/10 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}

export interface FilterChipGroupChip {
  key: string;
  label: string;
  onRemove: () => void;
  tone?: ColorKey;
  variant?: FilterChipVariant;
}

export interface FilterChipGroupProps {
  chips: FilterChipGroupChip[];
  onClearAll?: () => void;
}

export function FilterChipGroup({ chips, onClearAll }: FilterChipGroupProps) {
  if (chips.length === 0) {
    return null;
  }

  const showClearAll = !!onClearAll && chips.length > 1;

  return (
    <div
      data-testid="filter-chip-group"
      className="flex flex-wrap items-center gap-2"
    >
      {chips.map((chip) => (
        <FilterChip
          key={chip.key}
          keyId={chip.key}
          label={chip.label}
          onRemove={chip.onRemove}
          tone={chip.tone}
          variant={chip.variant}
        />
      ))}
      {showClearAll && (
        <button
          type="button"
          data-testid="filter-chip-clear-all"
          onClick={onClearAll}
          className={cn(
            'inline-flex items-center rounded-md px-2 py-1 text-xs font-medium',
            'text-muted-foreground hover:text-foreground hover:bg-muted',
            'transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          Limpar tudo
        </button>
      )}
    </div>
  );
}

export default FilterChip;

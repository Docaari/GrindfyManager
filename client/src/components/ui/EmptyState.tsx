/**
 * Sprint UI-FND-1 — RF-02: EmptyState (canonico Foundation)
 *
 * Spec: Docs/specs/ui-fnd-1-foundation.md (RF-02 + D8)
 * ADR:  Docs/architecture/decisions/078-design-tokens-ui-patterns.md (secao 2.2)
 *
 * Empty state padronizado com icone opcional, titulo, descricao, CTA obrigatorio
 * e link secundario opcional. Variantes: default (centralizado, padding amplo)
 * e compact (inline, padding reduzido).
 *
 * Lessons aplicadas:
 *   #11 ctaAction obrigatorio (sem default decorativo).
 *   #2  data-testid estavel (empty-state, empty-state-cta, empty-state-secondary-link).
 *   #9  telemetria silenciosa (try/catch nunca propaga).
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { tokens } from '@/lib/ui-tokens';

export type EmptyStateVariant = 'default' | 'compact';
export type EmptyStateIconSize = 'sm' | 'md' | 'lg';

/**
 * Catalog of EmptyState areas for telemetry tagging. Add a new entry here when
 * you introduce an empty state in a new domain (keeps ui.empty_state_cta_clicked
 * events queryable). Use `'generic'` only for one-off cases.
 */
export const EMPTY_STATE_AREAS = [
  'generic',
  'studies',
  'library',
  'upload',
  'grind-history',
  'coach-conversations',
  'bankroll-wallets',
  'biblioteca',
] as const;
export type EmptyStateArea = (typeof EMPTY_STATE_AREAS)[number];

interface TelemetryClient {
  track?: (event: string, payload?: Record<string, unknown>) => void;
}

export interface EmptyStateSecondaryLink {
  label: string;
  href: string;
}

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  ctaLabel: string;
  ctaAction: () => void;
  secondaryLink?: EmptyStateSecondaryLink;
  variant?: EmptyStateVariant;
  iconSize?: EmptyStateIconSize;
  area?: EmptyStateArea;
}

const ICON_SIZE_CLASS: Record<EmptyStateIconSize, string> = {
  sm: 'w-8 h-8',
  md: 'w-16 h-16',
  lg: 'w-24 h-24',
};

export function EmptyState({
  icon,
  title,
  description,
  ctaLabel,
  ctaAction,
  secondaryLink,
  variant = 'default',
  iconSize = 'md',
  area = 'generic',
}: EmptyStateProps) {
  const handleClick = () => {
    try {
      const telemetry =
        typeof window !== 'undefined'
          ? (window as unknown as { __telemetry?: TelemetryClient }).__telemetry
          : undefined;
      if (telemetry?.track) {
        telemetry.track('ui.empty_state_cta_clicked', { area });
      } else if (
        typeof process !== 'undefined' &&
        process.env?.NODE_ENV !== 'production'
      ) {
        // RF-13 (N5) — log antes de fallback (lesson #9). Dev-only para nao
        // poluir prod. console.debug eh silenciado por padrao em devtools.
        // eslint-disable-next-line no-console
        console.debug(
          '[EmptyState] telemetry skipped: window.__telemetry unavailable',
          { area },
        );
      }
    } catch (err) {
      if (
        typeof process !== 'undefined' &&
        process.env?.NODE_ENV !== 'production'
      ) {
        // eslint-disable-next-line no-console
        console.debug('[EmptyState] telemetry error:', err, { area });
      }
      // telemetria sem panico (lesson #9)
    }
    ctaAction();
  };

  const isCompact = variant === 'compact';

  return (
    <div
      data-testid="empty-state"
      data-area={area}
      data-variant={variant}
      role="status"
      className={cn(
        'flex flex-col items-center justify-center text-center mx-auto',
        isCompact ? 'py-8 px-4 max-w-md' : 'py-16 px-6 max-w-xl',
      )}
    >
      {icon && (
        <div
          data-testid="empty-state-icon-wrapper"
          className={cn(
            'mb-4 opacity-60 text-muted-foreground flex items-center justify-center',
            ICON_SIZE_CLASS[iconSize],
          )}
        >
          {icon}
        </div>
      )}
      <h3
        className={cn(
          'font-semibold text-foreground mb-2',
          isCompact ? 'text-base' : 'text-lg',
        )}
      >
        {title}
      </h3>
      {/* RF-09 (N1) — uso semantico de tokens.font para validar link */}
      <p
        className="text-muted-foreground mb-6"
        style={{ fontSize: tokens.font.sm }}
      >
        {description}
      </p>
      <Button
        data-testid="empty-state-cta"
        onClick={handleClick}
        aria-label={ctaLabel}
      >
        {ctaLabel}
      </Button>
      {secondaryLink && (
        <a
          data-testid="empty-state-secondary-link"
          href={secondaryLink.href}
          className="mt-3 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {secondaryLink.label}
        </a>
      )}
    </div>
  );
}

export default EmptyState;

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
import { track } from '@/lib/telemetry';

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
  'library-filters-empty',
  'library-no-groups',
  'upload',
  'upload-history-empty',
  'grind-history',
  'grind-session-history-empty',
  'coach-conversations',
  'bankroll-wallets',
  'biblioteca',
  'grade-planner-empty',
  'grind-live-empty',
  'bankroll-empty',
] as const;
export type EmptyStateArea = (typeof EMPTY_STATE_AREAS)[number];

interface TelemetryClient {
  track?: (event: string, payload?: Record<string, unknown>) => void;
}

export interface EmptyStateSecondaryLink {
  label: string;
  href: string;
}

/**
 * Sprint UX-QW-2 RF-01 — slot opcional para "acao secundaria que dispara
 * callback JS" (ex: abrir dialog, navegar via Wouter). Coexiste com
 * `secondaryLink` (anchor). Quando ambos definidos, CTA renderiza primeiro.
 */
export interface EmptyStateSecondaryCTA {
  label: string;
  onClick: () => void;
  ariaLabel?: string;
}

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  ctaLabel: string;
  ctaAction: () => void;
  secondaryLink?: EmptyStateSecondaryLink;
  secondaryCTA?: EmptyStateSecondaryCTA;
  variant?: EmptyStateVariant;
  iconSize?: EmptyStateIconSize;
  area?: EmptyStateArea;
  /**
   * Sprint UX-QW-3 RF-05 — quando definido, clique no secondaryCTA tambem
   * dispara `track('empty_state.secondary_cta_click', { context })` no
   * pipeline oficial (`@/lib/telemetry`). Coexiste com o pipeline legado
   * `window.__telemetry` (RF-01 UX-QW-2). Sem context, nao dispara.
   */
  telemetryContext?: string;
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
  secondaryCTA,
  variant = 'default',
  iconSize = 'md',
  area = 'generic',
  telemetryContext,
}: EmptyStateProps) {
  const fireTelemetry = (event: string) => {
    try {
      const telemetry =
        typeof window !== 'undefined'
          ? (window as unknown as { __telemetry?: TelemetryClient }).__telemetry
          : undefined;
      if (telemetry?.track) {
        telemetry.track(event, { area });
      } else if (
        typeof process !== 'undefined' &&
        process.env?.NODE_ENV !== 'production'
      ) {
        // eslint-disable-next-line no-console
        console.debug(`[EmptyState] telemetry skipped: ${event}`, { area });
      }
    } catch (err) {
      if (
        typeof process !== 'undefined' &&
        process.env?.NODE_ENV !== 'production'
      ) {
        // eslint-disable-next-line no-console
        console.debug('[EmptyState] telemetry error:', err, { area, event });
      }
      // telemetria sem panico (lesson #9)
    }
  };

  const handleClick = () => {
    fireTelemetry('ui.empty_state_cta_clicked');
    ctaAction();
  };

  const handleSecondaryClick = () => {
    fireTelemetry('ui.empty_state_secondary_cta_clicked');
    // RF-05 (UX-QW-3): pipeline oficial `@/lib/telemetry` quando contexto definido.
    if (telemetryContext) {
      try {
        track('empty_state.secondary_cta_click', { context: telemetryContext });
      } catch {
        // telemetria sem panico (lesson #9).
      }
    }
    secondaryCTA?.onClick();
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
      <div className="flex flex-col sm:flex-row items-center gap-2">
        <Button
          data-testid="empty-state-cta"
          onClick={handleClick}
          aria-label={ctaLabel}
        >
          {ctaLabel}
        </Button>
        {secondaryCTA && (
          <Button
            data-testid="empty-state-secondary-cta"
            variant="ghost"
            onClick={handleSecondaryClick}
            aria-label={secondaryCTA.ariaLabel ?? secondaryCTA.label}
          >
            {secondaryCTA.label}
          </Button>
        )}
      </div>
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

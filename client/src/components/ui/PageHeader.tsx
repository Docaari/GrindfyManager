/**
 * Sprint UI-FND-1 — RF-04: PageHeader (canonico Foundation)
 *
 * Spec: Docs/specs/ui-fnd-1-foundation.md (RF-04 + D10)
 * ADR:  Docs/architecture/decisions/078-design-tokens-ui-patterns.md (secao 2.2 + R5)
 *
 * Header consistente para topo de paginas. Layout 2 colunas em desktop
 * (titulo+subtitle a esquerda, actions a direita), empilhado em mobile.
 * Slot opcional para breadcrumb acima do title.
 *
 * Convencoes:
 *   - title sempre <h1> (1 por pagina, semantica obrigatoria).
 *   - SEM prop `icon`, `gradient`, `background` (R5 — minimalista canonico).
 *
 * Lessons aplicadas:
 *   #2  data-testid estavel (page-header, page-header-title, page-header-actions).
 *   #11 API minimalista — sem props decorativas.
 */

import React from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}

// String subtitle => semantic <p>. Non-string ReactNode (e.g. <Trans>, JSX
// fragments) => <div> to avoid invalid <p><div/></p> nesting warning.
function renderSubtitle(subtitle: React.ReactNode): React.ReactNode {
  if (subtitle === undefined || subtitle === null) return null;
  const className = 'text-sm text-muted-foreground';
  return typeof subtitle === 'string' ? (
    <p className={className}>{subtitle}</p>
  ) : (
    <div className={className}>{subtitle}</div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumb,
}: PageHeaderProps) {
  return (
    <header
      data-testid="page-header"
      className="w-full pb-6 flex flex-col gap-3"
    >
      {breadcrumb && (
        <nav aria-label="breadcrumb" className="text-sm">
          {breadcrumb}
        </nav>
      )}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex flex-col gap-1 min-w-0">
          <h1
            data-testid="page-header-title"
            className="text-2xl font-semibold tracking-tight text-foreground"
          >
            {title}
          </h1>
          {renderSubtitle(subtitle)}
        </div>
        {actions && (
          <div
            data-testid="page-header-actions"
            className="flex items-center gap-2 flex-wrap"
          >
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}

export default PageHeader;

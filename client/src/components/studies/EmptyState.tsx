/**
 * @deprecated Migrar para `@/components/ui/EmptyState` (canonico Sprint UI-FND-1).
 *             Este componente legacy permanece para compat com Sprint Studies-Reform;
 *             sera removido em Sprint Studies-Polish.
 *
 * Sprint Studies-Reform — RF-10 (Empty States Personalizados)
 *
 * Componente reutilizavel para empty states. Aceita icon, title, description,
 * ctaLabel e ctaAction. Telemetria simples via window.__telemetry?.track quando
 * disponivel (no-op em production caso nao instalado).
 *
 * Lessons aplicadas:
 *   #11 sem default actions decorativas — chamador define ctaAction.
 *   #2 data-testid: empty-state, empty-state-cta
 */

import React from 'react';
import { Button } from '@/components/ui/button';

export type EmptyStateArea =
  | 'spots'
  | 'themes'
  | 'stats'
  | 'recommendations'
  | 'dashboard'
  | 'theme-detail-spots'
  | 'generic';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  ctaLabel: string;
  ctaAction: () => void;
  area?: EmptyStateArea;
}

/** @deprecated Use `@/components/ui/EmptyState` (canonico Sprint UI-FND-1). */
export function EmptyState({
  icon,
  title,
  description,
  ctaLabel,
  ctaAction,
  area = 'generic',
}: EmptyStateProps) {
  const handleClick = () => {
    try {
      const telemetry: any = (typeof window !== 'undefined' ? (window as any).__telemetry : null);
      telemetry?.track?.('studies.empty_state_cta_clicked', { area });
    } catch {
      // telemetria sem panico (lesson #9)
    }
    ctaAction();
  };

  return (
    <div
      data-testid="empty-state"
      data-area={area}
      className="flex flex-col items-center justify-center text-center mx-auto"
      style={{ maxWidth: 480, padding: 48 }}
    >
      {icon && (
        <div className="mb-4 opacity-60 text-secondary-foreground" data-testid="empty-state-icon-wrapper">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-gray-400 mb-6">{description}</p>
      <Button
        data-testid="empty-state-cta"
        onClick={handleClick}
        className="bg-poker-accent hover:bg-poker-accent/90 text-black font-semibold"
      >
        {ctaLabel}
      </Button>
    </div>
  );
}

export default EmptyState;

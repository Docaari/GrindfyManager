/**
 * Sprint UX-QW-2 — RF-03
 *
 * Empty state da pagina /grind-live quando user nao tem sessao ativa E nao tem
 * planned_tournaments para o dia.
 *
 * Spec RF-03:
 *   - title: "Pronto para o grind?"
 *   - description: "Voce nao tem torneios planejados para hoje. Configure sua
 *     grade ou inicie uma sessao vazia."
 *   - primaryCTA: "Iniciar Sessao Vazia" -> onStartEmptySession()
 *   - secondaryCTA: "Configurar grade primeiro" -> setLocation('/grade-planner')
 *
 * Lessons aplicadas:
 *   #2  data-testid estavel (via EmptyState canonico).
 *   #11 sem default decorativo.
 *   #14 import estatico.
 */

import React from 'react';
import { useLocation } from 'wouter';
import { EmptyState } from '@/components/ui/EmptyState';

export interface GrindLiveEmptyStateProps {
  onStartEmptySession: () => void;
}

export function GrindLiveEmptyState({
  onStartEmptySession,
}: GrindLiveEmptyStateProps) {
  const [, setLocation] = useLocation();
  return (
    <EmptyState
      area="grind-live-empty"
      telemetryContext="grind_live_empty"
      title="Pronto para o grind?"
      description="Voce nao tem torneios planejados para hoje. Configure sua grade ou inicie uma sessao vazia."
      ctaLabel="Iniciar Sessao Vazia"
      ctaAction={onStartEmptySession}
      secondaryCTA={{
        label: 'Configurar grade primeiro',
        onClick: () => setLocation('/grade-planner'),
      }}
    />
  );
}

export default GrindLiveEmptyState;

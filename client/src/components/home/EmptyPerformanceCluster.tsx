/**
 * EmptyPerformanceCluster — Sprint home-reform-3 (Onda 3) RF-A5.
 *
 * Spec: Docs/specs/home-reform-3.md §RF-A5
 *
 * Placeholder agregado mostrado quando topDeltas + variance + recommendations
 * + heuristics estao todos vazios (substitui 4 cards Onda 2 vazios).
 */

import React from 'react';

interface Props {
  sessionsCount: number;
}

export default function EmptyPerformanceCluster({ sessionsCount }: Props): JSX.Element {
  const reachedThreshold = sessionsCount >= 30;
  return (
    <div
      data-testid="empty-performance-cluster"
      className="rounded-lg border border-dashed border-border bg-card p-6 md:col-span-2 text-center space-y-2"
    >
      <h3 className="text-sm font-semibold">Insights de performance liberados apos 30 sessoes</h3>
      <p className="text-xs text-muted-foreground">
        {reachedThreshold
          ? 'Sem sinal forte ainda. Volte apos sua proxima sessao.'
          : `Atual: ${sessionsCount} sessoes. Continue grindando.`}
      </p>
    </div>
  );
}

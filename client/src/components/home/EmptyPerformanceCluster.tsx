/**
 * Spec: Docs/specs/home-reform-3.md §RF-A5 + Docs/specs/sprint-variance-1.md §RF-08
 *
 * Placeholder agregado quando topDeltas + variance + recommendations + heuristics
 * estao todos vazios. CTA simulador renderiza quando sessionsCount >= 5
 * (evita poluir onboarding zerado).
 */

import React from 'react';
import { Link } from 'wouter';

interface Props {
  sessionsCount: number;
}

export default function EmptyPerformanceCluster({ sessionsCount }: Props): JSX.Element {
  const reachedThreshold = sessionsCount >= 30;
  const showVarianceCta = sessionsCount >= 5;
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
      {showVarianceCta && (
        <Link
          href="/coach-ai?tab=variance"
          data-testid="empty-cluster-variance-cta"
          className="inline-block text-xs text-emerald-300 hover:text-emerald-200 underline mt-1"
        >
          Simular variancia
        </Link>
      )}
    </div>
  );
}

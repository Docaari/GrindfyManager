/**
 * Sprint home-reform-2 — RF-30 (B8 Variance Check PrimeDope).
 *
 * Spec: Docs/specs/home-reform-2.md §3 B8, §5 RF-30
 *
 * Mostra current/expected/deviation/sigmaMultiple/status.
 * Bloco oculto se data === null OR sessionsCount < 20.
 * Tracker:
 *   home_variance_view { status } — apenas quando renderizado
 *
 * Lessons aplicadas:
 *   #1 hooks first
 *   #2 data-testid estavel
 *   #11 spec eh fonte da verdade
 */

import React, { useEffect, useRef } from 'react';
import { emit } from '@/lib/tracker';

interface VarianceData {
  sessionsCount: number;
  actualUsd: number;
  expectedUsd: number;
  expectedSource: 'primedope-cache' | 'fallback-zero';
  deviationUsd: number;
  sigmaUsd: number;
  sigmaMultiple: number;
  status: 'lucky' | 'normal' | 'unlucky';
  period: '90d';
}

interface Props {
  data: VarianceData | null;
}

const STATUS_LABEL: Record<VarianceData['status'], string> = {
  lucky: 'Sortudo',
  normal: 'Normal',
  unlucky: 'Azar',
};

const STATUS_CLASSES: Record<VarianceData['status'], string> = {
  lucky: 'text-emerald-300 border-emerald-700/40',
  normal: 'text-zinc-300 border-zinc-700/40',
  unlucky: 'text-amber-300 border-amber-700/40',
};

export default function VarianceCard({ data }: Props): JSX.Element | null {
  const viewedRef = useRef(false);
  const visible = !!data && Number(data.sessionsCount ?? 0) >= 20;

  useEffect(() => {
    if (viewedRef.current) return;
    if (!visible || !data) return;
    viewedRef.current = true;
    emit('home_variance_view', { status: data.status });
  }, [visible, data]);

  if (!visible || !data) return null;

  return (
    <div
      data-testid="home-variance-card"
      data-status={data.status}
      className={`rounded-lg border ${STATUS_CLASSES[data.status]} bg-card p-4`}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Variance (90d)</h3>
        <span className="text-xs uppercase px-1.5 py-0.5 rounded-md border border-current">
          {STATUS_LABEL[data.status]}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-xs uppercase text-muted-foreground">Atual</div>
          <div className="font-semibold">${data.actualUsd.toFixed(0)}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-muted-foreground">Esperado</div>
          <div className="font-semibold">${data.expectedUsd.toFixed(0)}</div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground mt-2">
        {data.sigmaMultiple.toFixed(1)}σ · {data.sessionsCount} sessoes
      </div>
    </div>
  );
}

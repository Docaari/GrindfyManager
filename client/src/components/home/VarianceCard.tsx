/**
 * Spec: Docs/specs/home-reform-2.md §3 B8 + Docs/specs/sprint-variance-1.md §RF-04
 * ADR-162 §2.4: empty-state esconde numeros sem baseline real.
 *
 * Branches:
 *   data=null OR sessionsCount<20    -> hidden (return null)
 *   expectedSource='fallback-zero'   -> empty-state com CTA simulador
 *   expectedSource='primedope-cache' -> card real com numeros (lucky/normal/unlucky)
 */

import React, { useEffect, useRef } from 'react';
import { Link } from 'wouter';
import { emit } from '@/lib/tracker';
import {
  VARIANCE_SOURCE,
  type VarianceSource,
  type VarianceStatus,
} from '@shared/variance';

interface VarianceData {
  sessionsCount: number;
  actualUsd: number;
  expectedUsd: number;
  expectedSource: VarianceSource;
  deviationUsd: number;
  sigmaUsd: number;
  sigmaMultiple: number;
  status: VarianceStatus;
  period: '90d';
}

interface Props {
  data: VarianceData | null;
}

type CardMode = 'hidden' | 'fallback' | 'real';

const STATUS_LABEL: Record<VarianceStatus, string> = {
  lucky: 'Sortudo',
  normal: 'Normal',
  unlucky: 'Azar',
};

const STATUS_CLASSES: Record<VarianceStatus, string> = {
  lucky: 'text-emerald-300 border-emerald-700/40',
  normal: 'text-zinc-300 border-zinc-700/40',
  unlucky: 'text-amber-300 border-amber-700/40',
};

function computeMode(data: VarianceData | null): CardMode {
  if (!data || Number(data.sessionsCount ?? 0) < 20) return 'hidden';
  if (data.expectedSource === VARIANCE_SOURCE.FALLBACK_ZERO) return 'fallback';
  return 'real';
}

export default function VarianceCard({ data }: Props): JSX.Element | null {
  const mode = computeMode(data);
  const lastEmittedRef = useRef<CardMode | null>(null);

  useEffect(() => {
    if (mode === 'hidden' || lastEmittedRef.current === mode) return;
    lastEmittedRef.current = mode;
    if (mode === 'real' && data) emit('home_variance_view', { status: data.status });
    else if (mode === 'fallback') emit('home_variance_fallback_view');
  }, [mode, data]);

  if (mode === 'hidden' || !data) return null;

  if (mode === 'fallback') {
    return (
      <div
        data-testid="home-variance-empty-card"
        className="rounded-lg border border-dashed border-border bg-card p-4 space-y-2"
      >
        <h3 className="text-sm font-semibold">
          Simule sua grade para liberar a Variancia esperada
        </h3>
        <p className="text-xs text-muted-foreground">
          Sem simulacao PrimeDope nos ultimos 90 dias. Variancia esperada e
          desvio dependem da grade simulada.
        </p>
        <Link
          href="/coach-ai?tab=variance"
          className="inline-flex items-center text-xs text-emerald-300 hover:text-emerald-200 underline"
        >
          Abrir simulador
        </Link>
      </div>
    );
  }

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

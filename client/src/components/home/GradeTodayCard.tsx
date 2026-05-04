/**
 * GradeTodayCard — Sprint home-reform-4 item 5.
 *
 * Spec: Docs/specs/home-reform-4.md item 5 (substituir "Recomendacao de hoje"
 * por visao rapida da grade planner do dia atual).
 *
 * Card titulo "Grade do dia — dd/mm" + chips A|B|C single-select. KPIs:
 * Torneios | Investimento USD | ABI USD. Empty state quando profile sem
 * planejamento. CTA "Ver grade completa" -> /grade-planner.
 *
 * Fetch isolado: TanStack Query keyed por profile (refetch on chip change),
 * staleTime 60s. Default profile recebido por prop (perfil ativo do dia).
 */

import React, { useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

type GradeProfile = 'A' | 'B' | 'C';

interface GradeTodayEntry {
  time: string;
  name: string;
}

interface GradeTodayResponse {
  date: string;
  profile: GradeProfile;
  count: number;
  totalInvestmentUsd: number;
  abi: number | null;
  // Sprint home-reform-5 item 5 — primeiro + ultimo registro do dia.
  firstEntry?: GradeTodayEntry | null;
  lastEntry?: GradeTodayEntry | null;
}

interface Props {
  /** Profile inicial (default 'A'). Geralmente data.today?.profile. */
  defaultProfile?: GradeProfile;
}

const PROFILES: GradeProfile[] = ['A', 'B', 'C'];

function fmtUsd(v: number | null | undefined): string {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return `$${n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtAbi(v: number | null | undefined): string {
  if (v == null) return '—';
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return `$${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDateShort(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}`;
}

export default function GradeTodayCard({ defaultProfile = 'A' }: Props): JSX.Element {
  const [profile, setProfile] = useState<GradeProfile>(defaultProfile);

  const { data, isLoading, isError } = useQuery<GradeTodayResponse>({
    queryKey: ['/api/home/grade-today', profile],
    queryFn: () => apiRequest('GET', `/api/home/grade-today?profile=${profile}`),
    staleTime: 60_000,
  });

  const dateLabel = data ? fmtDateShort(data.date) : '';
  const isEmpty = !isLoading && !isError && data && data.count === 0;

  return (
    <div
      data-testid="grade-today-card"
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold">
          Grade do dia{dateLabel ? ` — ${dateLabel}` : ''}
        </h3>
        <Link href="/grade-planner">
          <a
            data-testid="grade-today-card-cta"
            href="/grade-planner"
            className="text-xs text-primary hover:underline"
          >
            Ver grade completa →
          </a>
        </Link>
      </div>

      <div data-testid="grade-today-card-chips" className="flex gap-1.5 mb-3">
        {PROFILES.map((p) => {
          const active = p === profile;
          return (
            <button
              key={p}
              type="button"
              data-testid={`grade-today-card-chip-${p}`}
              data-active={active ? 'true' : 'false'}
              onClick={() => setProfile(p)}
              className={[
                'px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors',
                active
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-accent',
              ].join(' ')}
            >
              {p}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div
          data-testid="grade-today-card-loading"
          className="h-12 animate-pulse rounded-md bg-muted/40"
        />
      ) : isError ? (
        <div
          data-testid="grade-today-card-error"
          className="text-sm text-muted-foreground"
        >
          Erro ao carregar grade
        </div>
      ) : isEmpty ? (
        <div data-testid="grade-today-card-empty" className="text-sm text-muted-foreground">
          Nenhum torneio planejado para perfil {profile}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div data-testid="grade-today-card-count" className="flex flex-col gap-0.5">
              <span className="text-3xl font-bold text-foreground">{data!.count}</span>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Torneios</span>
            </div>
            <div data-testid="grade-today-card-investment" className="flex flex-col gap-0.5">
              <span className="text-3xl font-bold text-foreground">{fmtUsd(data!.totalInvestmentUsd)}</span>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Investimento</span>
            </div>
            <div data-testid="grade-today-card-abi" className="flex flex-col gap-0.5">
              <span className="text-3xl font-bold text-foreground">{fmtAbi(data!.abi)}</span>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">ABI</span>
            </div>
          </div>
          {(data!.firstEntry || data!.lastEntry) ? (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {data!.firstEntry ? (
                <div
                  data-testid="grade-today-card-first"
                  className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5"
                >
                  <span className="uppercase tracking-wide text-muted-foreground">1º registro</span>
                  <span className="font-medium text-foreground truncate">
                    {data!.firstEntry.time} · {data!.firstEntry.name}
                  </span>
                </div>
              ) : null}
              {data!.lastEntry ? (
                <div
                  data-testid="grade-today-card-last"
                  className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5"
                >
                  <span className="uppercase tracking-wide text-muted-foreground">Último registro</span>
                  <span className="font-medium text-foreground truncate">
                    {data!.lastEntry.time} · {data!.lastEntry.name}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

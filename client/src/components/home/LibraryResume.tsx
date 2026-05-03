/**
 * Sprint home-reform-1-5 — RF-23 (B2 Continue Assistindo).
 *
 * Spec : Docs/specs/home-reform-1-5.md RF-23, RNF-1.5-6
 *
 * Componente que mostra ate 3 lessons em progresso na Home.
 * Faz query independente para /api/library/continue (separada do
 * /api/home/overview para permitir entitlement check isolado).
 *
 * Tracker:
 *   - emit('home_library_resume_view', { count, hasAccess }) 1x mount com lessons
 *   - emit('home_library_resume_click', { lessonId, format, progressPct })
 *
 * Lessons aplicadas:
 *   #1   hooks ANTES de early return
 *   #13  apiRequest retorna JSON parseado direto (nao usar .json())
 */

import React, { useEffect, useRef } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { tokens } from '@/lib/ui-tokens';
import { emit } from '@/lib/tracker';

interface LibraryResumeItem {
  lessonId: string;
  lessonTitle: string;
  courseTitle: string;
  moduleTitle: string;
  coverImageUrl: string | null;
  format: 'video' | 'podcast' | 'article';
  lastPositionSeconds: number;
  totalDurationSeconds: number | null;
  progressPct: number;
  remainingSeconds: number | null;
  updatedAt: string;
}

interface LibraryContinueResponse {
  items: LibraryResumeItem[];
  hasAccess: boolean;
}

interface LibraryResumeProps {
  limit?: number;
}

function formatRemaining(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return '';
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} min restantes`;
}

function lessonHref(item: LibraryResumeItem): string {
  return `/biblioteca/lesson/${item.lessonId}?format=${item.format}&t=${item.lastPositionSeconds}`;
}

export default function LibraryResume({ limit = 3 }: LibraryResumeProps): JSX.Element | null {
  const { data, isLoading, isError } = useQuery<LibraryContinueResponse>({
    queryKey: ['/api/library/continue', { limit }],
    queryFn: () => apiRequest('GET', `/api/library/continue?limit=${limit}`),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const viewEmittedRef = useRef(false);
  useEffect(() => {
    if (!data || viewEmittedRef.current) return;
    if (!data.hasAccess) return; // sem acesso => nao emit (bloco oculto)
    if (data.items.length === 0) return; // empty state => nao emit view
    viewEmittedRef.current = true;
    emit('home_library_resume_view', {
      count: data.items.length,
      hasAccess: data.hasAccess,
    });
  }, [data]);

  // Loading: skeleton min-height (RNF-1.5-1 / R5).
  if (isLoading) {
    return (
      <div
        data-testid="home-library-resume-skeleton"
        className="rounded-lg border border-border bg-card p-4 animate-pulse"
        style={{ minHeight: 200 }}
      />
    );
  }

  // Error => oculto silenciosamente (spec §5.2 B2 — recovery automatico via TanStack).
  if (isError) {
    return null;
  }

  // Sem acesso => bloco oculto silenciosamente (R3).
  if (data && data.hasAccess === false) {
    return null;
  }

  const items = data?.items ?? [];
  const hasAccess = data?.hasAccess ?? true;

  // Empty state com acesso => CTA "Comece sua primeira lesson"
  if (items.length === 0) {
    return (
      <div
        data-testid="home-library-resume"
        className="rounded-lg border border-border bg-card p-4"
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Continue assistindo</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Voce ainda nao iniciou nenhuma lesson.
        </p>
        <div className="mt-3">
          <Link href="/biblioteca">
            <a
              href="/biblioteca"
              className={`inline-flex items-center px-3 py-1.5 rounded-md ${tokens.color.action.bg} ${tokens.color.action.text} text-sm hover:opacity-90`}
            >
              Comece sua primeira lesson
            </a>
          </Link>
        </div>
      </div>
    );
  }

  // Lista de lessons em progresso.
  return (
    <div
      data-testid="home-library-resume"
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Continue assistindo</h3>
        <Link href="/biblioteca">
          <a href="/biblioteca" className="text-xs text-muted-foreground hover:underline">
            Ver biblioteca completa
          </a>
        </Link>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.lessonId}>
            <Link href={lessonHref(item)}>
              <a
                href={lessonHref(item)}
                data-testid={`home-library-resume-card-${item.lessonId}`}
                aria-label={`Continuar assistindo ${item.lessonTitle}, ${Math.round(item.progressPct)}% concluido`}
                onClick={() => {
                  emit('home_library_resume_click', {
                    lessonId: item.lessonId,
                    format: item.format,
                    progressPct: item.progressPct,
                  });
                }}
                className="flex items-center gap-3 rounded-md border border-border p-2 hover:bg-muted/50 transition-colors"
              >
                {item.coverImageUrl ? (
                  <img
                    src={item.coverImageUrl}
                    alt=""
                    className="w-16 h-9 md:w-20 md:h-12 object-cover rounded flex-shrink-0"
                  />
                ) : (
                  <div className="w-16 h-9 md:w-20 md:h-12 rounded bg-muted flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.lessonTitle}</div>
                  <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${Math.min(100, Math.max(0, item.progressPct))}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                    <span>{formatRemaining(item.remainingSeconds)}</span>
                    <span className="uppercase border border-border rounded px-1 py-0.5 text-[9px]">
                      {item.format}
                    </span>
                  </div>
                </div>
              </a>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

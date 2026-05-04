/**
 * Sprint home-reform-4 / Item 4 — RF-09 (CoachRecommendationCard).
 *
 * Substitui LibraryResume na zona "Acao Imediata" da Home. Mostra a
 * recomendacao semanal do Coach IA OU empty states.
 *
 * Lessons aplicadas:
 *   #1   hooks ANTES de early return
 *   #11  spec define CTAs — sem decorativos
 *   #13  apiRequest retorna JSON parseado
 */

import React, { useEffect, useRef } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { tokens } from "@/lib/ui-tokens";
import { emit } from "@/lib/tracker";

interface CoachRecommendationPayload {
  id: string;
  lessonId: string;
  lessonTitle: string;
  courseTitle?: string | null;
  moduleTitle?: string | null;
  coverImageUrl?: string | null;
  format: "video" | "podcast" | "article";
  durationSeconds?: number | null;
  category?: string | null;
  reason: string;
  source: "coach" | "fallback_leak_tag" | "fallback_popular" | "fallback_recent";
  createdAt?: string;
  hasAccess: boolean;
  ctaTarget: string;
  ctaLabel: string;
  dismissedAt?: string | null;
  consumedAt?: string | null;
}

interface CoachRecommendationResponse {
  weekStartDate: string;
  recommendation: CoachRecommendationPayload | null;
  status?: "active" | "dismissed" | "consumed" | "lesson_unavailable";
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return "";
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

function emptyMessage(
  status: CoachRecommendationResponse["status"] | undefined,
): string {
  if (status === "consumed") {
    return "Ja consumida essa semana — proxima na segunda.";
  }
  if (status === "dismissed") {
    return "Dispensada — proxima recomendacao na segunda.";
  }
  if (status === "lesson_unavailable") {
    return "A licao recomendada esta temporariamente indisponivel. Aguarde a proxima segunda.";
  }
  return "Sua recomendacao desta semana ainda nao foi gerada. Volte em alguns minutos.";
}

export default function CoachRecommendationCard(): JSX.Element {
  const qc = useQueryClient();
  const viewEmittedRef = useRef(false);

  const { data, isLoading } = useQuery<CoachRecommendationResponse>({
    queryKey: ["/api/home/coach-recommendation"],
    queryFn: () => apiRequest("GET", "/api/home/coach-recommendation"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const dismissMutation = useMutation({
    mutationFn: async (recId: string) => {
      return await apiRequest(
        "POST",
        `/api/home/coach-recommendation/${recId}/dismiss`,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/home/coach-recommendation"] });
    },
  });

  const consumeMutation = useMutation({
    mutationFn: async (recId: string) => {
      return await apiRequest(
        "POST",
        `/api/home/coach-recommendation/${recId}/consume`,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/home/coach-recommendation"] });
    },
  });

  const rec = data?.recommendation ?? null;

  // Tracker view emit — somente quando rec ativa monta (lesson #1: useEffect ANTES de early return).
  useEffect(() => {
    if (!rec || viewEmittedRef.current) return;
    viewEmittedRef.current = true;
    emit("home_coach_rec_view", {
      recId: rec.id,
      lessonId: rec.lessonId,
      source: rec.source,
      hasAccess: rec.hasAccess,
    });
  }, [rec]);

  if (isLoading) {
    return (
      <div
        data-testid="home-coach-rec-loading"
        className="rounded-lg border border-border bg-card p-4 animate-pulse"
        style={{ minHeight: 200 }}
      />
    );
  }

  // Empty state (nenhuma rec OU dismissed/consumed/lesson_unavailable).
  if (!rec) {
    const message = emptyMessage(data?.status);
    return (
      <div
        data-testid="home-coach-rec-empty"
        className="rounded-lg border border-border bg-card p-4"
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Recomendacao da Semana</h3>
        </div>
        <p className="text-sm text-muted-foreground">{message}</p>
        <div className="mt-3">
          <Link href="/biblioteca">
            <a
              href="/biblioteca"
              className="text-xs text-muted-foreground hover:underline"
            >
              Explorar Biblioteca
            </a>
          </Link>
        </div>
      </div>
    );
  }

  const sourceLabel =
    rec.source === "coach" ? "Coach IA" : "Sugestao Popular";

  return (
    <div
      data-testid="home-coach-rec-card"
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Recomendacao da Semana</h3>
        <span className="text-[10px] uppercase tracking-wide border border-border rounded px-1.5 py-0.5 text-muted-foreground">
          {sourceLabel}
        </span>
      </div>

      <div className="flex items-start gap-3">
        {rec.coverImageUrl ? (
          <img
            src={rec.coverImageUrl}
            alt={rec.lessonTitle}
            className="w-20 h-12 md:w-28 md:h-16 object-cover rounded flex-shrink-0"
          />
        ) : (
          <div className="w-20 h-12 md:w-28 md:h-16 rounded bg-muted flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium line-clamp-2">
            {rec.lessonTitle}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
            <span className="uppercase">{rec.format}</span>
            {formatDuration(rec.durationSeconds) && (
              <>
                <span>•</span>
                <span>{formatDuration(rec.durationSeconds)}</span>
              </>
            )}
            {rec.category && (
              <>
                <span>•</span>
                <span>{rec.category}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <p className="mt-3 text-sm text-muted-foreground italic">{rec.reason}</p>

      <div className="mt-4 flex flex-col gap-2">
        <Link href={rec.ctaTarget}>
          <a
            data-testid="home-coach-rec-cta"
            href={rec.ctaTarget}
            onClick={() =>
              emit("home_coach_rec_cta_click", {
                recId: rec.id,
                lessonId: rec.lessonId,
                source: rec.source,
                hasAccess: rec.hasAccess,
                ctaTarget: rec.ctaTarget,
              })
            }
            className={`inline-flex items-center justify-center px-3 py-1.5 rounded-md ${tokens.color.action.bg} ${tokens.color.action.text} text-sm hover:opacity-90`}
          >
            {rec.ctaLabel}
          </a>
        </Link>

        {!rec.hasAccess && (
          <span className="text-[11px] text-muted-foreground">
            Sugestao de compra
          </span>
        )}

        {rec.hasAccess && (
          <button
            data-testid="home-coach-rec-mark-consumed"
            type="button"
            onClick={() => {
              emit("home_coach_rec_mark_consumed_click", { recId: rec.id });
              consumeMutation.mutate(rec.id);
            }}
            className="text-[11px] text-muted-foreground hover:underline self-start"
          >
            Marcar como vista
          </button>
        )}

        <button
          data-testid="home-coach-rec-dismiss"
          type="button"
          onClick={() => {
            emit("home_coach_rec_dismiss_click", { recId: rec.id });
            dismissMutation.mutate(rec.id);
          }}
          className="text-[11px] text-muted-foreground hover:underline self-start"
        >
          Dispensar
        </button>
      </div>
    </div>
  );
}

/**
 * Sprint home-reform-4 / MEDIUM-6 reviewer.
 *
 * ThemeDetailView — pagina simples para `/estudos/temas/:id`.
 *
 * Responsabilidades minimas:
 *   - Le themeId do path.
 *   - Resolve tema via lista existente (`/api/study-themes`) — endpoint de
 *     single theme nao existe; client-side filter eh barato.
 *   - Renderiza nome + emoji + progress + descricao basica.
 *   - CTA "Iniciar sessao de estudo" (placeholder POST `/api/study-sessions`
 *     com themeId — backend ja aceita via insertStudySessionSchema).
 *   - Empty state quando id desconhecido.
 *
 * Lessons aplicadas:
 *   #1  hooks first
 *   #2  data-testid estaveis
 *   #11 sem actions decorativas
 *   #13 apiRequest retorna JSON parseado direto
 */

import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { ThemeStatsFocoSection } from '@/components/study-themes/ThemeStatsFocoSection';
import { StatLinkPicker } from '@/components/study-themes/StatLinkPicker';

interface ThemeRow {
  id: string;
  name: string;
  color?: string | null;
  emoji?: string | null;
  progress?: number | null;
  attacksLeakType?: string | null;
  linkedStats?: string[];
}

interface ThemeStatsSummary {
  statId: string;
  label: string;
  groupId: string;
  groupLabel: string;
  currentValue: number | null;
  targetMin: number;
  targetMax: number;
  direction: string;
  unit: string;
  sparkline30d: number[];
  isCustom?: boolean;
}

interface ThemeStatsSummaryResponse {
  themeId: string;
  stats: ThemeStatsSummary[];
}

interface Props {
  themeId: string;
}

export default function ThemeDetailView({ themeId }: Props): JSX.Element {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  // CRITICAL-1 reviewer: drawer de configuracao de stats foco linkadas ao tema.
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: themes = [], isLoading } = useQuery<ThemeRow[]>({
    queryKey: ['/api/study-themes'],
    queryFn: () => apiRequest('GET', '/api/study-themes'),
    staleTime: 30_000,
  });

  // CRITICAL-1 reviewer: stats foco do tema via endpoint dedicado (RF-05).
  // Reusa logica do coach tool readThemeWithLinkedStatsAndSpots — currentValue,
  // sparkline 30d, targetMin/Max + direction-aware status badges.
  const { data: statsResponse } = useQuery<ThemeStatsSummaryResponse>({
    queryKey: [`/api/themes/${themeId}/stats-summary`],
    queryFn: () => apiRequest('GET', `/api/themes/${themeId}/stats-summary`),
    enabled: !!themeId,
    staleTime: 30_000,
  });
  const statsSummary: ThemeStatsSummary[] = Array.isArray(statsResponse?.stats)
    ? statsResponse!.stats
    : [];

  // CRITICAL-1 reviewer: handler de save para StatLinkPicker. PATCH /api/study-themes/:id
  // com novo array de linkedStats. Em caso de 400 invalidIds, prop o onSave do
  // StatLinkPicker propaga via err.invalidIds (component remove chips invalidos).
  const handleStatsSave = async (newStatIds: string[]): Promise<void> => {
    try {
      await apiRequest('PATCH', `/api/study-themes/${themeId}`, {
        linkedStats: newStatIds,
      });
    } catch (err: any) {
      // apiRequest jogou erro — preserva invalidIds quando vem no body 400.
      if (err?.invalidIds && Array.isArray(err.invalidIds)) {
        const richErr: any = new Error(err?.message ?? 'IDs invalidos');
        richErr.invalidIds = err.invalidIds;
        throw richErr;
      }
      throw err;
    }
    // RF-01 sync: revalida lista de temas + stats summary deste tema.
    qc.invalidateQueries({ queryKey: ['/api/study-themes'] });
    qc.invalidateQueries({ queryKey: [`/api/themes/${themeId}/stats-summary`] });
  };

  const startSessionMutation = useMutation({
    mutationFn: async () => {
      // LOW-13 reviewer: wira themeId no POST de study-sessions quando user
      // inicia estudo a partir do tema. Backend (insertStudySessionSchema +
      // createStudySession) ja aceita themeId via spread.
      return await apiRequest('POST', '/api/study-sessions', {
        themeId,
        date: new Date().toISOString(),
        duration: 0,
        activities: ['theme'],
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/study-sessions'] });
      qc.invalidateQueries({ queryKey: ['/api/home/focus-stats'] });
      toast({ title: 'Sessao de estudo iniciada' });
    },
    onError: () => {
      toast({
        title: 'Erro ao iniciar sessao',
        variant: 'destructive',
      });
    },
  });

  const theme = themes.find((t) => t.id === themeId) ?? null;

  if (isLoading) {
    return (
      <div data-testid="theme-detail-loading" className="p-6">
        <div className="h-6 w-48 bg-muted/40 animate-pulse rounded mb-4" />
        <div className="h-24 bg-muted/40 animate-pulse rounded" />
      </div>
    );
  }

  if (!theme) {
    return (
      <div data-testid="theme-detail-empty" className="p-6">
        <button
          type="button"
          onClick={() => navigate('/estudos/temas')}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar para temas
        </button>
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <h2 className="text-base font-semibold mb-2">Tema nao encontrado</h2>
          <p className="text-sm text-muted-foreground">
            O tema solicitado nao existe ou foi removido.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="theme-detail-view" className="p-6 max-w-3xl mx-auto">
      <button
        type="button"
        onClick={() => navigate('/estudos/temas')}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        data-testid="theme-detail-back"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar para temas
      </button>

      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          {theme.emoji ? (
            <span className="text-3xl" aria-hidden>
              {theme.emoji}
            </span>
          ) : null}
          <div>
            <h1
              data-testid="theme-detail-name"
              className="text-xl font-semibold text-foreground"
            >
              {theme.name}
            </h1>
            {typeof theme.progress === 'number' ? (
              <p
                data-testid="theme-detail-progress"
                className="text-xs text-muted-foreground mt-1"
              >
                Progresso: {theme.progress}%
              </p>
            ) : null}
          </div>
        </div>

        {theme.attacksLeakType ? (
          <div
            data-testid="theme-detail-leak"
            className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300"
          >
            Vinculado ao leak: <strong>{theme.attacksLeakType}</strong>
          </div>
        ) : null}

        {/* Sprint stats-themes-linking-1 RF-05: Stats foco section. */}
        <ThemeStatsFocoSection
          themeId={themeId}
          stats={statsSummary}
          onConfigureClick={() => setPickerOpen(true)}
        />

        {/* CRITICAL-1 reviewer: StatLinkPicker drawer wiring. */}
        {pickerOpen && (
          <div
            data-testid="theme-detail-stat-picker-drawer"
            className="rounded-lg border border-border bg-card/40 p-4 mt-2"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">Configurar stats foco</h3>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Fechar
              </button>
            </div>
            <StatLinkPicker
              themeId={themeId}
              initialStatIds={Array.isArray(theme.linkedStats) ? theme.linkedStats : []}
              onSave={handleStatsSave}
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            data-testid="theme-detail-start-session"
            disabled={startSessionMutation.isPending}
            onClick={() => startSessionMutation.mutate()}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Iniciar sessao de estudo
          </button>
          <button
            type="button"
            data-testid="theme-detail-configure-stats"
            onClick={() => setPickerOpen((v) => !v)}
            className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent"
          >
            {pickerOpen ? 'Fechar configuracao' : 'Configurar stats foco'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/estudos/temas')}
            className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent"
          >
            Ver outros temas
          </button>
        </div>
      </div>
    </div>
  );
}

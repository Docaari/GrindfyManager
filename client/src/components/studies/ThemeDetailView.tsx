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
import { ArrowLeft, Pencil, Trash2, Loader2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { ThemeStatsFocoSection } from '@/components/study-themes/ThemeStatsFocoSection';
import { StatLinkPicker } from '@/components/study-themes/StatLinkPicker';
import {
  Collapsible,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ThemeFormDialog, type ThemeFormValues } from './ThemeFormDialog';
import StatAnalysisReviewList from './StatAnalysisReviewList';
// Sprint MDA-1 (ADR-230 / RF-05) — MDAs da populacao tagueados ao tema.
import { MdaReadsSection } from './MdaReadsSection';

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
  // GAP-1 fix: editar (PUT) + deletar (DELETE) tema na nova UI.
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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

  // GAP-1: editar tema via PUT (name/color/emoji). PATCH eh so linkedStats.
  const editMutation = useMutation({
    mutationFn: (values: ThemeFormValues) =>
      apiRequest('PUT', `/api/study-themes/${themeId}`, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/study-themes'] });
      // Nome/emoji do tema aparece na lista de sessoes — revalida.
      qc.invalidateQueries({ queryKey: ['/api/study-sessions'] });
      toast({ title: 'Tema atualizado' });
    },
  });

  async function handleEdit(values: ThemeFormValues) {
    await editMutation.mutateAsync(values);
  }

  // GAP-1: deletar tema (cascade tabs no backend).
  const deleteMutation = useMutation({
    mutationFn: () => apiRequest('DELETE', `/api/study-themes/${themeId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/study-themes'] });
      // Backend faz themeId -> SET NULL nas sessoes; revalida pra refletir.
      qc.invalidateQueries({ queryKey: ['/api/study-sessions'] });
      toast({ title: 'Tema removido' });
      navigate('/estudos/temas');
    },
    onError: () => {
      toast({ title: 'Erro ao remover tema', variant: 'destructive' });
      setDeleteOpen(false);
    },
  });

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
    // Sprint Estudos-Sessao-1 RF-09: redirect para /estudos/sessao/:id apos
    // POST sucesso. apiRequest retorna JSON parseado direto (lesson #13),
    // entao `created.id` funciona sem precisar de .json().
    onSuccess: (created: any) => {
      qc.invalidateQueries({ queryKey: ['/api/study-sessions'] });
      qc.invalidateQueries({ queryKey: ['/api/home/focus-stats'] });
      const sessionId = created?.id;
      if (sessionId) {
        navigate(`/estudos/sessao/${sessionId}`);
      } else {
        // Fallback defensivo se backend nao retornar id (nao deve acontecer).
        toast({ title: 'Sessao de estudo iniciada' });
      }
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
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => navigate('/estudos/temas')}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          data-testid="theme-detail-back"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar para temas
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="theme-detail-edit"
            onClick={() => setEditOpen(true)}
            aria-label="Editar tema"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Pencil className="w-4 h-4" /> Editar
          </button>
          <button
            type="button"
            data-testid="theme-detail-delete"
            onClick={() => setDeleteOpen(true)}
            aria-label="Remover tema"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="w-4 h-4" /> Remover
          </button>
        </div>
      </div>

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

        {/* Sprint stats-themes-linking-1 RF-05: Stats foco section.
            Polish #2: empty-state CTA continua chamando onConfigureClick;
            esse e o entry point do empty case. Quando ja ha stats linkadas,
            o empty state nao aparece — entry point fica apenas no rodape
            ("Editar stats foco"). */}
        <ThemeStatsFocoSection
          themeId={themeId}
          stats={statsSummary}
          onConfigureClick={() => setPickerOpen(true)}
          pickerOpen={pickerOpen}
        />

        {/* Sprint EST-3 (ADR-222 / RF-08 surface 1) — CTA "Analisar esta stat"
            por stat foco linkada. Navega para o form unificado em mode
            stat_analysis com statId+themeId pre-preenchidos. */}
        {statsSummary.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Analisar uma stat</h3>
            <div className="flex flex-wrap gap-2">
              {statsSummary.map((stat) => (
                <button
                  key={stat.statId}
                  type="button"
                  data-testid={`analyze-stat-button-${stat.statId}`}
                  onClick={() =>
                    navigate(
                      `/estudos/registrar?mode=stat_analysis&statId=${encodeURIComponent(stat.statId)}&themeId=${encodeURIComponent(themeId)}`,
                    )
                  }
                  className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent"
                >
                  Analisar {stat.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Polish #3: drawer migrado para Collapsible (Radix) — aria-expanded
            no trigger gratis, transicao suave, mantido inline (nao overlay).
            #2: rodape NAO toggle; sempre setPickerOpen(true) e exibe APENAS
            quando ja ha stats linkadas (entry point complementar ao empty CTA). */}
        <Collapsible open={pickerOpen} onOpenChange={setPickerOpen}>
          <CollapsibleContent>
            <div
              data-testid="theme-detail-stat-picker-drawer"
              className="rounded-lg border border-border bg-card/40 p-4 mt-2"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium">Editar stats foco</h3>
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
          </CollapsibleContent>
        </Collapsible>

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
          {/* Polish #2: rodape edit so quando ha stats linkadas; nunca toggle. */}
          {Array.isArray(theme.linkedStats) && theme.linkedStats.length > 0 && (
            <button
              type="button"
              data-testid="theme-detail-configure-stats"
              aria-expanded={pickerOpen}
              onClick={() => setPickerOpen(true)}
              className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent"
            >
              Editar stats foco
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/estudos/temas')}
            className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent"
          >
            Ver outros temas
          </button>
        </div>

        {/* Sprint EST-3 (ADR-222 / RF-08 surface 2) — revisao das analises de
            stat agrupadas por stat dentro deste tema. */}
        <div data-testid="theme-stat-analysis-review" className="pt-4 border-t border-border">
          <h3 className="text-sm font-medium mb-3">Revisao por stat</h3>
          <StatAnalysisReviewList themeId={themeId} />
        </div>

        {/* Sprint MDA-1 (ADR-230 / RF-05) — MDAs da populacao tagueados ao tema. */}
        <div className="pt-4 border-t border-border">
          <MdaReadsSection themeId={themeId} />
        </div>
      </div>

      <ThemeFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        initial={{
          name: theme.name,
          color: theme.color ?? undefined,
          emoji: theme.emoji ?? undefined,
        }}
        onSubmit={handleEdit}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent data-testid="theme-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover este tema?</AlertDialogTitle>
            <AlertDialogDescription>
              O tema <strong>{theme.name}</strong> e todas as suas abas serão
              removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="theme-delete-confirm-action"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                deleteMutation.mutate();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

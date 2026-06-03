/**
 * Sprint EST-3 (ADR-222 / RF-08 surface 3) + Sprint Estudos-UX (founder).
 *
 * Pagina de detalhe da sessao de estudo registrada (/estudos/analise/:id). O
 * form unificado (StudySessionForm) redireciona pra ca pos-registro de QUALQUER
 * modo — entao a pagina precisa renderizar o registro inteiro, nao so as
 * jogadas de stat_analysis:
 *   - header com voltar + badge do modo + data + duracao
 *   - tema (quando vinculado)
 *   - notas livres (antes invisiveis -> sensacao de "registrei e sumiu")
 *   - jogadas (stat_analysis) com prints jogada + solucao GTO
 *   - spots dificeis (revisao de torneio / maos)
 *   - plataforma + precisao (drill GTO)
 *   - insights da aula
 *
 * Consome GET /api/study-sessions/:id/detail (shape v2 — imagens vem como URLs
 * servíveis). Sub-path dedicado: GET /:id "cru" pertence ao legado studies.ts.
 *
 * Lessons: #1 hooks first; #2 data-testid estaveis (session-detail-page,
 * session-detail-hands-solved, session-detail-filters-analyzed,
 * session-detail-entry-{id}); #9 query tolerante; #13 apiRequest direto.
 */

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { ArrowLeft, Upload, Loader2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { getStatById } from '@shared/hud-stat-catalog';

// H1 (Sprint Estudos-Flow-Review): upload de prints (jogada + solucao GTO) por
// entry de stat_analysis. Endpoint POST /:id/stat-analysis/entries/:entryId/image
// (multer campo "file" + body.slot play|solution; magic-bytes; 5MB).
const MAX_IMG = 5 * 1024 * 1024;
const ACCEPT_MIME = 'image/png,image/jpeg,image/webp';

interface SessionEntry {
  id: string;
  filters: string;
  errorText: string;
  learnedText: string;
  playImageUrl: string | null;
  solutionImageUrl: string | null;
}
interface DifficultSpot {
  context: string;
  note: string;
}
interface SessionDetail {
  id: string;
  mode: string;
  themeId?: string | null;
  statId?: string | null;
  durationMinutes?: number | null;
  registeredAt?: string | null;
  notes?: string | null;
  drillPlatform?: string | null;
  drillAccuracy?: number | null;
  difficultSpots?: DifficultSpot[] | null;
  handsSolvedCount?: number | null;
  filtersAnalyzedCount?: number | null;
  lessonInsights?: string | null;
  statAnalysisEntries?: SessionEntry[] | null;
}

interface ThemeRow {
  id: string;
  name: string;
  emoji?: string | null;
}

interface Props {
  sessionId: string;
}

// PT-BR labels dos modos (espelha o select do StudySessionForm).
const MODE_LABELS: Record<string, string> = {
  drill_gto: 'Drill GTO',
  tournament_review: 'Revisao de torneio',
  hand_review: 'Revisao de maos',
  lesson: 'Aula',
  stat_analysis: 'Analise de stat',
  other: 'Outro',
};

const DRILL_PLATFORM_LABELS: Record<string, string> = {
  gtowizard: 'GTO Wizard',
  gtoplus: 'GTO+',
  piosolver: 'PioSolver',
  deepsolver: 'DeepSolver',
  simple_gto: 'Simple GTO Trainer',
  other: 'Outra',
};

function formatDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function SessaoDetailPage({ sessionId }: Props): JSX.Element {
  const [, navigate] = useLocation();

  const { data: session, isLoading, isError, refetch } = useQuery<SessionDetail>({
    queryKey: ['/api/study-sessions', sessionId, 'detail'],
    queryFn: () => apiRequest('GET', `/api/study-sessions/${sessionId}/detail`),
    enabled: !!sessionId,
  });

  // Resolve nome do tema (best-effort — nao bloqueia o render).
  const { data: themes = [] } = useQuery<ThemeRow[]>({
    queryKey: ['/api/study-themes'],
    queryFn: () => apiRequest('GET', '/api/study-themes'),
    staleTime: 30_000,
    enabled: !!session?.themeId,
  });

  // H1: estado do upload de print por (entryId:slot).
  const qc = useQueryClient();
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string>('');

  async function handleUpload(entryId: string, slot: 'play' | 'solution', file: File) {
    setUploadError('');
    if (file.size > MAX_IMG) {
      setUploadError('Imagem maior que 5MB.');
      return;
    }
    const key = `${entryId}:${slot}`;
    setUploadingKey(key);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('slot', slot);
      await apiRequest(
        'POST',
        `/api/study-sessions/${sessionId}/stat-analysis/entries/${entryId}/image`,
        fd,
      );
      // Re-fetch o detalhe -> URLs servíveis das imagens recem-enviadas.
      qc.invalidateQueries({ queryKey: ['/api/study-sessions', sessionId, 'detail'] });
    } catch (err: any) {
      setUploadError(err?.message ? String(err.message) : 'Erro ao enviar imagem.');
    } finally {
      setUploadingKey(null);
    }
  }

  if (isLoading) {
    return (
      <div className="h-32 rounded-lg bg-muted/30 animate-pulse m-4" aria-hidden />
    );
  }

  // Erro de fetch OU sessao inexistente (404) — antes caia no skeleton infinito.
  if (isError || !session) {
    return (
      <div
        data-testid="session-detail-error"
        className="space-y-4 p-4 sm:p-6 max-w-2xl mx-auto"
      >
        <button
          type="button"
          onClick={() => navigate('/estudos/sessoes')}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="rounded-lg border border-border bg-card p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Nao foi possivel carregar esta sessao. Ela pode ter sido removida ou
            houve um erro de conexao.
          </p>
          <button
            type="button"
            data-testid="session-detail-retry"
            onClick={() => refetch()}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const entries = Array.isArray(session.statAnalysisEntries)
    ? session.statAnalysisEntries
    : [];
  const spots = Array.isArray(session.difficultSpots)
    ? session.difficultSpots
    : [];
  const statLabel = session.statId
    ? getStatById(session.statId)?.label ?? session.statId
    : '';
  const modeLabel = MODE_LABELS[session.mode] ?? session.mode;
  const theme = session.themeId
    ? themes.find((t) => t.id === session.themeId) ?? null
    : null;
  const isReview =
    session.mode === 'tournament_review' || session.mode === 'hand_review';
  const dateStr = formatDate(session.registeredAt);

  function goBack() {
    navigate(session?.themeId ? `/estudos/temas/${session.themeId}` : '/estudos/sessoes');
  }

  return (
    <div data-testid="session-detail-page" className="space-y-6 p-4 sm:p-6 max-w-2xl mx-auto">
      {/* Header: voltar + modo + meta */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium">
            {modeLabel}
          </span>
          {theme ? (
            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
              {theme.emoji ? `${theme.emoji} ` : ''}
              {theme.name}
            </span>
          ) : null}
          {typeof session.durationMinutes === 'number' && session.durationMinutes > 0 ? (
            <span className="text-xs text-muted-foreground">
              {session.durationMinutes} min
            </span>
          ) : null}
          {dateStr ? (
            <span className="text-xs text-muted-foreground">· {dateStr}</span>
          ) : null}
        </div>
      </div>

      {/* Contadores enriquecidos (sempre — testids estaveis) */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Maos solucionadas</p>
          <p data-testid="session-detail-hands-solved" className="text-lg font-semibold">
            {session.handsSolvedCount ?? '—'}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Filtros analisados</p>
          <p data-testid="session-detail-filters-analyzed" className="text-lg font-semibold">
            {session.filtersAnalyzedCount ?? '—'}
          </p>
        </div>
      </div>

      {/* Notas livres — antes invisiveis. */}
      {session.notes ? (
        <div
          data-testid="session-detail-notes"
          className="rounded-lg border border-border bg-card p-4"
        >
          <p className="text-xs text-muted-foreground mb-1">Anotacoes</p>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{session.notes}</p>
        </div>
      ) : null}

      {/* drill_gto: plataforma + precisao */}
      {session.mode === 'drill_gto' &&
      (session.drillPlatform || typeof session.drillAccuracy === 'number') ? (
        <div className="rounded-lg border border-border bg-card p-4 flex flex-wrap gap-6 text-sm">
          {session.drillPlatform ? (
            <div>
              <p className="text-xs text-muted-foreground">Plataforma</p>
              <p className="font-medium">
                {DRILL_PLATFORM_LABELS[session.drillPlatform] ?? session.drillPlatform}
              </p>
            </div>
          ) : null}
          {typeof session.drillAccuracy === 'number' ? (
            <div>
              <p className="text-xs text-muted-foreground">Precisao</p>
              <p className="font-medium">{session.drillAccuracy}%</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Spots dificeis (revisao de torneio / maos) */}
      {isReview && spots.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Spots dificeis</h3>
          {spots.map((spot, i) => (
            <div
              key={i}
              data-testid={`session-detail-spot-${i}`}
              className="rounded-lg border border-border bg-card p-3 text-sm space-y-1"
            >
              {spot.context ? <p className="font-medium">{spot.context}</p> : null}
              {spot.note ? (
                <p className="text-muted-foreground whitespace-pre-wrap">{spot.note}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* Jogadas (stat_analysis) — prints jogada + solucao GTO */}
      {session.mode === 'stat_analysis' && (
        <div className="space-y-4">
          {statLabel ? (
            <h3 className="text-sm font-semibold">Stat: {statLabel}</h3>
          ) : null}
          {uploadError ? (
            <p
              data-testid="session-detail-upload-error"
              className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
            >
              {uploadError}
            </p>
          ) : null}
          {entries.map((entry) => (
            <div
              key={entry.id}
              data-testid={`session-detail-entry-${entry.id}`}
              className="rounded-lg border border-border bg-card p-3 space-y-2 text-sm"
            >
              {entry.filters ? (
                <p className="text-xs text-muted-foreground">{entry.filters}</p>
              ) : null}
              {entry.errorText ? <p>Erro: {entry.errorText}</p> : null}
              {entry.learnedText ? <p>Aprendizado: {entry.learnedText}</p> : null}
              <div className="flex flex-wrap gap-4">
                {(['play', 'solution'] as const).map((slot) => {
                  const url = slot === 'play' ? entry.playImageUrl : entry.solutionImageUrl;
                  const label = slot === 'play' ? 'Jogada' : 'Solucao GTO';
                  const busy = uploadingKey === `${entry.id}:${slot}`;
                  return (
                    <div key={slot} className="space-y-1">
                      {url ? (
                        <img src={url} alt={label} className="h-20 rounded border border-border" />
                      ) : (
                        <div className="grid h-20 w-28 place-items-center rounded border border-dashed border-border text-[10px] text-muted-foreground">
                          Sem print
                        </div>
                      )}
                      <label
                        data-testid={`session-detail-upload-${slot}-${entry.id}`}
                        className="inline-flex cursor-pointer items-center gap-1 rounded border border-border px-2 py-1 text-[11px] hover:bg-muted"
                      >
                        {busy ? (
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                        ) : (
                          <Upload className="h-3 w-3" aria-hidden />
                        )}
                        {url ? `Trocar ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
                        <input
                          type="file"
                          accept={ACCEPT_MIME}
                          className="hidden"
                          disabled={busy}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleUpload(entry.id, slot, f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Insights da aula */}
      {session.lessonInsights ? (
        <div className="rounded-lg border border-border bg-card p-3 text-sm">
          <p className="text-xs text-muted-foreground mb-1">Insights da aula</p>
          <p className="whitespace-pre-wrap">{session.lessonInsights}</p>
        </div>
      ) : null}
    </div>
  );
}

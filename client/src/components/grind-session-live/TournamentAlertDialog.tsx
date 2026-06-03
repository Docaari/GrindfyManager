/**
 * TournamentAlertDialog — Dialog para criar alarmes vinculados a torneios.
 * Sprint Alarmes 2.0 — RF-03 (P1-1, P1-2, P1-3).
 *
 * Modos progressivos:
 *  1. "Antes do start" (default, 10min)
 *  2. "Antes do late close" (so visivel se lateRegMinutes > 0)
 *  3. "Outro horario..." (colapsado, expansao mostra input time)
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Volume2, X } from 'lucide-react';
import { speakUtterance } from '@/lib/ttsVoices';
import { buildTournamentNarration } from '@/lib/tournamentNarration';

export interface TournamentLite {
  id: string;
  name: string;
  site: string;
  buyIn: string;
  startTime: Date;
  lateRegMinutes?: number;
}

export interface TournamentAlertCreatePayload {
  type: 'tournament';
  tournamentId: string;
  narrationText: string;
  triggerAt: Date;
  label: string;
}

interface TournamentAlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plannedTournaments: TournamentLite[];
  sessionTournaments?: TournamentLite[];
  onCreate: (payload: TournamentAlertCreatePayload) => void;
  ttsAvailable: boolean;
  voice: SpeechSynthesisVoice | null;
  volume: number;
  redactBuyIn: boolean;
  /**
   * Pre-seleciona um torneio e bloqueia o select. Usado quando o dialog eh
   * aberto a partir do botao "Alerta" de um TournamentCard especifico.
   */
  defaultTournamentId?: string | null;
}

type TriggerMode = 'before-start' | 'before-late' | 'absolute';

export function TournamentAlertDialog({
  open,
  onOpenChange,
  plannedTournaments,
  sessionTournaments = [],
  onCreate,
  ttsAvailable,
  voice,
  volume,
  redactBuyIn,
  defaultTournamentId = null,
}: TournamentAlertDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isLocked = Boolean(defaultTournamentId);

  // Sincroniza selectedId com defaultTournamentId quando o dialog abre.
  useEffect(() => {
    if (open && defaultTournamentId) {
      setSelectedId(defaultTournamentId);
    }
    if (!open) {
      // Reseta selecao ao fechar pra proxima abertura comecar limpo.
      setSelectedId(null);
    }
  }, [open, defaultTournamentId]);
  const [mode, setMode] = useState<TriggerMode>('before-start');
  const [minutesBeforeStart, setMinutesBeforeStart] = useState<string>('10');
  const [minutesBeforeLate, setMinutesBeforeLate] = useState<string>('5');
  const [absoluteTime, setAbsoluteTime] = useState<string>('');
  const [showAbsolute, setShowAbsolute] = useState(false);
  const [error, setError] = useState<string>('');

  // Lista combinada + ordenada por proximidade temporal.
  const tournaments = useMemo(() => {
    const all = [...plannedTournaments, ...sessionTournaments];
    return all.slice().sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }, [plannedTournaments, sessionTournaments]);

  const selected = useMemo(
    () => tournaments.find((t) => t.id === selectedId) ?? null,
    [tournaments, selectedId]
  );

  // Reset inputs quando troca selecao (incondicional — selectedId apontando para
  // torneio fora da lista atual deve limpar state stale tambem).
  useEffect(() => {
    setMinutesBeforeStart('10');
    setMinutesBeforeLate('5');
    setMode('before-start');
    setShowAbsolute(false);
    setAbsoluteTime('');
    setError('');
  }, [selectedId]);

  // Narracao preview gerada a partir do torneio + redactBuyIn.
  const narration = useMemo(() => {
    if (!selected) return '';
    return buildTournamentNarration(
      { site: selected.site, name: selected.name, buyIn: selected.buyIn },
      { redactBuyIn }
    );
  }, [selected, redactBuyIn]);

  // Calcula triggerAt baseado no mode.
  const computedTriggerAt = useMemo<Date | null>(() => {
    if (!selected) return null;
    if (mode === 'before-start') {
      const m = parseInt(minutesBeforeStart, 10);
      if (isNaN(m)) return null;
      return new Date(selected.startTime.getTime() - m * 60_000);
    }
    if (mode === 'before-late' && selected.lateRegMinutes) {
      const deadline = new Date(
        selected.startTime.getTime() + selected.lateRegMinutes * 60_000
      );
      const m = parseInt(minutesBeforeLate, 10);
      if (isNaN(m)) return null;
      return new Date(deadline.getTime() - m * 60_000);
    }
    if (mode === 'absolute' && absoluteTime) {
      const [hh, mm] = absoluteTime.split(':').map(Number);
      const t = new Date();
      t.setHours(hh, mm, 0, 0);
      // Auto-rollover: HH:MM ja passou hoje -> alvo eh amanha (cross-midnight grind).
      if (t.getTime() <= Date.now()) {
        t.setDate(t.getDate() + 1);
      }
      return t;
    }
    return null;
  }, [selected, mode, minutesBeforeStart, minutesBeforeLate, absoluteTime]);

  const handleSave = () => {
    setError('');
    if (!selected || !computedTriggerAt) {
      setError('Selecione um torneio e um horario');
      return;
    }
    if (computedTriggerAt.getTime() <= Date.now()) {
      setError('Horario ja passou');
      return;
    }
    onCreate({
      type: 'tournament',
      tournamentId: selected.id,
      narrationText: narration,
      triggerAt: computedTriggerAt,
      label: `${selected.name} (${selected.site})`,
    });
    onOpenChange(false);
  };

  const handlePreview = () => {
    if (!selected || !ttsAvailable) return;
    speakUtterance(narration, voice, volume);
  };

  const previewDisabled = !selected || !ttsAvailable;

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tournament-alert-dialog-title"
      data-testid="tournament-alert-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onOpenChange(false);
      }}
    >
      <div className="bg-card border border-gray-700 text-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 id="tournament-alert-dialog-title" className="text-base font-semibold">
            Criar alerta de torneio
          </h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-gray-400 hover:text-white"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Lista de torneios (P1-2 ordenada por proximidade).
              Quando isLocked, renderiza apenas o torneio pre-selecionado em modo display. */}
          {isLocked && selected ? (
            <div
              data-testid="tournament-locked-display"
              className="px-3 py-2 rounded border bg-amber-600/20 border-amber-500 text-amber-100"
            >
              <div className="font-medium">{selected.name}</div>
              <div className="text-xs text-amber-200/80">
                {selected.site} · {new Date(selected.startTime).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          ) : (
            <div data-testid="tournament-select" className="space-y-1 max-h-48 overflow-y-auto">
              {tournaments.map((t) => (
                <button
                  key={t.id}
                  data-testid={`tournament-option-${t.id}`}
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full text-left px-3 py-2 rounded border text-sm transition-colors ${
                    selectedId === t.id
                      ? 'bg-amber-600/20 border-amber-500 text-amber-100'
                      : 'bg-gray-800/40 border-gray-700 text-gray-200 hover:bg-gray-700/40'
                  }`}
                >
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-gray-400">
                    {t.site} · {new Date(t.startTime).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </button>
              ))}
            </div>
          )}

          {selected && (
            <>
              {/* Mode 1: Antes do start (P1-1 default) */}
              <div className="space-y-1">
                <Label className="text-xs text-gray-300">Antes do start (min)</Label>
                <Input
                  data-testid="minutes-before-start-input"
                  type="number"
                  min={1}
                  max={120}
                  value={minutesBeforeStart}
                  onChange={(e) => {
                    setMode('before-start');
                    setMinutesBeforeStart(e.target.value);
                  }}
                  className="bg-gray-900 border-gray-600 text-white text-sm h-8 w-24"
                />
              </div>

              {/* Mode 2: Antes do late close — so se lateRegMinutes > 0 */}
              {selected.lateRegMinutes !== undefined && selected.lateRegMinutes > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs text-gray-300">Antes do late close (min)</Label>
                  <Input
                    data-testid="minutes-before-late-input"
                    type="number"
                    min={1}
                    max={120}
                    value={minutesBeforeLate}
                    onChange={(e) => {
                      setMode('before-late');
                      setMinutesBeforeLate(e.target.value);
                    }}
                    className="bg-gray-900 border-gray-600 text-white text-sm h-8 w-24"
                  />
                </div>
              )}

              {/* Mode 3: Outro horario (colapsado) */}
              <button
                type="button"
                data-testid="trigger-mode-absolute-toggle"
                onClick={() => {
                  setShowAbsolute((prev) => !prev);
                  setMode('absolute');
                }}
                className="text-xs text-amber-400 hover:underline"
              >
                Outro horario...
              </button>
              {showAbsolute && (
                <div className="space-y-1">
                  <Label className="text-xs text-gray-300">Horario (HH:MM)</Label>
                  <Input
                    data-testid="trigger-mode-absolute-input"
                    type="time"
                    value={absoluteTime}
                    onChange={(e) => {
                      setMode('absolute');
                      setAbsoluteTime(e.target.value);
                    }}
                    className="bg-gray-900 border-gray-600 text-white text-sm h-8 w-32"
                  />
                </div>
              )}

              {/* Narration preview */}
              <div className="space-y-1">
                <Label className="text-xs text-gray-300">Como vai soar</Label>
                <p
                  data-testid="narration-preview"
                  className="text-sm text-amber-300 italic"
                >
                  {narration}
                </p>
              </div>
            </>
          )}

          {!selected && (
            <p
              data-testid="narration-preview"
              className="text-sm text-gray-500 italic"
            >
              Selecione um torneio para ver a previa
            </p>
          )}

          {error && (
            <p data-testid="error-msg" className="text-red-400 text-xs">
              {error}
            </p>
          )}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              data-testid="preview-btn"
              disabled={previewDisabled}
              onClick={handlePreview}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium border border-gray-600 text-gray-200 hover:bg-gray-700/40 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Ouvir como vai soar"
            >
              <Volume2 className="w-3.5 h-3.5" />
              Ouvir como vai soar
            </button>
            <Button
              data-testid="save-btn"
              onClick={handleSave}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs"
            >
              Criar alerta
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TournamentAlertDialog;

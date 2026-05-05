/**
 * RF-12 — NextTournamentCountdown (Sprint home-reform-1).
 *
 * Spec: Docs/specs/home-reform-1.md §RF-12, §5.4 S4, §3 D15
 *       Docs/specs/home-reform-5.md item 3.2 — renomeado para "Iniciar Sessao".
 *
 * home-reform-5 item 3.2:
 *   - Titulo do card renomeado para "Iniciar Sessao".
 *   - CTA principal abre modal Inicio Rapido em /grind?open=quickstart.
 *   - Conteudo: total de torneios planejados hoje no(s) perfil(s) ativo(s).
 *   - Empty state DAY OFF quando nenhum perfil ativo.
 *   - Mantem countdown legacy quando coachContext nao fornecido + nextTournament
 *     existe (usado por callers nao migrados).
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'wouter';

interface NextTournamentData {
  startTime: string;
  name: string;
  buyin: number;
  currency: string;
  platform: string;
}

interface CoachContext {
  activeProfiles: ('A' | 'B' | 'C')[];
  todayTournamentsTotal: number;
  isDayOff: boolean;
}

interface Props {
  data: NextTournamentData | null;
  coachContext?: CoachContext;
}

function diffSeconds(target: string, now: number): number {
  const t = new Date(target).getTime();
  if (isNaN(t)) return 0;
  return Math.floor((t - now) / 1000);
}

function fmtCountdown(secs: number): string {
  if (secs <= 0) return 'Em andamento';
  if (secs < 60) return 'Comecando agora';
  const totalMin = Math.floor(secs / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) {
    return `Em ${h}h ${m}min`;
  }
  return `Em ${m}min`;
}

export default function NextTournamentCountdown({
  data,
  coachContext,
}: Props): JSX.Element | null {
  // Hooks first.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!data || coachContext) return;
    // Tick a cada 30s — display tem granularidade de minuto, sem necessidade de 1Hz.
    const id = setInterval(() => {
      setNow((prev) => {
        const next = Date.now();
        const prevSecs = diffSeconds(data.startTime, prev);
        const nextSecs = diffSeconds(data.startTime, next);
        if (
          fmtCountdown(prevSecs) === fmtCountdown(nextSecs) &&
          (prevSecs <= 0) === (nextSecs <= 0)
        ) {
          return prev;
        }
        return next;
      });
    }, 30_000);
    return () => clearInterval(id);
  }, [data, coachContext]);

  // Sprint home-reform-5 item 3.2 — modo "Iniciar Sessao" (consome coachContext).
  if (coachContext) {
    const noun = coachContext.todayTournamentsTotal === 1 ? 'torneio' : 'torneios';
    return (
      <div
        data-testid="next-tournament-countdown"
        className="rounded-lg border border-border bg-card p-4"
      >
        <div
          data-testid="iniciar-sessao-title"
          className="text-xs uppercase text-muted-foreground tracking-wide"
        >
          Iniciar Sessao
        </div>
        {coachContext.isDayOff ? (
          <div
            data-testid="iniciar-sessao-day-off"
            className="mt-2 text-base font-semibold"
          >
            DAY OFF
          </div>
        ) : (
          <>
            <div
              data-testid="iniciar-sessao-count"
              className="mt-1 text-base font-semibold"
            >
              {coachContext.todayTournamentsTotal} {noun} planejados
            </div>
            <div className="text-xs text-muted-foreground">
              {coachContext.activeProfiles.join(' + ')}
            </div>
            <Link href="/grind?open=quickstart">
              <a
                data-testid="iniciar-sessao-cta"
                href="/grind?open=quickstart"
                className="mt-3 inline-flex items-center px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90"
              >
                Inicio Rapido →
              </a>
            </Link>
          </>
        )}
      </div>
    );
  }

  if (!data) return null;

  const secs = diffSeconds(data.startTime, now);
  const text = fmtCountdown(secs);
  const inProgress = secs <= 0;

  return (
    <div
      data-testid="next-tournament-countdown"
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="text-xs uppercase text-muted-foreground tracking-wide">
        Proximo torneio
      </div>
      <div className="mt-1 text-base font-semibold">{data.name}</div>
      <div className="text-sm text-muted-foreground">{text}</div>
      {inProgress && (
        <Link href="/grind-live">
          <a
            data-testid="next-tournament-cta-grind"
            href="/grind-live"
            className="mt-2 inline-block text-sm text-primary hover:underline"
          >
            → Grind live
          </a>
        </Link>
      )}
    </div>
  );
}

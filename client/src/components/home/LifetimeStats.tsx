/**
 * RF-14 — LifetimeStats F1 historico geral compacto (Sprint home-reform-1).
 *
 * Spec: Docs/specs/home-reform-1.md §RF-14, §5.6 F1, §3 D10
 * ADR-099 §2.2 — anti-gamificacao (sem emoji fogo/alvo/estrela, sem cor de
 * destaque na streak, sem "vs ultima semana").
 *
 * 4 metricas em row: Torneios / Sessoes / Dias ativos / Streak.
 * Numeros formatados PT-BR (separador de milhar `.`). Bloco clicavel → /dashboard.
 */

import React from 'react';
import { Link } from 'wouter';

interface LifetimeData {
  totalTournaments: number;
  totalSessions: number;
  activeDays: number;
  currentStreakDays: number;
}

interface Props {
  data: LifetimeData;
}

function fmt(n: number): string {
  return n.toLocaleString('pt-BR');
}

function Cell(props: {
  testId: string;
  label: string;
  value: number;
  numberTestId?: string;
}): JSX.Element {
  return (
    <div
      data-testid={props.testId}
      className="flex flex-col items-start gap-0.5"
    >
      <span
        data-testid={props.numberTestId}
        className="text-2xl font-bold text-foreground"
      >
        {fmt(props.value)}
      </span>
      <span
        // Note: label NAO recebe testid prefixo lifetime-cell- para nao conflitar
        // com regex `^lifetime-cell-` usado pelos testes de contagem.
        className="text-xs uppercase tracking-wide text-muted-foreground"
      >
        {props.label}
      </span>
    </div>
  );
}

export default function LifetimeStats({ data }: Props): JSX.Element {
  return (
    <Link href="/dashboard">
      <a
        data-testid="lifetime-stats-link"
        href="/dashboard"
        className="block rounded-lg border border-border bg-card p-4 hover:bg-accent transition-colors"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Cell
            testId="lifetime-cell-torneios"
            label="Torneios"
            value={data.totalTournaments}
          />
          <Cell
            testId="lifetime-cell-sessoes"
            label="Sessoes"
            value={data.totalSessions}
          />
          <Cell
            testId="lifetime-cell-dias-ativos"
            label="Dias ativos"
            value={data.activeDays}
          />
          <Cell
            testId="lifetime-cell-streak"
            label="Streak (dias)"
            value={data.currentStreakDays}
          />
        </div>
      </a>
    </Link>
  );
}

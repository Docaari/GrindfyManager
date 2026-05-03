/**
 * RF-15 — RecentSessionsList F2 ultimas sessoes top 5 (Sprint home-reform-1).
 *
 * Spec: Docs/specs/home-reform-1.md §RF-15, §5.7 F2, §3 D11
 *
 * 5 cards verticais. Cada um: data DD/MM, PnL com cor (verde/vermelho/neutro),
 * qtd torneios, plataforma, status badge. Empty state com 2 CTAs.
 */

import React from 'react';
import { Link } from 'wouter';

interface RecentSession {
  id: string;
  date: string;
  pnlUsd: number;
  tournamentCount: number;
  primaryPlatform: string;
  // Tolerante a string para nao exigir `as const` em fixtures de teste/dados runtime.
  status: string;
}

interface Props {
  data: RecentSession[];
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  // Tenta parsear ISO "2026-05-01" e formatar DD/MM.
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}`;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}`;
  } catch {
    return iso;
  }
}

function fmtPnl(v: number): string {
  const abs = Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  if (v > 0) return `+$${abs}`;
  if (v < 0) return `-$${abs}`;
  return '$0';
}

function pnlClass(v: number): string {
  if (v > 0) return 'text-green-400';
  if (v < 0) return 'text-red-400';
  return 'text-foreground';
}

function sessionHref(s: RecentSession): string {
  return s.status === 'live' ? `/grind-live/${s.id}` : `/dashboard?session=${s.id}`;
}

export default function RecentSessionsList({ data }: Props): JSX.Element {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Nenhuma sessao registrada — comece importando seu primeiro CSV ou
          iniciando uma sessao live.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/upload">
            <a
              data-testid="recent-sessions-empty-cta-import"
              href="/upload"
              className="inline-flex items-center px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90"
            >
              Importar CSV →
            </a>
          </Link>
          <Link href="/grind-live">
            <a
              data-testid="recent-sessions-empty-cta-live"
              href="/grind-live"
              className="inline-flex items-center px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent"
            >
              Iniciar sessao live →
            </a>
          </Link>
        </div>
      </div>
    );
  }

  const items = data.slice(0, 5);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold mb-3">Ultimas sessoes</h3>
      <ul className="space-y-2">
        {items.map((s) => (
          <li key={s.id}>
            <Link href={sessionHref(s)}>
              <a
                data-testid={`recent-session-card-${s.id}`}
                href={sessionHref(s)}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-12">
                    {fmtDate(s.date)}
                  </span>
                  <span
                    data-testid={`recent-session-pnl-${s.id}`}
                    className={`font-semibold text-sm ${pnlClass(s.pnlUsd)}`}
                  >
                    {fmtPnl(s.pnlUsd)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {s.tournamentCount} torneios · {s.primaryPlatform}
                  </span>
                </div>
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded-md border border-border text-muted-foreground">
                  {s.status}
                </span>
              </a>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/dashboard">
        <a
          data-testid="recent-sessions-cta-ver-historico"
          href="/dashboard"
          className="mt-3 inline-block text-sm text-primary hover:underline"
        >
          Ver historico completo →
        </a>
      </Link>
    </div>
  );
}

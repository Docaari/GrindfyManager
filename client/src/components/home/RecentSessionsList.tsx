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
import { tokens } from '@/lib/ui-tokens';

interface RecentSession {
  id: string;
  date: string;
  pnlUsd: number;
  tournamentCount: number;
  primaryPlatform: string;
  // Tolerante a string para nao exigir `as const` em fixtures de teste/dados runtime.
  status: string;
  // Sprint home-reform-5 item 6 — KPIs por sessao (FX-normalizado USD).
  investedUsd?: number;
  roi?: number | null;
  itm?: number;
  finalTables?: number;
  wins?: number;
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
  if (v > 0) return tokens.color.success.text;
  if (v < 0) return tokens.color.danger.text;
  return 'text-foreground';
}

function sessionHref(s: RecentSession): string {
  return s.status === 'live' ? `/grind-live` : `/dashboard?session=${s.id}`;
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
        {items.map((s) => {
          const roi = s.roi == null ? null : s.roi;
          const roiLabel = roi == null
            ? '—'
            : `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`;
          return (
            <li key={s.id}>
              <Link href={sessionHref(s)}>
                <a
                  data-testid={`recent-session-card-${s.id}`}
                  href={sessionHref(s)}
                  className="flex flex-col gap-1 px-3 py-2 rounded-md hover:bg-accent transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
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
                  </div>
                  {/* Sprint home-reform-5 item 6 — KPIs por sessao */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-[60px] text-[11px] text-muted-foreground">
                    <span data-testid={`recent-session-roi-${s.id}`}>
                      ROI: <span className="font-medium text-foreground">{roiLabel}</span>
                    </span>
                    <span data-testid={`recent-session-itm-${s.id}`}>
                      ITM: <span className="font-medium text-foreground">{s.itm ?? 0}</span>
                    </span>
                    <span data-testid={`recent-session-final-tables-${s.id}`}>
                      MF: <span className="font-medium text-foreground">{s.finalTables ?? 0}</span>
                    </span>
                    <span data-testid={`recent-session-wins-${s.id}`}>
                      Cravadas: <span className="font-medium text-foreground">{s.wins ?? 0}</span>
                    </span>
                  </div>
                </a>
              </Link>
            </li>
          );
        })}
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

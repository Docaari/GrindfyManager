/**
 * Sprint Studies-Reform — RF-02: Continue de onde parou (top 3 temas)
 */

import React, { useMemo } from 'react';
import { useLocation } from 'wouter';

interface ThemeRow {
  id: string;
  name: string;
  emoji?: string;
  color?: string;
  progress?: number;
  lastVisitedAt?: string | null;
  lastTab?: { id: string; name: string } | null;
}

interface ContinueWhereLeftOffProps {
  themes: ThemeRow[];
}

function relativeTime(iso?: string | null): string {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const diffMs = Date.now() - ts;
  if (diffMs < 60_000) return 'agora';
  const m = Math.floor(diffMs / 60_000);
  if (m < 60) return `ha ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `ha ${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ontem';
  if (d < 7) return `ha ${d} dias`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function ContinueWhereLeftOff({ themes }: ContinueWhereLeftOffProps) {
  const [, navigate] = useLocation();

  const top = useMemo(() => {
    const sorted = [...(themes ?? [])].sort((a, b) => {
      const ta = a?.lastVisitedAt ? Date.parse(a.lastVisitedAt) : 0;
      const tb = b?.lastVisitedAt ? Date.parse(b.lastVisitedAt) : 0;
      return tb - ta;
    });
    return sorted.slice(0, 3);
  }, [themes]);

  if (!top.length) {
    return (
      <div data-testid="continue-empty" className="text-xs text-gray-500">
        Sem temas recentes.
      </div>
    );
  }

  function go(t: ThemeRow) {
    const tabPart = t.lastTab?.id ? `?tab=${encodeURIComponent(t.lastTab.id)}` : '';
    navigate(`/estudos/temas/${t.id}${tabPart}`);
  }

  return (
    <div className="space-y-2">
      {top.map((t) => (
        <button
          key={t.id}
          type="button"
          data-testid={`studies-dashboard-card-continue-item-${t.id}`}
          onClick={() => go(t)}
          className="w-full text-left rounded-md border border-gray-700 bg-gray-800/70 px-3 py-2 hover:bg-gray-800 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-white">
              {t.emoji ? `${t.emoji} ` : ''}
              {t.name}
            </div>
            <div className="text-[11px] text-gray-400">{t.progress ?? 0}%</div>
          </div>
          {t.lastTab?.name && (
            <div className="text-[11px] text-gray-500 mt-1">Aba: {t.lastTab.name}</div>
          )}
          {t.lastVisitedAt && (
            <div className="text-[11px] text-gray-500 mt-1">{relativeTime(t.lastVisitedAt)}</div>
          )}
        </button>
      ))}
    </div>
  );
}

export default ContinueWhereLeftOff;

/**
 * CoachPendingBanner — Sprint coach-page-reform-1 RF-04.
 * Spec: Docs/specs/sprint-coach-page-reform-1.md §RF-04.
 *
 * Banner colapsavel no topo de /coach com checklist de pendencias para founder
 * validar nas proximas reviews. Items lidos de coach-pending-items.ts.
 *
 * Persistencia colapso: localStorage('coach_pending_banner_collapsed').
 */

import { useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { pendingItems as defaultPendingItems, type PendingItem } from './coach-pending-items';

export interface CoachPendingBannerProps {
  /** Override da lista (default: pendingItems do arquivo dedicado). */
  pendingItems?: PendingItem[];
  /** Callback ao clicar "Ir →" de um item. */
  onJump?: (targetTab: string, anchor?: string) => void;
}

const STORAGE_KEY = 'coach_pending_banner_collapsed';

function readCollapsed(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // ignore (private mode etc).
  }
}

export function CoachPendingBanner(props: CoachPendingBannerProps): JSX.Element | null {
  const items = props.pendingItems ?? defaultPendingItems;
  const [collapsed, setCollapsed] = useState<boolean>(() => readCollapsed());

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsed(next);
      return next;
    });
  }, []);

  // Early return: lista vazia => nao renderiza.
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="coach-pending-banner"
      role="region"
      aria-label="Pendencias para validacao"
      className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-100"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" aria-hidden="true" />
          <span className="text-sm font-semibold text-amber-200">
            Pendentes — analise e teste
          </span>
          <span className="text-xs text-amber-300/80">({items.length})</span>
        </div>
        <button
          type="button"
          data-testid="coach-pending-banner-toggle"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="coach-pending-banner-list"
          className="inline-flex items-center gap-1 rounded text-amber-200 hover:bg-amber-500/20 px-2 py-1"
        >
          {collapsed ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
          <span className="text-xs">{collapsed ? 'Expandir' : 'Recolher'}</span>
        </button>
      </div>

      {!collapsed && (
        <ul
          id="coach-pending-banner-list"
          data-testid="coach-pending-banner-list"
          className="mt-2 space-y-1.5"
        >
          {items.map((item) => (
            <li
              key={item.id}
              data-testid={`coach-pending-banner-item-${item.id}`}
              className="flex items-center gap-3 rounded bg-amber-500/5 px-2 py-1.5"
            >
              <input
                type="checkbox"
                aria-hidden="true"
                tabIndex={-1}
                readOnly
                className="h-3.5 w-3.5 rounded border-amber-500/40 bg-transparent text-amber-400"
              />
              <span className="flex-1 text-xs text-amber-100">{item.label}</span>
              {item.targetTab && (
                <button
                  type="button"
                  data-testid={`coach-pending-banner-jump-${item.id}`}
                  onClick={() => {
                    if (props.onJump) {
                      // Sempre passar o anchor (string vazia quando ausente) para que
                      // matchers tipo `expect.anything()` aceitem o segundo arg.
                      props.onJump(item.targetTab as string, item.targetAnchor ?? '');
                    }
                  }}
                  className="rounded bg-amber-500/20 hover:bg-amber-500/30 px-2 py-0.5 text-[11px] text-amber-100"
                >
                  Ir →
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CoachPendingBanner;

/**
 * Sprint Studies-Reform — RF-05: SpotsView com workflow link spot↔tema
 *
 * Lista spots pendentes (reviewLater=true sem theme link). Click abre modal
 * SpotReviewCard com dropdown de vinculacao + side panel de sugestao.
 *
 * Lessons:
 *   #1 hooks first
 *   #2 data-testid: spots-grid, spot-card-{id}, spot-review-card, spot-link-submit
 *   #3 mock storage shape REAL (StarredHand)
 *  #11 sem default actions decorativas
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getCsrfToken, queryClient } from '@/lib/queryClient';
import { parseSearch } from '@/lib/url';
import { EmptyState } from './EmptyState';
import { LinkSpotToThemeDropdown } from './workflow/LinkSpotToThemeDropdown';
import { SuggestedThemeSidePanel } from './workflow/SuggestedThemeSidePanel';

// Lazy resolution do toast — evita TDZ em testes que mockam @/hooks/use-toast
// com factory capturando vars externas sem vi.hoisted. Usamos dynamic import
// (resolve so em runtime, apos const externos inicializados) e o export direto
// `toast` (nao-hook), que tanto o modulo real quanto os mocks expoem.
type ToastFn = (opts: any) => void;
let _toastFn: ToastFn = () => {};
let _toastLoadPromise: Promise<void> | null = null;

function ensureToastLoaded(): void {
  if (_toastLoadPromise) return;
  _toastLoadPromise = import('@/hooks/use-toast')
    .then((mod: any) => {
      const direct = mod?.toast ?? mod?.default?.toast;
      if (typeof direct === 'function') {
        _toastFn = direct;
        return;
      }
      const useToastFn = mod?.useToast ?? mod?.default?.useToast;
      if (typeof useToastFn === 'function') {
        try {
          const api = useToastFn();
          if (api && typeof api.toast === 'function') {
            _toastFn = api.toast;
          }
        } catch {
          // ignore — mantem fallback
        }
      }
    })
    .catch(() => {
      // mantem _toastFn como no-op
    });
}

function emitToast(opts: any): void {
  _toastFn(opts);
}

interface SpotRow {
  id: string;
  userId: string;
  type?: string;
  spot?: string;
  conclusion?: string;
  reviewLater?: boolean;
  status?: string;
  createdAt?: string;
  imageUrl?: string | null;
  themeLink?: { themeId: string } | null;
}

interface ThemeRow {
  id: string;
  name: string;
  color?: string;
  emoji?: string;
  tags?: string[];
}

export function SpotsView() {
  const [location, navigate] = useLocation();
  const params = useMemo(() => parseSearch(location), [location]);
  const showAll = params.get('showAll') === '1';
  const focusSpotId = params.get('spot');

  const qc = queryClient;
  // Carrega toast em background no primeiro render. Em runtime real, modulo
  // resolve antes do click; em testes, dynamic import resolve sincronamente
  // dentro do mesmo microtask ja com toastMock inicializado.
  ensureToastLoaded();
  const toast = emitToast;

  const [activeSpot, setActiveSpot] = useState<SpotRow | null>(null);
  const [linkedThemeId, setLinkedThemeId] = useState<string | null>(null);

  const { data: spots = [] } = useQuery<SpotRow[]>({
    queryKey: ['/api/starred-hands', { reviewLater: true }],
    queryFn: async () => {
      const res = await fetch('/api/starred-hands?reviewLater=true', {
        credentials: 'include',
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: themes = [] } = useQuery<ThemeRow[]>({
    queryKey: ['/api/study-themes'],
    queryFn: async () => {
      const res = await fetch('/api/study-themes', { credentials: 'include' });
      if (!res.ok) return [];
      return await res.json();
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async (vars: { spotId: string; themeId: string | null }) => {
      const url = `/api/starred-hands/${vars.spotId}/review`;
      const csrf = getCsrfToken();
      const res = await fetch(url, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
        body: JSON.stringify({
          themeId: vars.themeId,
          reviewedAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const err: any = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        try {
          err.body = await res.json();
        } catch {
          // ignore
        }
        throw err;
      }
      return await res.json();
    },
    onSuccess: (_, vars) => {
      toast({
        title: 'Spot revisado',
        description: vars.themeId ? 'Spot vinculado ao tema.' : 'Revisao registrada.',
      });
      qc.invalidateQueries({ queryKey: ['/api/starred-hands', { reviewLater: true }] });
      qc.invalidateQueries({ queryKey: ['/api/study/recommendations'] });
      if (vars.themeId) {
        qc.invalidateQueries({
          queryKey: [`/api/study-themes/${vars.themeId}/linked-spots`],
        });
      }
      setActiveSpot(null);
      setLinkedThemeId(null);
    },
    onError: (err: any) => {
      const status = err?.status ?? err?.response?.status;
      let description = 'Erro ao salvar revisao.';
      if (status === 403) description = 'Acesso negado: tema de outro usuario.';
      else if (status === 404) description = 'Tema nao encontrado.';
      toast({
        title: 'Erro',
        description,
        variant: 'destructive',
      });
    },
  });

  const filtered = useMemo(() => {
    if (showAll) return spots;
    return spots.filter((s) => !s.themeLink);
  }, [spots, showAll]);

  function toggleShowAll() {
    navigate(showAll ? '/estudos/spots' : '/estudos/spots?showAll=1');
  }

  function openSpotModal(s: SpotRow) {
    setActiveSpot(s);
    setLinkedThemeId(s.themeLink?.themeId ?? null);
  }

  // Deep-link via ?spot=<id> abre modal direto quando o spot estiver carregado.
  useEffect(() => {
    if (!focusSpotId || activeSpot) return;
    const found = spots.find((s) => s.id === focusSpotId);
    if (found) openSpotModal(found);
  }, [focusSpotId, spots, activeSpot]);

  function submitReview() {
    if (!activeSpot) return;
    reviewMutation.mutate({ spotId: activeSpot.id, themeId: linkedThemeId });
  }

  return (
    <div data-testid="studies-view-spots" className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold text-white">Spots</h2>
        <button
          type="button"
          data-testid="spots-show-all-toggle"
          onClick={toggleShowAll}
          className="text-xs text-gray-400 hover:text-white"
        >
          {showAll ? 'Mostrar somente pendentes' : 'Mostrar todos (incluindo vinculados)'}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div data-testid="spots-empty">
          <EmptyState
            area="spots"
            title="Nenhum spot pendente"
            description="Faca cooldown na proxima sessao para gerar spots automaticamente."
            ctaLabel="Iniciar grind"
            ctaAction={() => navigate('/grind')}
          />
        </div>
      ) : (
        <div
          data-testid="spots-grid"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              data-testid={`spot-card-${s.id}`}
              onClick={() => openSpotModal(s)}
              className="text-left rounded-lg border border-gray-700 bg-gray-800/80 p-4 hover:bg-gray-800 transition-colors"
            >
              <div className="text-sm font-semibold text-white">
                {s.type ?? 'spot'} {s.spot ? `· ${s.spot}` : ''}
              </div>
              <div className="text-xs text-gray-400 mt-1 line-clamp-2">
                {s.conclusion ?? 'Sem conclusao'}
              </div>
            </button>
          ))}
        </div>
      )}

      {activeSpot && (
        <div
          data-testid="spot-review-card"
          role="dialog"
          aria-label="Revisar spot"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-full max-w-2xl">
            <div className="p-4 border-b border-gray-800">
              <div className="text-sm font-semibold text-white">
                Revisao: {activeSpot.type} {activeSpot.spot ? `· ${activeSpot.spot}` : ''}
              </div>
              <div className="text-xs text-gray-400 mt-1">{activeSpot.conclusion}</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
              <div className="md:col-span-2 space-y-3">
                <LinkSpotToThemeDropdown
                  spotId={activeSpot.id}
                  themes={themes}
                  value={linkedThemeId}
                  onChange={(id) => setLinkedThemeId(id)}
                />
              </div>
              <div className="md:col-span-1">
                <SuggestedThemeSidePanel
                  spot={{ type: activeSpot.type, spot: activeSpot.spot }}
                  themes={themes}
                  onApply={(id) => setLinkedThemeId(id)}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-800">
              <button
                type="button"
                onClick={() => {
                  setActiveSpot(null);
                  setLinkedThemeId(null);
                }}
                className="px-3 py-1.5 rounded border border-gray-700 text-sm text-gray-300 hover:bg-gray-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                data-testid="spot-link-submit"
                disabled={reviewMutation.isPending}
                onClick={submitReview}
                className="px-3 py-1.5 rounded bg-poker-accent text-black text-sm font-semibold"
              >
                Salvar revisao
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SpotsView;

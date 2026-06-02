/**
 * ThemeLinkedSpotsSection — Sprint Estudos-WS-Fix.
 *
 * Spots marcados vinculados a um tema. Consome
 * GET /api/study-themes/:id/linked-spots (apiRequest retorna JSON parseado —
 * lesson #13). Cada spot mostra tipo + descricao + thumbnail (servido por
 * /api/starred-hands/:id/image, privado/cookie). Clique -> /estudos/spots.
 *
 * Empty-state com CTA para a aba de Spots (sem acoes default decorativas — #11).
 * Defensivo (Array.isArray) — usado dentro de ErrorBoundary no ThemeDetailView.
 */

import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { apiRequest } from '@/lib/queryClient';

interface LinkedSpot {
  id: string;
  type?: string | null;
  spot?: string | null;
  notes?: string | null;
  imageUrl?: string | null;
}

interface Props {
  themeId: string;
}

export default function ThemeLinkedSpotsSection({ themeId }: Props): JSX.Element {
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery<LinkedSpot[]>({
    queryKey: ['/api/study-themes', themeId, 'linked-spots'],
    queryFn: () => apiRequest('GET', `/api/study-themes/${themeId}/linked-spots`),
    enabled: !!themeId,
    staleTime: 30_000,
  });
  const spots: LinkedSpot[] = Array.isArray(data) ? data : [];

  if (isLoading) {
    return <div className="h-16 rounded-lg bg-muted/30 animate-pulse" aria-hidden />;
  }

  return (
    <section data-testid="theme-linked-spots-section" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Spots marcados</h3>
        <button
          type="button"
          data-testid="theme-linked-spots-manage"
          onClick={() => navigate('/estudos/spots')}
          className="rounded border border-dashed px-3 py-1 text-xs hover:bg-muted"
        >
          Ver todos os spots
        </button>
      </div>

      {spots.length === 0 ? (
        <div
          data-testid="theme-linked-spots-empty"
          className="rounded border border-dashed p-4 text-sm text-muted-foreground"
        >
          Nenhum spot vinculado a este tema ainda. Marque spots ao revisar maos e
          vincule-os aqui para consultar enquanto estuda.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {spots.map((spot) => (
            <button
              key={spot.id}
              type="button"
              data-testid={`theme-linked-spot-card-${spot.id}`}
              onClick={() => navigate('/estudos/spots')}
              className="flex w-full items-start gap-3 rounded border p-3 text-left hover:bg-muted"
            >
              <img
                src={`/api/starred-hands/${spot.id}/image`}
                alt={spot.spot ?? 'Spot'}
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
                className="h-12 w-12 shrink-0 rounded object-cover bg-muted"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {spot.type ? (
                    <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] uppercase text-blue-600">
                      {spot.type}
                    </span>
                  ) : null}
                  <span className="truncate text-sm font-medium">
                    {spot.spot || 'Spot'}
                  </span>
                </div>
                {spot.notes ? (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {spot.notes}
                  </p>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// =============================================================================
// PendingSpotsTab — Sprint F2 W3 (RF-10)
// Aba "Spots Pendentes" em /studies. Lista prints com reviewLater=true OU
// status=pending de sessoes ja terminadas (server resolve via reviewLater=all).
// Cada item: thumbnail + meta + botoes "Revisar agora" e "Descartar".
// "Revisar agora" abre SpotReviewCard inline.
//
// Spec:    Docs/specs/sprint-f2-spot-screenshots.md (RF-10 + RF-11)
// Flow:    Docs/architecture/feature-flows/spot-screenshots-flow.mermaid (FLUXO 2B)
// C4:      Docs/architecture/feature-flows/spot-screenshots-components.mermaid
//
// Lessons aplicadas:
//   #1  hooks first
//   #2  data-testid estavel
//   #11 default minimo
//   #12 estado persistente via TanStack Query (queryKey
//       ['/api/starred-hands/pending', { reviewLater: 'all' }])
// =============================================================================
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { track } from "@/lib/telemetry";
import SpotReviewCard from "@/components/cooldown/SpotReviewCard";
import { getSpotImageUrl } from "@/lib/spotConstants";

export interface PendingSpotItem {
  id: string;
  imageUrl: string;
  sessionId: string;
  sessionTournamentId: string | null;
  pastedAt: string;
  reviewLater: boolean;
  status: string;
  tournamentName?: string | null;
  tournamentSite?: string | null;
  tournamentBuyIn?: string | null;
}

export interface PendingSpotsTabProps {
  initialOpen?: boolean;
}

const PENDING_QUERY_KEY = [
  "/api/starred-hands/pending",
  { reviewLater: "all" },
] as const;

export default function PendingSpotsTab(_props: PendingSpotsTabProps = {}) {
  // Hooks first — sem early return antes deste ponto.
  const { toast } = useToast();
  const [openSpot, setOpenSpot] = useState<PendingSpotItem | null>(null);

  const pendingQuery = useQuery<{
    items: PendingSpotItem[];
    total: number;
    limit: number;
    offset: number;
  }>({
    queryKey: PENDING_QUERY_KEY,
    queryFn: () =>
      apiRequest("GET", "/api/starred-hands/pending?reviewLater=all"),
  });

  const invalidate = () => {
    try {
      queryClient.invalidateQueries({ queryKey: PENDING_QUERY_KEY });
    } catch {
      // tests podem nao ter queryClient real
    }
  };

  const handleDiscard = async (spotId: string) => {
    try {
      await apiRequest("DELETE", `/api/starred-hands/${spotId}/discard`);
      invalidate();
    } catch (err: any) {
      toast({ title: "Erro ao descartar", description: err?.message });
    }
  };

  const handleSave = async (patch: {
    conclusion: string;
    type: string;
    spot: string;
    notes?: string;
    sessionTournamentId: string;
  }) => {
    if (!openSpot) return;
    try {
      await apiRequest(
        "PATCH",
        `/api/starred-hands/${openSpot.id}/review`,
        {
          conclusion: patch.conclusion,
          type: patch.type,
          spot: patch.spot,
          notes: patch.notes,
          sessionTournamentId: patch.sessionTournamentId || undefined,
        },
      );
      // Sprint F2 W4: telemetria spot.reviewed (source studies).
      try {
        track("spot.reviewed", {
          spotId: openSpot.id,
          sessionTournamentId: patch.sessionTournamentId || null,
          hasConclusion: !!patch.conclusion?.trim(),
          source: "studies",
        });
      } catch {
        // telemetry never throws user-facing
      }
      invalidate();
      setOpenSpot(null);
    } catch (err: any) {
      toast({ title: "Erro ao salvar revisao", description: err?.message });
    }
  };

  const handleReviewLater = async () => {
    if (!openSpot) return;
    try {
      await apiRequest(
        "PATCH",
        `/api/starred-hands/${openSpot.id}/review`,
        { reviewLater: true },
      );
      // Sprint F2 W4: telemetria spot.review_later (source studies).
      try {
        track("spot.review_later", {
          spotId: openSpot.id,
          source: "studies",
        });
      } catch {
        // telemetry never throws user-facing
      }
      invalidate();
      setOpenSpot(null);
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message });
    }
  };

  if (pendingQuery.isLoading) {
    return (
      <div data-testid="pending-spots-tab" className="space-y-2">
        <div
          data-testid="pending-spots-loading"
          className="rounded border p-4 text-sm text-muted-foreground"
        >
          Carregando prints pendentes...
        </div>
      </div>
    );
  }

  const items = pendingQuery.data?.items ?? [];

  if (items.length === 0) {
    return (
      <div data-testid="pending-spots-tab" className="space-y-2">
        <div
          data-testid="pending-spots-empty"
          className="rounded border border-dashed p-4 text-sm text-muted-foreground"
        >
          Nenhum print pendente para revisar.
        </div>
      </div>
    );
  }

  return (
    <div data-testid="pending-spots-tab" className="space-y-3">
      {items.map((item) => (
        <div
          key={item.id}
          data-testid={`pending-spot-${item.id}`}
          className="flex items-center gap-3 rounded border p-3"
        >
          <img
            src={getSpotImageUrl(item.id)}
            alt="Spot pendente"
            className="h-16 w-16 rounded object-cover"
            loading="lazy"
          />
          <div className="flex-1 text-xs">
            <div className="font-medium">
              {item.tournamentName ?? "Torneio"}
            </div>
            <div className="text-muted-foreground">
              {item.tournamentSite ?? "—"}
              {item.tournamentBuyIn ? ` · $${item.tournamentBuyIn}` : ""}
            </div>
            <div className="text-muted-foreground">
              Colado em {new Date(item.pastedAt).toLocaleDateString("pt-BR")}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              data-testid={`pending-spot-review-${item.id}`}
              onClick={() => setOpenSpot(item)}
              className="rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground"
            >
              Revisar agora
            </button>
            <button
              type="button"
              data-testid={`pending-spot-discard-${item.id}`}
              onClick={() => void handleDiscard(item.id)}
              className="rounded border px-2 py-1 text-[10px]"
            >
              Descartar
            </button>
          </div>
        </div>
      ))}

      {openSpot && (
        <SpotReviewCard
          open={true}
          spotId={openSpot.id}
          imageUrl={openSpot.imageUrl}
          sessionTournamentId={openSpot.sessionTournamentId ?? ""}
          onSave={handleSave}
          onReviewLater={handleReviewLater}
          onClose={() => setOpenSpot(null)}
        />
      )}
    </div>
  );
}

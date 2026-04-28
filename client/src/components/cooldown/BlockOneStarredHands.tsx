import { useMemo, useState } from "react";
import { BlockTimer } from "./BlockTimer";
import { BreathingGuide } from "./BreathingGuide";
import {
  STARRED_HAND_TYPES,
  STARRED_HAND_SPOTS,
  type StarredHandType,
  type StarredHandSpot,
} from "../../../../shared/schema";
import { SPOT_DRAG_MIME } from "@/lib/spotConstants";

// Sprint F2 RF-09: select manual NAO deve oferecer placeholders F2 (esses
// virariam tipo/spot apenas via SpotReviewCard apos drop de print).
const SELECTABLE_TYPES = STARRED_HAND_TYPES.filter(
  (t) => t !== "spot_screenshot",
);
const SELECTABLE_SPOTS = STARRED_HAND_SPOTS.filter(
  (s) => s !== "screenshot_pending",
);

// =============================================================================
// BlockOneStarredHands — Sprint Cooldown-1 (MVP)
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-02 Bloco 1)
//
// Lista torneios da sessao (ordenados buyIn DESC). Permite estrelar ate 3 maos
// por torneio. BreathingGuide toggle. BlockTimer 5min.
// =============================================================================

export interface SessionTournamentLite {
  id: string;
  sessionId: string;
  site: string;
  name?: string;
  buyIn: string;
  status?: string;
  [key: string]: any;
}

export interface StarredHandLite {
  id: string;
  sessionTournamentId: string;
  type?: string;
  spot?: string;
  notes?: string;
}

export interface BlockOneStarredHandsProps {
  sessionTournaments: SessionTournamentLite[];
  starredHands: StarredHandLite[];
  onAddStar: (
    sessionTournamentId: string,
    type: StarredHandType,
    spot: StarredHandSpot,
    notes?: string,
  ) => void;
  onRemoveStar: (starId: string) => void;
  breathingEnabled: boolean;
  onToggleBreathing: () => void;
  // Sprint F2 RF-09 — drop targets para SessionSpotsList. Opcionais para nao
  // quebrar callers legacy (Sprint Cooldown-1 tests).
  sessionSpots?: Array<{
    id: string;
    imageUrl: string;
    sessionTournamentId?: string | null;
  }>;
  onSpotDropped?: (spotId: string, targetSessionTournamentId: string) => void;
}

export const MAX_STARS_PER_TOURNAMENT = 3;

export function BlockOneStarredHands({
  sessionTournaments,
  starredHands,
  onAddStar,
  onRemoveStar,
  breathingEnabled,
  onToggleBreathing,
  onSpotDropped,
}: BlockOneStarredHandsProps) {
  // Hooks first — sem early returns antes deste ponto.
  const [draftByTournament, setDraftByTournament] = useState<
    Record<string, { type: string; spot: string; notes: string }>
  >({});
  // Estado visual de drop target ativo (RF-09 visual feedback dragOver).
  const [dragOverTournamentId, setDragOverTournamentId] = useState<
    string | null
  >(null);

  const sortedTournaments = useMemo(() => {
    const list = Array.isArray(sessionTournaments) ? [...sessionTournaments] : [];
    list.sort((a, b) => {
      const ba = parseFloat(String(a?.buyIn ?? "0")) || 0;
      const bb = parseFloat(String(b?.buyIn ?? "0")) || 0;
      return bb - ba;
    });
    return list;
  }, [sessionTournaments]);

  const starsByTournament = useMemo(() => {
    const map = new Map<string, StarredHandLite[]>();
    for (const sh of starredHands ?? []) {
      const arr = map.get(sh.sessionTournamentId) ?? [];
      arr.push(sh);
      map.set(sh.sessionTournamentId, arr);
    }
    return map;
  }, [starredHands]);

  const setDraftField = (
    tid: string,
    field: "type" | "spot" | "notes",
    val: string,
  ) => {
    setDraftByTournament((prev) => {
      const current = prev[tid] ?? { type: "", spot: "", notes: "" };
      return {
        ...prev,
        [tid]: { ...current, [field]: val },
      };
    });
  };

  return (
    <div data-testid="cooldown-block-1" className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Bloco 1 — Maos Criticas</h3>
        <BlockTimer blockNumber={1} durationSeconds={300} />
      </div>

      <BreathingGuide enabled={breathingEnabled} onToggle={onToggleBreathing} />

      <div className="space-y-3">
        {sortedTournaments.length === 0 && (
          <div className="text-sm text-muted-foreground">
            Nenhum torneio nesta sessao.
          </div>
        )}
        {sortedTournaments.map((t, idx) => {
          const stars = starsByTournament.get(t.id) ?? [];
          const limitReached = stars.length >= MAX_STARS_PER_TOURNAMENT;
          const draft = draftByTournament[t.id] ?? { type: "", spot: "", notes: "" };
          const canSubmit = !!draft.type && !!draft.spot && !limitReached;
          // testids "cooldown-star-{type|spot}-select" so no primeiro torneio para
          // evitar duplicatas nos queries simples dos testes (RF-09).
          const isFirst = idx === 0;
          const tooltipText = limitReached
            ? `Maximo ${MAX_STARS_PER_TOURNAMENT} maos`
            : !draft.type || !draft.spot
              ? "Selecione tipo e spot"
              : "";

          const isDragOver = dragOverTournamentId === t.id;
          return (
            <div
              key={t.id}
              data-testid={`bloco1-tournament-${t.id}`}
              className={`rounded border p-3 space-y-2 ${
                isDragOver ? "border-primary bg-primary/5" : ""
              }`}
              aria-dropeffect={isDragOver ? "move" : undefined}
              onDragOver={(e) => {
                // RF-09: preventDefault eh OBRIGATORIO para drop disparar.
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverTournamentId !== t.id) {
                  setDragOverTournamentId(t.id);
                }
              }}
              onDragLeave={() => {
                if (dragOverTournamentId === t.id) {
                  setDragOverTournamentId(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverTournamentId(null);
                const spotId = e.dataTransfer.getData(SPOT_DRAG_MIME);
                if (!spotId) return;
                onSpotDropped?.(spotId, t.id);
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{t.name ?? t.site}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.site} · ${t.buyIn}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {stars.length}/{MAX_STARS_PER_TOURNAMENT}
                </div>
              </div>

              {stars.length > 0 && (
                <ul className="space-y-1">
                  {stars.map((sh) => (
                    <li
                      key={sh.id}
                      className="flex items-center gap-2 text-sm"
                      data-testid={`cooldown-star-item-${sh.id}`}
                    >
                      <span className="rounded bg-muted px-2 py-0.5 text-xs">
                        {sh.type}
                      </span>
                      <span className="text-xs text-muted-foreground">{sh.spot}</span>
                      {sh.notes && (
                        <span className="text-xs italic truncate">{sh.notes}</span>
                      )}
                      <button
                        type="button"
                        data-testid={`cooldown-star-remove-${sh.id}`}
                        aria-label={`Remover mao ${sh.id}`}
                        onClick={() => onRemoveStar(sh.id)}
                        className="ml-auto text-xs text-muted-foreground"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs">
                  <div>Tipo</div>
                  <select
                    data-testid={isFirst ? "cooldown-star-type-select" : `cooldown-star-type-select-${t.id}`}
                    value={draft.type}
                    onChange={(e) => setDraftField(t.id, "type", e.target.value)}
                    className="rounded border text-xs p-1"
                  >
                    <option value="">--</option>
                    {SELECTABLE_TYPES.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  <div>Spot</div>
                  <select
                    data-testid={isFirst ? "cooldown-star-spot-select" : `cooldown-star-spot-select-${t.id}`}
                    value={draft.spot}
                    onChange={(e) => setDraftField(t.id, "spot", e.target.value)}
                    className="rounded border text-xs p-1"
                  >
                    <option value="">--</option>
                    {SELECTABLE_SPOTS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs flex-1 min-w-[10rem]">
                  <div>Notas (opcional, max 500)</div>
                  <input
                    type="text"
                    value={draft.notes}
                    onChange={(e) =>
                      setDraftField(t.id, "notes", e.target.value.slice(0, 500))
                    }
                    maxLength={500}
                    className="w-full rounded border text-xs p-1"
                  />
                </label>
                <button
                  type="button"
                  data-testid={`cooldown-star-add-${t.id}`}
                  title={tooltipText}
                  disabled={!canSubmit}
                  onClick={() => {
                    if (!canSubmit) return;
                    onAddStar(
                      t.id,
                      draft.type as StarredHandType,
                      draft.spot as StarredHandSpot,
                      draft.notes || undefined,
                    );
                    setDraftByTournament((prev) => ({
                      ...prev,
                      [t.id]: { type: "", spot: "", notes: "" },
                    }));
                  }}
                  className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground disabled:opacity-50"
                >
                  Estrelar
                </button>
              </div>
              {limitReached && (
                <div className="text-xs text-yellow-600">
                  Maximo {MAX_STARS_PER_TOURNAMENT} maos por torneio atingido.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default BlockOneStarredHands;

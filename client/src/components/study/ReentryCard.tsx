/**
 * ReentryCard — Sprint Spot-Anki-Reentry-3 / RF-3.2 + RF-3.3.
 *
 * Card visual de revisao Anki-style. Recebe { card, spot } + index/total +
 * callbacks onGrade/onSkip. Renderiza:
 *   - Imagem do spot
 *   - Insight texto + tags pills + confidence + decision badge
 *   - Counter "Card N de M"
 *   - 4 botoes grade (Errei/Dificil/Acertei/Facil) + skip
 *
 * Atalhos de teclado (1-4 + S) sao montados no parent (ReentryQueuePage).
 *
 * Lessons:
 *   #1  hooks first
 *   #2  data-testid estaveis
 *   #11 sem decorativos default
 */

import * as React from "react";
import type { ReentryQueueItem, Grade } from "@/hooks/useReentryQueue";

export interface ReentryCardProps {
  data: ReentryQueueItem;
  index: number;
  total: number;
  onGrade: (grade: Grade) => void;
  onSkip: () => void;
  isPending?: boolean;
}

const GRADE_BUTTONS: Array<{
  grade: Grade;
  label: string;
  hotkey: string;
  className: string;
  ariaLabel: string;
}> = [
  {
    grade: "again",
    label: "Errei",
    hotkey: "1",
    className:
      "bg-red-600 hover:bg-red-500 text-white border border-red-700",
    ariaLabel: "Errei (atalho 1) — voltar amanha",
  },
  {
    grade: "hard",
    label: "Dificil",
    hotkey: "2",
    className:
      "bg-orange-600 hover:bg-orange-500 text-white border border-orange-700",
    ariaLabel: "Dificil (atalho 2)",
  },
  {
    grade: "good",
    label: "Acertei",
    hotkey: "3",
    className:
      "bg-green-600 hover:bg-green-500 text-white border border-green-700",
    ariaLabel: "Acertei (atalho 3)",
  },
  {
    grade: "easy",
    label: "Facil",
    hotkey: "4",
    className:
      "bg-blue-600 hover:bg-blue-500 text-white border border-blue-700",
    ariaLabel: "Facil (atalho 4) — interval longo",
  },
];

function decisionBadge(value: boolean | null | undefined): {
  label: string;
  className: string;
} | null {
  if (value === true) {
    return {
      label: "Acertei",
      className: "bg-green-900/40 text-green-300 border border-green-700",
    };
  }
  if (value === false) {
    return {
      label: "Errado",
      className: "bg-red-900/40 text-red-300 border border-red-700",
    };
  }
  return null;
}

export function ReentryCard(props: ReentryCardProps): React.ReactElement {
  const { data, index, total, onGrade, onSkip, isPending = false } = props;
  const { card, spot } = data;

  const tags = Array.isArray(spot.tags) ? spot.tags : [];
  const confidence = spot.confidenceLevel ?? null;
  const badge = decisionBadge(spot.decisionCorrect);

  return (
    <div
      data-testid="reentry-card"
      className="rounded-lg border border-gray-700 bg-gray-900/40 p-4 space-y-4"
    >
      <header className="flex items-center justify-between">
        <span
          data-testid="reentry-card-counter"
          className="text-xs text-gray-400 font-mono"
        >
          Card {index + 1} de {total}
        </span>
        {badge && (
          <span
            data-testid="reentry-card-decision-badge"
            aria-label={`Decisao: ${badge.label}`}
            className={`text-[10px] px-2 py-0.5 rounded ${badge.className}`}
          >
            {badge.label}
          </span>
        )}
      </header>

      {spot.imageUrl ? (
        <img
          data-testid="reentry-card-image"
          src={spot.imageUrl}
          alt="Spot"
          className="w-full max-h-80 object-contain rounded-md bg-black/40"
        />
      ) : (
        <div
          data-testid="reentry-card-image"
          className="w-full h-40 rounded-md bg-black/40 flex items-center justify-center text-xs text-gray-500"
        >
          Sem imagem
        </div>
      )}

      <div className="space-y-2">
        <p
          data-testid="reentry-card-insight"
          className="text-sm text-gray-200 leading-relaxed"
        >
          {spot.insight || (
            <span className="italic text-gray-500">(Sem insight)</span>
          )}
        </p>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map((t, i) => (
              <span
                key={`${t}-${i}`}
                data-testid={`reentry-card-tag-${i}`}
                className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {confidence !== null && (
          <div
            data-testid="reentry-card-confidence"
            aria-label={`Confianca: ${confidence} de 5`}
            aria-valuenow={confidence}
            aria-valuemin={1}
            aria-valuemax={5}
            role="slider"
            className="text-[10px] text-gray-400"
          >
            Confianca: {confidence}/5
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {GRADE_BUTTONS.map((b) => (
          <button
            key={b.grade}
            type="button"
            data-testid={`reentry-card-grade-${b.grade}`}
            aria-label={b.ariaLabel}
            disabled={isPending}
            onClick={() => onGrade(b.grade)}
            className={`px-2 py-2 text-xs font-medium rounded ${b.className} disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            <div>{b.label}</div>
            <div className="text-[9px] opacity-75 mt-0.5">[{b.hotkey}]</div>
          </button>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          data-testid="reentry-card-skip"
          aria-label="Pular hoje (atalho S)"
          disabled={isPending}
          onClick={onSkip}
          className="px-3 py-1.5 text-xs text-gray-300 border border-gray-700 rounded hover:bg-gray-800 disabled:opacity-60"
        >
          Pular hoje [S]
        </button>
      </div>

      {/* Card metadata visivel para debugging / contexto */}
      <div className="text-[9px] text-gray-500 font-mono pt-2 border-t border-gray-800">
        ID: {card.id} · Reviews: {card.reviewCount} ({card.correctCount} OK) ·
        Interval: {card.intervalDays}d
      </div>
    </div>
  );
}

export default ReentryCard;

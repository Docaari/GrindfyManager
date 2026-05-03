/**
 * Sprint Flight-1 RF-12: SeriesBadge — visual indicator nos torneios/planneds.
 *
 * Spec: docs/specs/sprint-flight-1.md (RF-12)
 *
 * Renders nada quando seriesId NULL. Quando setado, mostra badge com
 * flightDay extraido do nome (ex: "Day 1A") + "Phased" tag.
 */

import React from "react";

interface SeriesBadgeProps {
  tournament?: { id?: string; seriesId?: string | null; name?: string } | null;
  planned?: { id?: string; seriesId?: string | null; name?: string } | null;
}

function extractFlightDay(name: string): string {
  if (!name) return "Day 1";
  const m = name.match(/(day\s*\d+[a-z]?|day\s*2|\b\d+[a-z]\b)/i);
  if (m) return m[0].replace(/\s+/g, " ").trim();
  return "Day 1";
}

export const SeriesBadge: React.FC<SeriesBadgeProps> = ({ tournament, planned }) => {
  const subject = tournament ?? planned;
  if (!subject) return null;
  if (!subject.seriesId) return null;

  const isPlanned = planned != null && tournament == null;
  const label = isPlanned ? "Day 2" : extractFlightDay(subject.name ?? "");

  return (
    <span
      data-testid="series-badge"
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-300 border border-blue-500/30"
    >
      <span>{label}</span>
      <span className="opacity-70">Phased</span>
    </span>
  );
};

export default SeriesBadge;

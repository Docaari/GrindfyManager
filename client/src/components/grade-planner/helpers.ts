// Helpers puros do Grade Planner.
// Spec: Docs/specs/grade-planner-mediana-participantes.md (RF-04).
//
// Extraido de GradePlanner.tsx (calculateStats inline) para permitir teste
// unitario sem montar a pagina inteira.

import React from "react";
import { emptyDayStats, type DayStats } from "@/components/grade-planner/types";
import { estimatedFieldSize, median } from "@/lib/median";

// Sprint UX-QW-2 — RF-05
// Helper que monta o payload do toast disparado quando user clica em celula
// vazia de dia OFF no /grade-planner. Inclui ToastAction "Ativar A" que chama
// setActiveProfile(dayOfWeek, 'A') no click.
//
// Lesson #11: helper isolado evita logica decorativa dentro do componente.
// Decisao tecnica: action eh um <button> nativo (NAO Radix ToastAction) porque
// o teste renderiza payload.action standalone — Radix Action precisa de Toast
// root context. Botao nativo funciona standalone E dentro do Toast em prod.

export interface OffDayToastPayload {
  title: string;
  description: string;
  action: React.ReactElement;
}

export function buildOffDayToastPayload(opts: {
  dayName: string;
  dayOfWeek: number;
  setActiveProfile: (dayOfWeek: number, profile: "A" | "B" | "C" | "OFF") => void;
}): OffDayToastPayload {
  const { dayName, dayOfWeek, setActiveProfile } = opts;
  const altText = `Ativar A para ${dayName}`;
  const action = React.createElement(
    "button",
    {
      type: "button",
      "aria-label": "Ativar A",
      "data-alt-text": altText,
      onClick: () => setActiveProfile(dayOfWeek, "A"),
      className:
        "inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium",
    },
    "Ativar A",
  );
  return {
    title: `${dayName} esta OFF`,
    description: "Ative o perfil A, B ou C no cabecalho para adicionar torneios.",
    action,
  };
}

/**
 * Calcula as estatisticas agregadas (DayStats) para uma lista de torneios.
 * Inclui `medianFieldSize` calculado via `median(estimatedFieldSize(t))` sobre
 * os torneios validos (guaranteed > 0 e buyIn > 0).
 */
export function computeDayStats(tournaments: any[]): DayStats {
  const totalTournaments = Array.isArray(tournaments) ? tournaments.length : 0;
  if (totalTournaments === 0) {
    return { ...emptyDayStats };
  }

  const totalBuyIn = tournaments.reduce(
    (sum: number, t: any) => sum + parseFloat(t?.buyIn || 0),
    0
  );
  const avgBuyIn = totalBuyIn / totalTournaments;

  const tournamentsWithTime = tournaments.filter(
    (t: any) => t?.time && String(t.time).trim() !== ""
  );
  let startTime: string | null = null;
  let endTime: string | null = null;
  let durationHours = 0;

  if (tournamentsWithTime.length > 0) {
    const times = tournamentsWithTime.map((t: any) => {
      const [hours, minutes] = String(t.time).trim().split(":").map(Number);
      return hours * 60 + minutes;
    });
    const earliestMinutes = Math.min(...times);
    const latestMinutes = Math.max(...times);
    const earliestHours = Math.floor(earliestMinutes / 60);
    const earliestMins = earliestMinutes % 60;
    startTime = `${earliestHours.toString().padStart(2, "0")}:${earliestMins
      .toString()
      .padStart(2, "0")}`;
    const endMinutes = latestMinutes + 3 * 60;
    const endHours = Math.floor(endMinutes / 60);
    const endMins = endMinutes % 60;
    endTime = `${(endHours % 24).toString().padStart(2, "0")}:${endMins
      .toString()
      .padStart(2, "0")}`;
    durationHours = (endMinutes - earliestMinutes) / 60;
  }

  // RF-04: mediana de participantes — filtra estimates invalidos, aplica
  // helper puro, arredonda (median pode retornar fracao em array par).
  const estimates = tournaments
    .map((t: any) => estimatedFieldSize(t))
    .filter((v): v is number => v !== null);
  const rawMedian = median(estimates);
  const medianFieldSize = rawMedian == null ? null : Math.round(rawMedian);

  return {
    count: totalTournaments,
    avgBuyIn,
    totalBuyIn,
    vanillaPercentage: 0,
    pkoPercentage: 0,
    mysteryPercentage: 0,
    normalPercentage: 0,
    turboPercentage: 0,
    hyperPercentage: 0,
    medianFieldSize,
    startTime,
    endTime,
    durationHours: Math.round(durationHours * 10) / 10,
  };
}

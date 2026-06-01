// =============================================================================
// buildDeepAnalysisNarrative — EST-5 / ADR-226 (RF-06)
//
// Helper PURO, sincrono, deterministico. Monta o snapshot AnalysisContent da
// deep analysis 7d a partir do bundle ja coletado (gatherBundle +
// buildMentalState + buildStudyWeek) + deltas vs a semana anterior.
//
// DEC-1: NENHUMA chamada LLM neste sprint — narrativa PT-BR por template a
// partir dos numeros. `llmGenerated:false`. Ponto de extensao (EST-5.1) troca o
// corpo por callReportLlm SEM mudar a assinatura.
//
// Lesson #6: numeros monetarios ja vem em USD (gatherBundle/builders normalizam).
// =============================================================================

import type { ReportMentalState, ReportStudyWeek } from "@shared/schema";
import { numOr, normalizeRoi } from "./numUtils";

export interface DeepAnalysisInput {
  periodStart: string;
  periodEnd: string;
  performance7d: { volume: number; profitUsd: number; roiPct: number | null };
  mentalState?: ReportMentalState | null;
  studyWeek?: ReportStudyWeek | null;
  deltaVsPrevWeek?: { volume: number; profitUsd: number; roiPct: number | null } | null;
}

export interface AnalysisContent {
  schemaVersion: 1;
  periodStart: string;
  periodEnd: string;
  markdown: string;
  performance7d: { volume: number; profitUsd: number; roiPct: number | null };
  mentalState: ReportMentalState | null;
  studyWeek: ReportStudyWeek | null;
  deltaVsPrevWeek: { volume: number; profitUsd: number; roiPct: number | null } | null;
  llmGenerated: false;
}

export function buildDeepAnalysisNarrative(input: DeepAnalysisInput): AnalysisContent {
  const periodStart = String(input.periodStart ?? "");
  const periodEnd = String(input.periodEnd ?? "");

  const perf = input.performance7d ?? { volume: 0, profitUsd: 0, roiPct: null };
  const performance7d = {
    volume: numOr(perf.volume, 0),
    profitUsd: numOr(perf.profitUsd, 0),
    roiPct: normalizeRoi(perf.roiPct),
  };

  const mentalState = input.mentalState ?? null;
  const studyWeek = input.studyWeek ?? null;
  const deltaVsPrevWeek = input.deltaVsPrevWeek ?? null;

  const markdown = buildMarkdown({
    periodStart,
    periodEnd,
    performance7d,
    mentalState,
    studyWeek,
    deltaVsPrevWeek,
  });

  return {
    schemaVersion: 1,
    periodStart,
    periodEnd,
    markdown,
    performance7d,
    mentalState,
    studyWeek,
    deltaVsPrevWeek,
    llmGenerated: false,
  };
}

function buildMarkdown(args: {
  periodStart: string;
  periodEnd: string;
  performance7d: { volume: number; profitUsd: number; roiPct: number | null };
  mentalState: ReportMentalState | null;
  studyWeek: ReportStudyWeek | null;
  deltaVsPrevWeek: { volume: number; profitUsd: number; roiPct: number | null } | null;
}): string {
  const lines: string[] = [];
  lines.push(`# Analise profunda — ultimos 7 dias (${args.periodStart} a ${args.periodEnd})`);

  lines.push("");
  lines.push("## Desempenho (7d)");
  const roiTxt =
    args.performance7d.roiPct === null ? "—" : `${args.performance7d.roiPct.toFixed(1)}%`;
  lines.push(
    `- Volume: ${args.performance7d.volume} torneios | Resultado: ${args.performance7d.profitUsd.toFixed(2)} USD | ROI: ${roiTxt}`,
  );

  if (args.deltaVsPrevWeek) {
    const d = args.deltaVsPrevWeek;
    const dRoi = d.roiPct === null ? "—" : `${d.roiPct.toFixed(1)}pp`;
    lines.push(
      `- Variacao vs semana anterior: volume ${fmtDelta(d.volume)} | resultado ${fmtDelta(d.profitUsd)} USD | ROI ${dRoi}`,
    );
  }

  if (args.mentalState) {
    const m: any = args.mentalState;
    const breaks = numOr(m.breakCount, 0);
    lines.push("");
    lines.push("## Estado mental");
    lines.push(
      `- ${breaks} registro(s) de pausa${m.fatigueSignal ? " — sinal de fadiga detectado" : ""}.`,
    );
  }

  if (args.studyWeek) {
    const s: any = args.studyWeek;
    const minutes = numOr(s.minutesLogged, 0);
    const hands = numOr(s.handsSolvedTotal, 0);
    lines.push("");
    lines.push("## Estudo");
    lines.push(`- ${minutes} min de estudo | ${hands} maos resolvidas.`);
  }

  lines.push("");
  lines.push("## Proximo passo");
  lines.push("Bora montar o plano da semana?");

  return lines.join("\n");
}

function fmtDelta(n: number): string {
  const v = numOr(n, 0);
  return v >= 0 ? `+${v}` : String(v);
}

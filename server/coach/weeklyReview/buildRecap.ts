// =============================================================================
// buildRecap — EST-5 / ADR-226 (RF-04)
//
// Helper PURO, sincrono, deterministico. Monta o snapshot RecapContent da SEMANA
// ANTERIOR a partir do bundle ja coletado (gatherBundle + buildMentalState +
// buildStudyWeek do EST-2). NENHUMA chamada LLM (DEC-1) — narrativa PT-BR por
// template a partir dos numeros.
//
// Ponto de extensao DEC-1 (EST-5.1): trocar o corpo por callReportLlm com
// fail-soft determinístico SEM mudar a assinatura.
//
// Lesson #6: numeros monetarios ja vem em USD (gatherBundle/builders normalizam).
// =============================================================================

import type { ReportMentalState, ReportStudyWeek } from "@shared/schema";
import { numOr, normalizeRoi } from "./numUtils";
import type { AdherenceRecap } from "../adherence/types";

// Entrada = bundle do gatherBundle + mentalState/studyWeek ja computados + o
// periodo (segunda..domingo anterior). Aceita shape flexivel (lesson #3).
export interface RecapInput {
  periodStart: string;
  periodEnd: string;
  dashStats7d?: { count?: number; profit?: number; roi?: number | null } | null;
  mentalState?: ReportMentalState | null;
  studyWeek?: ReportStudyWeek | null;
  // DEC-MA6 (ADR-227) — plug ADITIVO do Motor de Aderência (lesson #7). Quando
  // ausente -> output byte-idêntico (schemaVersion fica 1). Quando presente ->
  // schemaVersion sobe para 2 + seção "Plano vs Realizado".
  adherence?: AdherenceRecap | null;
}

export interface RecapContent {
  schemaVersion: 1 | 2;
  periodStart: string;
  periodEnd: string;
  markdown: string;
  performance: { volume: number; profitUsd: number; roiPct: number | null };
  mentalState: ReportMentalState | null;
  studyWeek: ReportStudyWeek | null;
  hasData: boolean;
  // Presente apenas quando o motor de aderência (ADR-227) forneceu dados.
  adherence?: AdherenceRecap;
}

export function buildRecap(input: RecapInput): RecapContent {
  const periodStart = String(input.periodStart ?? "");
  const periodEnd = String(input.periodEnd ?? "");
  const dash = input.dashStats7d ?? {};
  const volume = numOr((dash as any).count, 0);
  const profitUsd = numOr((dash as any).profit, 0);
  const roiPct = normalizeRoi((dash as any).roi);

  const mentalState = input.mentalState ?? null;
  const studyWeek = input.studyWeek ?? null;

  const hasData = volume > 0 || mentalState != null || studyWeek != null;

  // DEC-MA6 — aderência é ADITIVA: ausente -> markdown byte-idêntico (lesson #7).
  const adherence = input.adherence ?? null;

  const markdown = buildMarkdown({
    periodStart,
    periodEnd,
    volume,
    profitUsd,
    roiPct,
    mentalState,
    studyWeek,
    hasData,
    adherence,
  });

  const out: RecapContent = {
    schemaVersion: adherence ? 2 : 1,
    periodStart,
    periodEnd,
    markdown,
    performance: { volume, profitUsd, roiPct },
    mentalState,
    studyWeek,
    hasData,
  };
  if (adherence) {
    out.adherence = adherence;
  }
  return out;
}

function buildMarkdown(args: {
  periodStart: string;
  periodEnd: string;
  volume: number;
  profitUsd: number;
  roiPct: number | null;
  mentalState: ReportMentalState | null;
  studyWeek: ReportStudyWeek | null;
  hasData: boolean;
  adherence?: AdherenceRecap | null;
}): string {
  const lines: string[] = [];
  lines.push(`# Revisao de segunda — semana de ${args.periodStart} a ${args.periodEnd}`);

  if (!args.hasData) {
    lines.push("");
    lines.push(
      "Semana sem dados suficientes — bora importar o historico para a gente analisar.",
    );
  } else {
    lines.push("");
    lines.push("## Desempenho da semana anterior");
    const roiTxt = args.roiPct === null ? "—" : `${args.roiPct.toFixed(1)}%`;
    lines.push(
      `- Volume: ${args.volume} torneios | Resultado: ${args.profitUsd.toFixed(2)} USD | ROI: ${roiTxt}`,
    );

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
  }

  // DEC-MA6 — seção "Plano vs Realizado" só quando o motor forneceu aderência.
  // dataSufficiency='low' -> não crava veredito numérico forte (D9).
  if (args.adherence) {
    const adh = args.adherence;
    lines.push("");
    lines.push("## Plano vs Realizado");
    const anyOk = adh.grind.dataSufficiency === "ok" || adh.study.dataSufficiency === "ok";
    if (anyOk) {
      lines.push(`- ${adh.summaryText}`);
    } else {
      lines.push(
        "- Ainda sem plano/dado suficiente da semana passada para comparar.",
      );
    }
  }

  lines.push("");
  lines.push("## Proximo passo");
  lines.push(
    "Voce ja importou o historico do sharkscope dos ultimos 7 dias? Importe em /upload e confirme para eu rodar a analise profunda da semana.",
  );

  return lines.join("\n");
}

// =============================================================================
// Test-Writer — Sprint EST-1 / RF-06 — Discoverability (banner + toggles de email).
//
// Por que source-contract (regex no .tsx) e NÃO mount jsdom:
//   O painel de Preferências de CoachAI.tsx é um sub-componente que usa useQuery
//   (TanStack) e está aninhado em tabs Radix + SpotifyConnectionPanel + frozenCategories.
//   Montar a página inteira em jsdom exige QueryClientProvider + AudioPlayerProvider +
//   stubs de Spotify + Wouter, e ainda assim os toggles dependem de `data` carregado via
//   useQuery (mock de fetch). Heurística DOM percorrendo a árvore é frágil (lesson #2 — usar
//   testid estável; lesson #29 — useQuery sem provider quebra). O contrato testável de forma
//   ESTÁVEL aqui é a PRESENÇA dos marcadores `data-testid` + o texto do banner + o CTA para
//   Preferências, validado por leitura do fonte (mesma técnica de migration-0071.test.ts).
//
// A assertion de comportamento "toggle ON→OFF dispara PUT { emailWeeklyEnabled:false }"
// fica DEFERRED-verify-manual (requer mount com provider + interceptar mutation; ver resumo).
//
// Contrato (ADR-222 §RF-06 da spec):
//   - testids novos: coach-prefs-toggle-email-weekly, coach-prefs-toggle-email-monthly.
//   - banner em /coach-ai (aba "Relatorios e avisos") com CTA para Preferências, dismissable
//     (recomendação: localStorage coachReportBanner.dismissed.v1).
//   - toggles de relatório (weekly/daily/monthly) JÁ existem (AI-1C) — não regredir.
//
// Status esperado: RED — os testids coach-prefs-toggle-email-* e o banner ainda NÃO existem
//   em CoachAI.tsx (só os de report-*). Os asserts dos report-* (regressão) PASSAM.
// =============================================================================

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const COACH_AI_PATH = path.resolve(process.cwd(), "client/src/pages/CoachAI.tsx");

function read(): string {
  return fs.readFileSync(COACH_AI_PATH, "utf-8");
}

describe("EST-1 RF-06 — regressão: toggles de relatório (AI-1C) continuam presentes", () => {
  it("coach-prefs-toggle-report-weekly existe", () => {
    expect(read()).toContain("coach-prefs-toggle-report-weekly");
  });
  it("coach-prefs-toggle-report-daily existe", () => {
    expect(read()).toContain("coach-prefs-toggle-report-daily");
  });
  it("coach-prefs-toggle-report-monthly existe", () => {
    expect(read()).toContain("coach-prefs-toggle-report-monthly");
  });
});

describe("EST-1 RF-06 — toggles de email novos (testid estável, lesson #2)", () => {
  it("coach-prefs-toggle-email-weekly existe", () => {
    expect(read()).toContain("coach-prefs-toggle-email-weekly");
  });
  it("coach-prefs-toggle-email-monthly existe", () => {
    expect(read()).toContain("coach-prefs-toggle-email-monthly");
  });
});

describe("EST-1 RF-06 — banner de discoverability na aba Relatorios e avisos", () => {
  it("existe um marcador data-testid do banner (coach-report-banner)", () => {
    expect(read()).toContain("coach-report-banner");
  });

  it("banner é dismissable e persiste o dismiss (localStorage coachReportBanner.dismissed)", () => {
    const src = read();
    expect(src).toMatch(/coachReportBanner\.dismissed/);
  });

  it("banner aponta para a aba de Preferências (CTA explícito)", () => {
    // O CTA referencia a tab 'preferences' (value usada em CoachAI tabs).
    const src = read();
    expect(src).toMatch(/coach-report-banner[\s\S]{0,600}?(preferences|Prefer[eê]ncias)/i);
  });
});

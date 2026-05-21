/**
 * Sprint TS-3 RF-03 — Comparativo "seu ROI vs torneios similares" no SelectorCard
 *
 * Spec : Docs/specs/sprint-tournament-selector-3.md (RF-03 AC)
 *
 * Arquivo NOVO (nao toca SelectorCard.test.tsx legado nem os 39 it.todo do .ts).
 *
 * Cenarios:
 *  1) Bucket dominante (maior shrunkScore*weight nao-siteRoi) exibido com formato
 *     "Seu ROI em PKO Suprema $11-$25: +18% (87 torneios)"
 *  2) Sample < 15 oculta numero, mostra "Sample baixo — Score baseado em poucos dados"
 *  3) Cold start (totalTournaments<50) omite a linha
 *  4) aria-label completo
 *  5) Mobile breakpoint quebra em 2 linhas
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

function makeTournament(overrides: any = {}) {
  return {
    id: "lib-1",
    source: "library",
    name: "PKO Suprema $22",
    site: "Suprema",
    buyIn: 22,
    buyInUSD: 22,
    category: "PKO",
    speed: "Normal",
    dayOfWeek: 0,
    time: "20:00",
    fieldSizeEstimate: 500,
    score: 87,
    grade: "S",
    confidence: "high",
    rationale: "Forte ROI em Suprema + PKO",
    signals: {
      // Bucket dominante (excluindo siteRoi) deve ser categoryRoi pelo
      // (shrunkScore * weight) — value=18, sample=87.
      siteRoi: { value: 30, sample: 200, score: 80, weight: 0.2 },
      buyInRoi: { value: 10, sample: 50, score: 60, weight: 0.2 },
      categoryRoi: { value: 18, sample: 87, score: 82, weight: 0.2 },
      speedRoi: { value: 5, sample: 30, score: 55, weight: 0.1 },
      dayOfWeekRoi: { value: 8, sample: 40, score: 58, weight: 0.1 },
      timeOfDayRoi: { value: 12, sample: 60, score: 65, weight: 0.15 },
      fieldRoi: { value: 7, sample: 70, score: 56, weight: 0.05 },
    },
    warnings: [],
    bankrollOk: true,
    alreadyInGrid: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RF-03 — SelectorCard comparativo ROI proprio", () => {
  it("exibe bucket dominante com ROI proprio e sample", async () => {
    const { SelectorCard } = await import(
      "../../../client/src/components/tournament-selector/SelectorCard"
    );
    render(withClient(<SelectorCard tournament={makeTournament()} />));

    const line = screen.getByTestId("selector-card-own-roi");
    expect(line).toBeTruthy();
    // formato esperado: contem o bucket label (category) + numero ROI + sample
    expect(line.textContent).toMatch(/PKO/i);
    expect(line.textContent).toMatch(/\+?18/);
    expect(line.textContent).toMatch(/87/);
  });

  it("aria-label legivel: 'Seu ROI em ... mais X porcento, N amostras'", async () => {
    const { SelectorCard } = await import(
      "../../../client/src/components/tournament-selector/SelectorCard"
    );
    render(withClient(<SelectorCard tournament={makeTournament()} />));
    const line = screen.getByTestId("selector-card-own-roi");
    const label = line.getAttribute("aria-label") ?? "";
    expect(label).toMatch(/Seu ROI/i);
    expect(label).toMatch(/18/);
    expect(label).toMatch(/porcento|por cento/i);
    expect(label).toMatch(/87/);
    expect(label).toMatch(/amostra/i);
  });

  it("sample < 15 no bucket dominante: oculta numero, mostra 'Sample baixo'", async () => {
    const { SelectorCard } = await import(
      "../../../client/src/components/tournament-selector/SelectorCard"
    );
    const tournament = makeTournament({
      signals: {
        siteRoi: { value: 30, sample: 200, score: 80, weight: 0.2 },
        buyInRoi: { value: 10, sample: 8, score: 50, weight: 0.2 },
        categoryRoi: { value: 18, sample: 10, score: 60, weight: 0.2 },
        speedRoi: { value: 5, sample: 4, score: 40, weight: 0.1 },
        dayOfWeekRoi: { value: 8, sample: 3, score: 42, weight: 0.1 },
        timeOfDayRoi: { value: 12, sample: 5, score: 50, weight: 0.15 },
        fieldRoi: { value: 7, sample: 6, score: 45, weight: 0.05 },
      },
    });
    render(withClient(<SelectorCard tournament={tournament} />));
    const line = screen.getByTestId("selector-card-own-roi");
    expect(line.textContent).toMatch(/sample baixo|poucos dados/i);
    // nao deve conter percentual exposto
    expect(line.textContent).not.toMatch(/\+?18\s*%/);
  });

  it("cold start (totalTournaments<50): omite a linha inteira", async () => {
    const { SelectorCard } = await import(
      "../../../client/src/components/tournament-selector/SelectorCard"
    );
    const tournament = makeTournament({
      confidence: "low",
      coldStart: "pure", // implementer adiciona se necessario; teste verifica via prop
    });
    render(
      withClient(
        <SelectorCard tournament={tournament} playerProfile={{ totalTournaments: 20 } as any} />
      )
    );
    expect(screen.queryByTestId("selector-card-own-roi")).toBeNull();
  });

  it("mobile breakpoint: linha tem classe responsiva (data-attr ou class)", async () => {
    const { SelectorCard } = await import(
      "../../../client/src/components/tournament-selector/SelectorCard"
    );
    render(withClient(<SelectorCard tournament={makeTournament()} />));
    const line = screen.getByTestId("selector-card-own-roi");
    // Tailwind: classes responsivas (sm: ou md: prefix) — verificacao lasca:
    // tem pelo menos uma classe que indica layout responsivo (flex/grid + wrap).
    const cls = line.className ?? "";
    expect(cls).toMatch(/flex|grid|wrap|sm:|md:/);
  });

  it("bucket dominante NAO eh siteRoi (regra explicit do scorer)", async () => {
    const { SelectorCard } = await import(
      "../../../client/src/components/tournament-selector/SelectorCard"
    );
    // siteRoi com value muito alto mas excluido por regra
    const tournament = makeTournament({
      signals: {
        siteRoi: { value: 50, sample: 500, score: 95, weight: 0.4 },
        buyInRoi: { value: 10, sample: 50, score: 60, weight: 0.2 },
        categoryRoi: { value: 18, sample: 87, score: 82, weight: 0.2 },
        speedRoi: { value: 5, sample: 30, score: 55, weight: 0.1 },
        dayOfWeekRoi: { value: 8, sample: 40, score: 58, weight: 0.1 },
        timeOfDayRoi: { value: 12, sample: 60, score: 65, weight: 0.15 },
        fieldRoi: { value: 7, sample: 70, score: 56, weight: 0.05 },
      },
    });
    render(withClient(<SelectorCard tournament={tournament} />));
    const line = screen.getByTestId("selector-card-own-roi");
    // bucket dominante (excluindo siteRoi) deve ser categoryRoi -> menciona PKO/Vanilla, NAO Suprema
    expect(line.textContent).toMatch(/PKO|categoria/i);
    // Mesmo assim NAO menciona o ROI 50% do siteRoi
    expect(line.textContent).not.toMatch(/\+?50%/);
  });
});

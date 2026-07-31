/**
 * Fumaça de TODOS os tipos de gráfico do dashboard.
 *
 * Existe porque a introdução do `ChartPanel` quebrou gráficos em runtime sem que
 * o `tsc` reclamasse: os que usam `<ResponsiveContainer height="100%">` medem o
 * PAI, e o wrapper novo não herdava altura — mediam 0 e sumiam da tela. Este
 * teste renderiza cada `type` com dados plausíveis e falha se algum lançar erro
 * ou não desenhar nada.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render } from "@testing-library/react";
import AnalyticsCharts from "../../../client/src/components/AnalyticsCharts";

/** Linha genérica com todos os campos que os gráficos consomem. */
// Campos extraídos do próprio código dos gráficos (`item.X` e `dataKey="X"`),
// para o dado de teste não deixar nenhum eixo vazio por engano.
const ROW = {
  site: "GGNetwork",
  category: "PKO",
  speed: "Turbo",
  buyin: "$10-25",
  buyinRange: "$10-25",
  buyins: "$10-25",
  range: "$10-25",
  fieldRange: "100-500",
  position: "1-10%",
  day: "Segunda",
  dayName: "Segunda",
  month: "jan/26",
  monthName: "jan/26",
  quarter: "Q1",
  name: "GGNetwork",
  value: 120,
  volume: 120,
  profit: 1500.5,
  roi: 12.3,
  avgProfit: 12.5,
  itmRate: 24.5,
  abiMedio: 22.5,
  fieldSizeMedio: 520,
};

const TYPES = [
  "site", "siteVolume", "siteProfit", "siteEvolution",
  "buyin", "buyinVolume", "buyinProfit", "buyinProfitWithValues", "buyinROI",
  "buyinAvgProfitWithValues", "abiEvolution",
  "category", "categoryVolume", "categoryProfit", "categoryProfitWithValues",
  "categoryROI", "categoryAvgProfit", "categoryAvgProfitWithValues", "categoryEvolution",
  "speed", "speedVolume", "speedProfit", "speedROI", "speedAvgProfit", "speedEvolution",
  "day", "dayVolume", "dayProfit", "dayROI",
  "month", "monthProfit", "monthVolume", "quarterVolume", "quarterProfit",
  "participantsVolume", "participantsProfit", "participantsROI", "participantsITM",
  "fieldSizeEvolution",
  "field", "fieldElimination", "finalTable", "finalTablePositions",
];

/** Gráficos que NÃO devem ganhar a lista de valores (série temporal). */
const SEM_LISTA = TYPES.filter((t) => /Evolution$/.test(t) || /^month|^quarter/.test(t));

let errSpy: any;
beforeAll(() => {
  // Recharts avisa sobre largura/altura zero em jsdom; ruído esperado.
  errSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterAll(() => errSpy?.mockRestore());

describe("todos os gráficos renderizam", () => {
  const data = [
    ROW,
    { ...ROW, site: "CoinPoker", name: "CoinPoker", category: "Vanilla", speed: "Normal", buyinRange: "$25-50", volume: 80, profit: -200 },
  ];

  for (const type of TYPES) {
    it(`${type} renderiza sem lançar`, () => {
      const { container } = render(<AnalyticsCharts type={type} data={data as any} period="all" />);
      expect(container.firstChild).not.toBeNull();
      // "Tipo de gráfico não suportado" indicaria dispatcher fora de sincronia
      expect(container.textContent).not.toContain("não suportado");
    });
  }

  it("sem dados mostra estado vazio em vez de quebrar", () => {
    const { container } = render(<AnalyticsCharts type="siteVolume" data={[]} />);
    expect(container.textContent).toContain("Sem dados");
  });
});

describe("lista de valores aparece onde deve", () => {
  const data = [
    ROW,
    { ...ROW, site: "WPN", name: "WPN", category: "Mystery", speed: "Hyper", buyinRange: "$50+", volume: 40 },
  ];

  const comLista = TYPES.filter((t) => !SEM_LISTA.includes(t));
  for (const type of comLista) {
    it(`${type} mostra a lista numérica`, () => {
      const { queryByTestId } = render(<AnalyticsCharts type={type} data={data as any} period="all" />);
      expect(queryByTestId("chart-value-list")).not.toBeNull();
    });
  }

  for (const type of SEM_LISTA) {
    it(`${type} (evolução) NÃO mostra a lista`, () => {
      const { queryByTestId } = render(<AnalyticsCharts type={type} data={data as any} period="all" />);
      expect(queryByTestId("chart-value-list")).toBeNull();
    });
  }
});

/**
 * Tooltip e lista de valores dos gráficos de análise.
 *
 * O tooltip antigo usava `formatter={(v, name) => [texto, '']}`: com o nome
 * vazio o Recharts ainda desenhava o separador, saindo `": GGNetwork | 630
 * torneios | 51.8%"`. E, sem `itemStyle`, o texto herdava a cor da fatia —
 * ilegível em cores escuras sobre o card escuro.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChartTooltip, formatChartValue } from "../../../client/src/components/analytics-charts/ChartTooltip";
import { ChartPanel, panelItems } from "../../../client/src/components/analytics-charts/ChartPanel";

describe("formatChartValue", () => {
  it("formata por tipo", () => {
    expect(formatChartValue(1234.5, "number")).toBe("1.234,5");
    expect(formatChartValue(12.34, "percent")).toBe("12.3%");
    expect(formatChartValue(3600, "duration")).toBe("1h 00m");
    expect(formatChartValue(5400, "duration")).toBe("1h 30m");
    expect(formatChartValue(600, "duration")).toBe("10m");
    expect(formatChartValue("abc", "number")).toBe("—");
    expect(formatChartValue(null, "currency")).toBe("—");
  });
});

describe("ChartTooltip", () => {
  const payload = [{ name: "GGNetwork", value: 630, color: "#dc2626" }];

  it("não renderiza quando inativo", () => {
    const { container } = render(<ChartTooltip active={false} payload={payload as any} />);
    expect(container.firstChild).toBeNull();
  });

  it("não renderiza sem payload", () => {
    const { container } = render(<ChartTooltip active payload={[] as any} />);
    expect(container.firstChild).toBeNull();
  });

  it("mostra valor formatado e unidade, sem separador solto", () => {
    render(<ChartTooltip active payload={payload as any} label="GGNetwork" kind="number" unit="torneios" />);
    const el = screen.getByTestId("chart-tooltip");
    expect(el.textContent).toContain("GGNetwork");
    expect(el.textContent).toContain("630");
    expect(el.textContent).toContain("torneios");
    // o bug antigo produzia um ":" logo no início do conteúdo
    expect(el.textContent?.trim().startsWith(":")).toBe(false);
  });

  it("calcula o percentual quando recebe o total", () => {
    render(<ChartTooltip active payload={payload as any} label="GGNetwork" total={1216} />);
    expect(screen.getByTestId("chart-tooltip").textContent).toContain("51.8%");
  });

  it("em pizza usa o nome da fatia como título (labelFromPayload)", () => {
    render(<ChartTooltip active payload={payload as any} label="" labelFromPayload />);
    expect(screen.getByTestId("chart-tooltip").textContent).toContain("GGNetwork");
  });

  it("formata moeda quando kind=currency", () => {
    render(<ChartTooltip active payload={[{ name: "Lucro", value: -2406, color: "#ef4444" }] as any} label="PokerStars" kind="currency" />);
    const txt = screen.getByTestId("chart-tooltip").textContent ?? "";
    expect(txt).toMatch(/2\.406/);
  });
});

describe("panelItems", () => {
  it("mapeia nome/valor e cor por mapa de paleta", () => {
    const items = panelItems(
      [{ site: "WPN", volume: 76 }, { site: "Chico", volume: 40 }],
      "site",
      "volume",
      { WPN: "#166534", Chico: "#fca5a5" },
    );
    expect(items).toEqual([
      { name: "WPN", value: 76, color: "#166534" },
      { name: "Chico", value: 40, color: "#fca5a5" },
    ]);
  });

  it("usa paleta em array pelo índice, ciclando", () => {
    const items = panelItems(
      [{ f: "a", v: 1 }, { f: "b", v: 2 }, { f: "c", v: 3 }],
      "f",
      "v",
      ["#111", "#222"],
    );
    expect(items.map((i) => i.color)).toEqual(["#111", "#222", "#111"]);
  });

  it("descarta linha sem nome ou com valor inválido", () => {
    const items = panelItems([{ f: "", v: 1 }, { f: "ok", v: "x" }, { f: "bom", v: 5 }], "f", "v");
    expect(items).toEqual([{ name: "bom", value: 5, color: "#9ca3af" }]);
  });
});

describe("ChartPanel", () => {
  const items = [
    { name: "GGNetwork", value: 630, color: "#dc2626" },
    { name: "CoinPoker", value: 275, color: "#f8bbd9" },
  ];

  it("lista os valores em número junto do gráfico", () => {
    render(
      <ChartPanel items={items} kind="number" unit="torneios">
        <div data-testid="grafico" />
      </ChartPanel>,
    );
    const lista = screen.getByTestId("chart-value-list");
    expect(lista.textContent).toContain("GGNetwork");
    expect(lista.textContent).toContain("630");
    expect(lista.textContent).toContain("CoinPoker");
    expect(screen.getByTestId("grafico")).toBeTruthy();
  });

  it("mostra percentual sobre o total quando pedido", () => {
    render(
      <ChartPanel items={items} showPercent>
        <div />
      </ChartPanel>,
    );
    // 630 / 905 = 69,6%
    expect(screen.getByTestId("chart-value-list").textContent).toContain("69.6%");
  });

  it("sem itens não desenha a lista (não polui gráfico vazio)", () => {
    render(
      <ChartPanel items={[]}>
        <div data-testid="grafico" />
      </ChartPanel>,
    );
    expect(screen.queryByTestId("chart-value-list")).toBeNull();
    expect(screen.getByTestId("grafico")).toBeTruthy();
  });
});

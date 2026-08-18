// Range Lab / F3a — o painel de leitura: dois blocos, dois rodapes, um seletor de
// lado e o filtro que pinta a matriz (RF-03.1 + RF-03.7).
//
// DUAS REGRAS DE PRODUTO QUE ESTE PAINEL CARREGA SOZINHO
//
// 1. A frase do cabecalho do bloco de draws e REQUISITO, nao decoracao. O tipo
//    (D-F3-4) protege o codigo contra a soma de 137%; essa frase e a unica coisa
//    que impede o jogador de somar as duas colunas com os olhos.
// 2. A leitura e a equity chegam por CAMINHOS DIFERENTES (D-F3-1): a classificacao
//    e local e instantanea, a equity vem da corrida. "Categoria com contagem e
//    massa, coluna de equity em branco" e estado LEGITIMO, e nao erro.
//
// O componente e CONTROLADO (`side` e `filter` vem do dono) porque o `highlight`
// precisa alcancar uma matriz que vive fora daqui, e porque o `Reset` da pagina
// tem de limpar o filtro.
import { buildHighlight, buildRangeRead } from "@/lib/combo-calc/read";
import type { ReadCombo, ReadFilter } from "@/lib/combo-calc/read";
import type { DrawTag, MadeCategory } from "@/lib/combo-calc/classify";
import type { Card } from "@/lib/combo-calc/types";
import { categoryPalette, tokens } from "@/lib/ui-tokens";
import { BoardTextureLine } from "./BoardTextureLine";

export type ReadSide = "hero" | "villain";

const MADE_LABEL: Record<MadeCategory, string> = {
  straight_flush: "Straight flush",
  quads: "Quadra",
  full_house: "Full house",
  flush: "Flush",
  straight: "Sequencia",
  set: "Set",
  trips: "Trinca",
  two_pair: "Dois pares",
  overpair: "Overpair",
  top_pair: "Top par",
  second_pair: "2o par",
  third_pair: "3o par",
  weak_pair: "Par fraco",
  underpair: "Underpair",
  ace_high: "As alto",
  no_pair: "Sem par",
};

const DRAW_LABEL: Record<DrawTag, string> = {
  fd_nut: "Flush draw nut",
  fd: "Flush draw",
  bdfd: "Backdoor de flush",
  oesd: "Sequencia aberta",
  gutshot: "Gutshot",
  bdsd: "Backdoor de sequencia",
  overcards2: "2 overcards",
  overcard1: "1 overcard",
};

export interface CategoryPanelProps {
  board: Card[];
  heroCombos: ReadCombo[];
  villainCombos: ReadCombo[];
  side: ReadSide;
  onSideChange: (side: ReadSide) => void;
  filter: ReadFilter;
  onFilterChange: (filter: ReadFilter) => void;
}

function formatEquity(equity: number | null): string {
  // Ausencia de numero e travessao. 0% aqui seria um numero errado com cara de
  // certo — a regra que rege a frente inteira.
  return equity === null ? "—" : `${(equity * 100).toFixed(1)}%`;
}

function formatShare(mass: number, total: number): string {
  if (total <= 0) return "0%";
  return `${((mass / total) * 100).toFixed(1)}%`;
}

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function CategoryPanel({
  board,
  heroCombos,
  villainCombos,
  side,
  onSideChange,
  filter,
  onFilterChange,
}: CategoryPanelProps) {
  const combos = side === "hero" ? heroCombos : villainCombos;
  const read = buildRangeRead(combos, board);
  const highlight = buildHighlight(combos, board, filter);

  // Chip de categoria que o range nao tem sairia da tela levando o filtro junto,
  // e o jogador nao teria como desmarcar o que marcou.
  const madeChips = [
    ...new Set<MadeCategory>([...read.made.map((r) => r.id), ...filter.made]),
  ];
  const drawChips = [...new Set<DrawTag>([...read.draws.map((r) => r.id), ...filter.draws])];

  function setMade(id: MadeCategory): void {
    onFilterChange({ made: toggle(filter.made, id), draws: filter.draws });
  }

  function setDraw(id: DrawTag): void {
    onFilterChange({ made: filter.made, draws: toggle(filter.draws, id) });
  }

  return (
    <div data-testid="range-lab-category-panel" className="space-y-3">
      <BoardTextureLine board={board} />

      {/* ── seletor de lado (D-F3-22): o lado ativo decide o range agrupado ── */}
      <div className="flex gap-1">
        {(
          [
            ["villain", "Oponente"],
            ["hero", "Heroi"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            data-testid={`range-lab-category-side-${value}`}
            aria-pressed={side === value}
            onClick={() => onSideChange(value)}
            className={`rounded px-2 py-0.5 text-[10px] border ${
              side === value
                ? "bg-emerald-600 border-emerald-600 text-white"
                : `bg-transparent ${tokens.color.neutral.border} ${tokens.color.neutral.text}`
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── bloco 1: mao feita (PARTICAO) ── */}
      <section data-testid="range-lab-made-block" className="space-y-1">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Mao feita
        </h3>
        <table className="w-full text-xs">
          <tbody>
            {read.made.map((row) => (
              <tr key={row.id} data-testid={`range-lab-made-row-${row.id}`} className="border-t border-gray-800">
                <td className="p-1">
                  <span className={`inline-block h-2 w-2 rounded-sm ${categoryPalette.made(row.id)}`} />
                  <span className="ml-1">{MADE_LABEL[row.id]}</span>
                </td>
                <td
                  data-testid={`range-lab-made-row-${row.id}-combos`}
                  className={`p-1 text-right font-mono ${tokens.color.neutral.text}`}
                >
                  {row.combos}
                </td>
                <td
                  data-testid={`range-lab-made-row-${row.id}-mass`}
                  className="p-1 text-right font-mono"
                >
                  {formatShare(row.mass, read.totalMass)}
                </td>
                <td
                  data-testid={`range-lab-made-row-${row.id}-equity`}
                  className="p-1 text-right font-mono"
                >
                  {formatEquity(row.equity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p data-testid="range-lab-made-total" className={`text-[10px] ${tokens.color.neutral.text}`}>
          {read.totalCombos} combos - 100% do range
        </p>
      </section>

      {/* ── bloco 2: draws (ETIQUETA) ── */}
      <section data-testid="range-lab-draws-block" className="space-y-1">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Draws</h3>
        <p
          data-testid="range-lab-draws-overlap-notice"
          className={`text-[10px] ${tokens.color.neutral.text}`}
        >
          Um combo pode aparecer em mais de uma linha - estas linhas nao somam 100%.
        </p>
        <table className="w-full text-xs">
          <tbody>
            {read.draws.map((row) => (
              <tr key={row.id} data-testid={`range-lab-draw-row-${row.id}`} className="border-t border-gray-800">
                <td className="p-1">
                  <span className={`inline-block h-2 w-2 rounded-sm ${categoryPalette.draw(row.id)}`} />
                  <span className="ml-1">{DRAW_LABEL[row.id]}</span>
                </td>
                <td className={`p-1 text-right font-mono ${tokens.color.neutral.text}`}>
                  {row.combos}
                </td>
                <td className="p-1 text-right font-mono">{formatEquity(row.equity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p data-testid="range-lab-draws-total" className={`text-[10px] ${tokens.color.neutral.text}`}>
          {read.drawCombos} combos com pelo menos um draw
        </p>
      </section>

      {/* ── filtro: acende a matriz, NAO encolhe a tabela (emenda A16) ── */}
      <section className="space-y-1">
        <div className="flex flex-wrap gap-1">
          {madeChips.map((id) => (
            <button
              key={id}
              type="button"
              data-testid={`range-lab-filter-made-${id}`}
              aria-pressed={filter.made.has(id)}
              onClick={() => setMade(id)}
              className={`rounded px-1.5 py-0.5 text-[10px] border ${
                filter.made.has(id)
                  ? "bg-emerald-600 border-emerald-600 text-white"
                  : `bg-transparent ${tokens.color.neutral.border} ${tokens.color.neutral.text}`
              }`}
            >
              {MADE_LABEL[id]}
            </button>
          ))}
          {drawChips.map((id) => (
            <button
              key={id}
              type="button"
              data-testid={`range-lab-filter-draw-${id}`}
              aria-pressed={filter.draws.has(id)}
              onClick={() => setDraw(id)}
              className={`rounded px-1.5 py-0.5 text-[10px] border ${
                filter.draws.has(id)
                  ? "bg-sky-600 border-sky-600 text-white"
                  : `bg-transparent ${tokens.color.neutral.border} ${tokens.color.neutral.text}`
              }`}
            >
              {DRAW_LABEL[id]}
            </button>
          ))}
        </div>

        <div className="flex gap-1">
          <button
            type="button"
            data-testid="range-lab-filter-select-all"
            onClick={() =>
              onFilterChange({ made: new Set(madeChips), draws: new Set(drawChips) })
            }
            className={`rounded px-2 py-0.5 text-[10px] border ${tokens.color.neutral.border} ${tokens.color.neutral.text}`}
          >
            Marcar tudo
          </button>
          <button
            type="button"
            data-testid="range-lab-filter-clear-all"
            onClick={() => onFilterChange({ made: new Set(), draws: new Set() })}
            className={`rounded px-2 py-0.5 text-[10px] border ${tokens.color.neutral.border} ${tokens.color.neutral.text}`}
          >
            Desmarcar tudo
          </button>
        </div>

        <p
          data-testid="range-lab-filter-footer"
          className={`text-[10px] ${tokens.color.neutral.text}`}
        >
          <span data-testid="range-lab-filter-passing">{highlight.passingCombos}</span>
          {" de "}
          <span data-testid="range-lab-filter-total">{highlight.totalCombos}</span>
          {" combos acesos na matriz"}
        </p>
      </section>
    </div>
  );
}

export default CategoryPanel;

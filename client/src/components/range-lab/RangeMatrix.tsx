// Matriz 13x13 de classes (F1 / RF-01.5, estendida na F2 / RF-02.1, ADR-247).
// Serve os DOIS lados — o range do heroi e o do vilao — com o mesmo componente;
// um range e um range.
//
// A F2 acrescenta: Ctrl+clique ("esta e as melhores"), Shift+clique
// (retangulo desde a ultima celula), cabecalho de linha/coluna clicavel,
// scroll ajusta a frequencia em passos de 5%, Ctrl+Z/Ctrl+Y escopados ao
// container desta matriz (o historico em si mora no DONO do estado — D-F2-2 —
// o componente so dispara `onUndo`/`onRedo`), arrastar-para-pintar via pointer
// events (D-F2-1 criterio 5), Alt+arrastar fixa um naipe por gesto (D-F2-5) e
// um botao pequeno por celula ativa abre o seletor de naipes do dono do estado
// (RF-02.2, o popover em si mora fora, `onOpenSuitPicker`).
import { Fragment, useEffect, useRef, useState } from "react";
import { RANKS, rankChar, rankFromChar, comboKey, SUITS } from "@/lib/combo-calc/cards";
import { parseNotation } from "@/lib/combo-calc/combos";
import type { RangeEntry, Suit } from "@/lib/combo-calc/types";
import { tokens } from "@/lib/ui-tokens";
import {
  colHeaderCells,
  expandCtrlClick,
  rectangleBetween,
  rowHeaderCells,
  scrollFrequencyDelta,
} from "@/lib/combo-calc/rangeGestures";

const RANKS_DESC = [...RANKS].sort((a, b) => b - a);

/** Notacao da celula: pares na diagonal, suited acima, offsuit abaixo. */
export function cellNotation(row: number, col: number): string {
  const a = RANKS_DESC[row];
  const b = RANKS_DESC[col];
  if (row === col) return rankChar(a) + rankChar(a);
  if (row < col) return rankChar(a) + rankChar(b) + "s";
  return rankChar(b) + rankChar(a) + "o";
}

/** comboKey do UNICO combo suited de `notation` no naipe `suit` (D-F2-5, so classes suited). */
function suitedComboKeyFor(notation: string, suit: Suit): string | null {
  if (!notation.endsWith("s")) return null;
  const hi = rankFromChar(notation[0]);
  const lo = rankFromChar(notation[1]);
  if (hi == null || lo == null) return null;
  return comboKey({ rank: hi, suit }, { rank: lo, suit });
}

interface DragState {
  active: boolean;
  mode: "add" | "remove";
}

interface AltGesture {
  initialNotation: string;
  /** null enquanto o mini-seletor esta aberto e nenhum naipe foi escolhido. */
  suit: Suit | null;
}

export interface RangeMatrixProps {
  entries: RangeEntry[];
  onChange: (next: RangeEntry[]) => void;
  /** Frequencia aplicada a classe que acabou de ser ligada. */
  defaultFrequency?: number;
  testId?: string;
  /** Ctrl+Z no container desta matriz (D-F2-2: o historico mora fora daqui). */
  onUndo?: () => void;
  /** Ctrl+Y no container desta matriz. */
  onRedo?: () => void;
  /** Abre o popover de naipes (RF-02.2) para a notacao da celula ativa clicada. */
  onOpenSuitPicker?: (notation: string) => void;
  /**
   * Classes acesas pelo filtro de leitura da F3a (RF-03.7). OPCIONAL de proposito:
   * SEM a prop a celula se comporta exatamente como antes, e o popup
   * (`CombosCalculator`, D13/D-F2-6) nao sente a F3a. Conjunto VAZIO nao e o
   * mesmo que ausencia — vazio significa "nada passou no filtro".
   */
  highlight?: Set<string>;
  /**
   * Quantos combos de cada classe passam no filtro. Uma celula e uma classe com
   * ate 4 combos, que podem cair em categorias diferentes: sem essa contagem a
   * celula acesa mente.
   */
  highlightCounts?: Map<string, { passing: number; total: number }>;
}

export function RangeMatrix({
  entries,
  onChange,
  defaultFrequency = 1,
  testId = "range-lab-matrix",
  onUndo,
  onRedo,
  onOpenSuitPicker,
  highlight,
  highlightCounts,
}: RangeMatrixProps) {
  const [lastCell, setLastCell] = useState<{ row: number; col: number } | null>(null);
  const [altDragSuit, setAltDragSuit] = useState<Suit | null>(null);
  const [altPickerOpen, setAltPickerOpen] = useState(false);
  const byNotation = new Map(entries.map((e) => [e.notation, e]));

  const dragRef = useRef<DragState | null>(null);
  const altGestureRef = useRef<AltGesture | null>(null);
  /** Marca que o toggle simples ja foi aplicado pelo pointerdown — o onClick
   * subsequente (mousedown+mouseup+click do mesmo gesto num browser real) nao
   * deve repetir o toggle. Isolado por evento em cada teste, entao nao afeta
   * fireEvent.click nem fireEvent.pointerDown disparados sozinhos. */
  const pointerHandledRef = useRef(false);

  useEffect(() => {
    // Encerra o gesto em pointerup, mas TAMBEM em blur da janela e mouseleave
    // do documento — o mesmo padrao que CombosCalculator.tsx ja usa para o
    // drag antigo. Sem isso, soltar o ponteiro fora da janela (alt-tab no meio
    // do drag, largar o mouse sobre outro app) trava `dragRef` em "active", e
    // um simples passar-o-mouse-por-cima (pointerenter sem botao pressionado)
    // volta a pintar/apagar celulas sozinho.
    function stop(): void {
      if (altGestureRef.current) {
        const wasPending = altGestureRef.current.suit == null;
        altGestureRef.current = null;
        if (wasPending) setAltPickerOpen(false);
        return;
      }
      dragRef.current = null;
    }
    window.addEventListener("pointerup", stop);
    window.addEventListener("blur", stop);
    document.addEventListener("mouseleave", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("blur", stop);
      document.removeEventListener("mouseleave", stop);
    };
  }, []);

  function addNotations(notations: string[]): RangeEntry[] {
    let next = entries;
    let changed = false;
    for (const notation of notations) {
      if (next.some((e) => e.notation === notation)) continue;
      const parsed = parseNotation(notation);
      if (!parsed) continue;
      if (!changed) {
        next = [...entries];
        changed = true;
      }
      next.push({ notation, kind: parsed.kind, frequency: defaultFrequency });
    }
    return next;
  }

  function toggle(notation: string): void {
    if (byNotation.has(notation)) {
      onChange(entries.filter((e) => e.notation !== notation));
      return;
    }
    const parsed = parseNotation(notation);
    if (!parsed) return;
    onChange([...entries, { notation, kind: parsed.kind, frequency: defaultFrequency }]);
  }

  /** Aplica o modo do drag a celula: "add" so liga se estava desligada, "remove"
   * so desliga se estava ligada — nunca inventa um toggle duplo (RF-02.1). */
  function applyDragMode(notation: string, mode: "add" | "remove"): void {
    const present = byNotation.has(notation);
    if (mode === "add" && !present) toggle(notation);
    else if (mode === "remove" && present) toggle(notation);
  }

  function applyAltSuit(notation: string, suit: Suit): void {
    const key = suitedComboKeyFor(notation, suit);
    if (!key) return; // escopo desta rodada: so classes suited (D-F2-5)
    const existing = byNotation.get(notation);
    if (existing) {
      if (existing.suits?.length === 1 && existing.suits[0] === key) return;
      onChange(entries.map((e) => (e.notation === notation ? { ...e, suits: [key] } : e)));
      return;
    }
    const parsed = parseNotation(notation);
    if (!parsed) return;
    onChange([...entries, { notation, kind: parsed.kind, frequency: defaultFrequency, suits: [key] }]);
  }

  function handleAltPointerDown(notation: string): void {
    if (altDragSuit) {
      altGestureRef.current = { initialNotation: notation, suit: altDragSuit };
      applyAltSuit(notation, altDragSuit);
      return;
    }
    altGestureRef.current = { initialNotation: notation, suit: null };
    setAltPickerOpen(true);
  }

  function chooseAltSuit(suit: Suit): void {
    setAltDragSuit(suit);
    setAltPickerOpen(false);
    const gesture = altGestureRef.current;
    if (!gesture) return;
    altGestureRef.current = { ...gesture, suit };
    applyAltSuit(gesture.initialNotation, suit);
  }

  function handlePointerDown(row: number, col: number, e: React.PointerEvent): void {
    const notation = cellNotation(row, col);

    if (e.altKey) {
      handleAltPointerDown(notation);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.shiftKey) return; // Ctrl/Shift+clique ficam no onClick

    const mode: "add" | "remove" = byNotation.has(notation) ? "remove" : "add";
    dragRef.current = { active: true, mode };
    pointerHandledRef.current = true;
    toggle(notation);
    setLastCell({ row, col });
  }

  function handlePointerEnter(row: number, col: number): void {
    const notation = cellNotation(row, col);

    if (altGestureRef.current) {
      if (altGestureRef.current.suit) applyAltSuit(notation, altGestureRef.current.suit);
      return;
    }

    const drag = dragRef.current;
    if (!drag?.active) return;
    applyDragMode(notation, drag.mode);
  }

  function handleCellClick(row: number, col: number, e: React.MouseEvent): void {
    const notation = cellNotation(row, col);

    // `addNotations` devolve a MESMA referencia quando nada mudou (nenhuma
    // notacao nova) — disparar onChange mesmo assim empilharia uma entrada
    // identica no historico (D-F2-2: Ctrl+Z nao mostraria diferenca nenhuma).
    if (e.ctrlKey || e.metaKey) {
      const next = addNotations(expandCtrlClick(notation));
      if (next !== entries) onChange(next);
      return;
    }

    if (e.shiftKey && lastCell) {
      const next = addNotations(rectangleBetween(lastCell, { row, col }));
      if (next !== entries) onChange(next);
      return;
    }

    if (pointerHandledRef.current) {
      pointerHandledRef.current = false;
      return;
    }

    toggle(notation);
    setLastCell({ row, col });
  }

  function handleWheel(row: number, col: number, e: React.WheelEvent): void {
    const notation = cellNotation(row, col);
    const entry = byNotation.get(notation);
    if (!entry) return; // celula inativa: scroll nao inventa classe nova
    const nextFreq = scrollFrequencyDelta(entry.frequency, e.deltaY);
    onChange(entries.map((en) => (en.notation === notation ? { ...en, frequency: nextFreq } : en)));
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === "z" || e.key === "Z") {
      onUndo?.();
    } else if (e.key === "y" || e.key === "Y") {
      onRedo?.();
    }
  }

  function handleRowHeaderClick(row: number): void {
    const next = addNotations(rowHeaderCells(row));
    if (next !== entries) onChange(next);
  }

  function handleColHeaderClick(col: number): void {
    const next = addNotations(colHeaderCells(col));
    if (next !== entries) onChange(next);
  }

  return (
    <div
      data-testid={testId}
      className="overflow-x-auto select-none"
      onKeyDown={handleKeyDown}
    >
      <div
        className="inline-grid"
        style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}
      >
        {/* canto vazio */}
        <div className="w-[26px] h-[26px]" />
        {RANKS_DESC.map((_, col) => (
          <button
            key={`col-header-${col}`}
            type="button"
            data-testid={`range-col-header-${col}`}
            title={`Coluna ${rankChar(RANKS_DESC[col])} (offsuit)`}
            onClick={() => handleColHeaderClick(col)}
            className={`w-[26px] h-[26px] text-[9px] font-mono text-gray-500 hover:text-emerald-400`}
          >
            {rankChar(RANKS_DESC[col])}
          </button>
        ))}

        {RANKS_DESC.map((_, row) => (
          <Fragment key={`row-${row}`}>
            <button
              type="button"
              data-testid={`range-row-header-${row}`}
              title={`Linha ${rankChar(RANKS_DESC[row])} (suited)`}
              onClick={() => handleRowHeaderClick(row)}
              className={`w-[26px] h-[26px] text-[9px] font-mono text-gray-500 hover:text-emerald-400`}
            >
              {rankChar(RANKS_DESC[row])}
            </button>
            {RANKS_DESC.map((__, col) => {
              const notation = cellNotation(row, col);
              const entry = byNotation.get(notation);
              const isPair = row === col;
              const isSuited = row < col;
              const partial = !!entry?.suits && entry.suits.length > 0;
              const counts = highlightCounts?.get(notation);
              const cellTitle = counts
                ? `${notation} — ${counts.passing} de ${counts.total} passam no filtro`
                : notation;
              // Sem a prop `highlight` nao ha esmaecimento nenhum: e assim que o
              // popup continua identico ao que era antes da F3a.
              const dimmed = highlight ? !highlight.has(notation) : false;
              return (
                <div key={`${row}-${col}`} className="relative w-[26px] h-[26px]">
                  <button
                    type="button"
                    data-testid={`range-cell-${notation}`}
                    title={cellTitle}
                    data-highlighted={highlight ? String(highlight.has(notation)) : undefined}
                    onPointerDown={(e) => handlePointerDown(row, col, e)}
                    onPointerEnter={() => handlePointerEnter(row, col)}
                    onClick={(e) => handleCellClick(row, col, e)}
                    onWheel={(e) => handleWheel(row, col, e)}
                    className={`w-full h-full text-[9px] font-mono border ${
                      dimmed ? "opacity-30" : ""
                    } ${
                      partial ? "border-amber-400" : "border-gray-800"
                    } ${
                      entry
                        ? "bg-emerald-600 text-white"
                        : isPair
                          ? "bg-gray-700/60 text-gray-300"
                          : isSuited
                            ? "bg-gray-800/60 text-gray-400"
                            : "bg-gray-800/30 text-gray-500"
                    } hover:outline hover:outline-1 hover:outline-emerald-400`}
                    style={
                      entry && entry.frequency < 1
                        ? { opacity: 0.4 + entry.frequency * 0.6 }
                        : undefined
                    }
                  >
                    {notation.replace(/[so]$/, "")}
                  </button>
                  {entry && onOpenSuitPicker && (
                    <button
                      type="button"
                      data-testid={`range-cell-naipes-${notation}`}
                      title="Selecionar naipes"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenSuitPicker(notation);
                      }}
                      className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-gray-900 bg-gray-700 text-[6px] leading-none text-gray-200 hover:bg-emerald-500"
                    >
                      •
                    </button>
                  )}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>

      {altPickerOpen && (
        <div
          data-testid="alt-drag-suit-picker"
          className="mt-1 flex items-center gap-1 rounded border border-gray-800 bg-gray-900 p-1.5 text-[10px]"
        >
          <span className={tokens.color.neutral.text}>Naipe do Alt+arrastar:</span>
          {SUITS.map((suit) => (
            <button
              key={suit}
              type="button"
              data-testid={`alt-drag-suit-${suit}`}
              onClick={() => chooseAltSuit(suit)}
              className="w-5 h-5 rounded border border-gray-700 bg-gray-800/60 text-gray-200 hover:border-emerald-500/50 hover:text-emerald-300"
            >
              {suit}
            </button>
          ))}
        </div>
      )}

      <p className={`mt-1 text-[10px] ${tokens.color.neutral.text}`}>
        Clique para ligar ou desligar a classe. Ctrl+clique expande, Shift+clique
        pinta o retangulo, scroll ajusta a frequencia, Alt+arrastar pinta so um naipe.
      </p>
    </div>
  );
}

export default RangeMatrix;

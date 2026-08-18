// Gestos puros da matriz (F2, D-F2-1, ADR-247). RangeMatrix continua
// "presentacional" — a math de expansao mora aqui, testavel fora do React.
import { cellNotation } from "@/components/range-lab/RangeMatrix";
import { clampFreq, expandRangeToken } from "./combos";

/**
 * Ctrl+clique: "esta e as melhores" no eixo natural. Reusa
 * `expandRangeToken(notation + "+")` — ZERO gramatica nova (D9 do indice).
 */
export function expandCtrlClick(notation: string): string[] {
  return expandRangeToken(notation + "+");
}

/** Linha do rank `row`: cellNotation(row, i) para i de 0 a 12. */
export function rowHeaderCells(row: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < 13; i++) out.push(cellNotation(row, i));
  return out;
}

/** Coluna do rank `col`: cellNotation(i, col) para i de 0 a 12. */
export function colHeaderCells(col: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < 13; i++) out.push(cellNotation(i, col));
  return out;
}

export interface MatrixCoord {
  row: number;
  col: number;
}

/**
 * Retangulo entre duas celulas (Shift+clique), row-major, simetrico entre
 * `a` e `b`.
 */
export function rectangleBetween(a: MatrixCoord, b: MatrixCoord): string[] {
  const rowLo = Math.min(a.row, b.row);
  const rowHi = Math.max(a.row, b.row);
  const colLo = Math.min(a.col, b.col);
  const colHi = Math.max(a.col, b.col);
  const out: string[] = [];
  for (let r = rowLo; r <= rowHi; r++) {
    for (let c = colLo; c <= colHi; c++) {
      out.push(cellNotation(r, c));
    }
  }
  return out;
}

/**
 * Scroll na celula ajusta a frequencia da classe em passos de 5% (emenda A7).
 * deltaY > 0 (scroll para baixo) reduz; deltaY < 0 (scroll para cima) aumenta.
 */
export function scrollFrequencyDelta(current: number, wheelDeltaY: number): number {
  const step = wheelDeltaY > 0 ? -0.05 : wheelDeltaY < 0 ? 0.05 : 0;
  return clampFreq(current + step);
}

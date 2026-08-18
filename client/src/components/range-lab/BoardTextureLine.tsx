// Range Lab / F3a — a textura do bordo numa linha so (emenda A15).
//
// Duas dimensoes INDEPENDENTES: naipe e pareamento. Elas nao se contaminam —
// bordo monotone pareado carrega as duas marcas.
import { boardTexture } from "@/lib/combo-calc/classify";
import type { BoardTexture } from "@/lib/combo-calc/classify";
import type { Card } from "@/lib/combo-calc/types";
import { tokens } from "@/lib/ui-tokens";

const SUIT_LABEL: Record<BoardTexture["suit"], string> = {
  rainbow: "naipes variados (rainbow)",
  "2flush": "dois do mesmo naipe",
  monotone: "monotone, tres do mesmo naipe",
  four_flush: "quatro do mesmo naipe",
  five_flush: "cinco do mesmo naipe",
};

const PAIRING_LABEL: Record<BoardTexture["pairing"], string> = {
  unpaired: "sem par",
  paired: "pareado",
  trips: "trinca na mesa",
  quads: "quadra na mesa",
};

export interface BoardTextureLineProps {
  board: Card[];
}

export function BoardTextureLine({ board }: BoardTextureLineProps) {
  // Bordo incompleto nao ganha textura inventada: ate o flop fechar nao ha o que
  // descrever, e um rotulo aqui seria leitura de um bordo que nao existe.
  if (board.length < 3) {
    return (
      <p data-testid="range-lab-board-texture" className={`text-xs ${tokens.color.neutral.text}`}>
        Monte o flop para ver a textura do bordo.
      </p>
    );
  }

  const texture = boardTexture(board);
  return (
    <p data-testid="range-lab-board-texture" className={`text-xs ${tokens.color.neutral.text}`}>
      Textura: {SUIT_LABEL[texture.suit]} - {PAIRING_LABEL[texture.pairing]}
    </p>
  );
}

export default BoardTextureLine;

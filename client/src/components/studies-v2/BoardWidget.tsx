import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { X, Plus, Trash2, Copy, HelpCircle, ChevronDown } from 'lucide-react';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const;
const SUITS = [
  { symbol: '\u2660', name: 'spades', letter: 's', color: '#3b82f6', textClass: 'text-blue-500' },
  { symbol: '\u2665', name: 'hearts', letter: 'h', color: '#ef4444', textClass: 'text-red-500' },
  { symbol: '\u2666', name: 'diamonds', letter: 'd', color: '#ef4444', textClass: 'text-red-500' },
  { symbol: '\u2663', name: 'clubs', letter: 'c', color: '#22c55e', textClass: 'text-green-500' },
] as const;

const SUIT_BY_LETTER: Record<string, typeof SUITS[number]> = {};
for (const s of SUITS) {
  SUIT_BY_LETTER[s.letter] = s;
}

const VALID_RANKS = new Set(RANKS as readonly string[]);

export interface CardData {
  rank: string;
  suit: string;
}

export interface BoardData {
  id: string;
  label: string;
  flop: [CardData | null, CardData | null, CardData | null];
  turn: CardData | null;
  river: CardData | null;
}

function createEmptyBoard(id: string): BoardData {
  return { id, label: '', flop: [null, null, null], turn: null, river: null };
}

function createBoardWithCards(id: string, label: string, cards: CardData[]): BoardData {
  return {
    id,
    label,
    flop: [cards[0] ?? null, cards[1] ?? null, cards[2] ?? null],
    turn: cards[3] ?? null,
    river: cards[4] ?? null,
  };
}

// --- Text input parser ---
function parseCardNotation(text: string): CardData[] {
  const cleaned = text.trim().toLowerCase();
  if (!cleaned) return [];
  const cards: CardData[] = [];
  let i = 0;
  while (i < cleaned.length && cards.length < 5) {
    // Skip spaces
    if (cleaned[i] === ' ') { i++; continue; }
    if (i + 1 >= cleaned.length) break;
    const rankChar = cleaned[i].toUpperCase();
    const suitChar = cleaned[i + 1];
    if (VALID_RANKS.has(rankChar) && SUIT_BY_LETTER[suitChar]) {
      cards.push({ rank: rankChar, suit: SUIT_BY_LETTER[suitChar].name });
      i += 2;
    } else {
      break; // invalid char, stop
    }
  }
  return cards;
}

// --- Board texture detection ---
interface BoardTexture {
  structure: 'Rainbow' | 'Two-tone' | 'Monotone' | null;
  pairing: 'Paired' | null;
  height: 'A-high' | 'K-high' | 'Q-high' | 'Mid' | 'Low' | null;
}

const RANK_ORDER: Record<string, number> = {};
RANKS.forEach((r, i) => { RANK_ORDER[r] = 13 - i; }); // A=13, K=12, ..., 2=1

function detectBoardTexture(flop: [CardData | null, CardData | null, CardData | null]): BoardTexture {
  const cards = flop.filter((c): c is CardData => c !== null);
  if (cards.length < 3) return { structure: null, pairing: null, height: null };

  // Structure (suit analysis)
  const suits = new Set(cards.map(c => c.suit));
  let structure: BoardTexture['structure'];
  if (suits.size === 3) structure = 'Rainbow';
  else if (suits.size === 2) structure = 'Two-tone';
  else structure = 'Monotone';

  // Pairing (rank analysis)
  const ranks = cards.map(c => c.rank);
  const pairing: BoardTexture['pairing'] = new Set(ranks).size < ranks.length ? 'Paired' : null;

  // Height
  const highestRank = cards.reduce((best, c) => (RANK_ORDER[c.rank] > RANK_ORDER[best.rank] ? c : best)).rank;
  let height: BoardTexture['height'];
  if (highestRank === 'A' || highestRank === 'K' || highestRank === 'Q') {
    height = `${highestRank}-high` as BoardTexture['height'];
  } else if (highestRank === 'J' || highestRank === 'T' || highestRank === '9') {
    height = 'Mid';
  } else {
    height = 'Low';
  }

  return { structure, pairing, height };
}

function TextureBadge({ texture }: { texture: BoardTexture }) {
  if (!texture.structure && !texture.pairing) return null;

  const badges: React.ReactNode[] = [];

  // Height label
  const heightLabel = texture.height ?? '';

  if (texture.pairing) {
    badges.push(
      <span key="paired" className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
        {heightLabel} Paired
      </span>
    );
  }

  if (texture.structure) {
    const structConfig = {
      Rainbow: { bg: 'bg-gray-500/20', text: 'text-gray-300', border: 'border-gray-500/30', emoji: ' \ud83c\udf08' },
      'Two-tone': { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', emoji: '' },
      Monotone: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', emoji: '' },
    };
    const cfg = structConfig[texture.structure];
    // Only show height in structure badge if no pairing badge already shows it
    const prefix = texture.pairing ? '' : `${heightLabel} `;
    badges.push(
      <span key="struct" className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
        {prefix}{texture.structure}{cfg.emoji}
      </span>
    );
  }

  return <div className="flex items-center gap-1.5 flex-wrap">{badges}</div>;
}

// --- Presets ---
const BOARD_PRESETS: { label: string; cards: CardData[] }[] = [
  { label: 'A-high dry', cards: [{ rank: 'A', suit: 'hearts' }, { rank: '7', suit: 'diamonds' }, { rank: '2', suit: 'clubs' }] },
  { label: 'K-high two-tone', cards: [{ rank: 'K', suit: 'hearts' }, { rank: 'J', suit: 'hearts' }, { rank: '5', suit: 'diamonds' }] },
  { label: 'Low monotone', cards: [{ rank: '7', suit: 'spades' }, { rank: '5', suit: 'spades' }, { rank: '3', suit: 'spades' }] },
  { label: 'Broadway', cards: [{ rank: 'A', suit: 'hearts' }, { rank: 'K', suit: 'diamonds' }, { rank: 'Q', suit: 'clubs' }] },
  { label: 'Paired', cards: [{ rank: 'A', suit: 'hearts' }, { rank: 'A', suit: 'diamonds' }, { rank: '7', suit: 'clubs' }] },
  { label: 'Low connected', cards: [{ rank: '8', suit: 'hearts' }, { rank: '7', suit: 'diamonds' }, { rank: '6', suit: 'clubs' }] },
];

// --- Realistic card rendering ---
function getSuitData(suitName: string) {
  return SUITS.find((s) => s.name === suitName) ?? null;
}

function PokerCard({ card, size = 'md' }: { card: CardData | null; size?: 'sm' | 'md' }) {
  const suit = card ? getSuitData(card.suit) : null;

  if (!card || !suit) {
    const dims = size === 'sm' ? 'w-8 h-11' : 'w-14 h-20';
    return (
      <div className={`${dims} rounded-lg border-2 border-dashed border-gray-600 bg-gray-800/80 flex items-center justify-center`}>
        <span className="text-gray-600 text-xs">?</span>
      </div>
    );
  }

  if (size === 'sm') {
    return (
      <div
        className="w-8 h-11 rounded-md flex flex-col items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, #fafafa 0%, #e8e8e8 100%)',
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
          border: '1px solid rgba(200,200,200,0.4)',
        }}
      >
        <span className="text-[10px] font-black leading-none" style={{ color: suit.color }}>{card.rank}</span>
        <span className="text-xs leading-none" style={{ color: suit.color }}>{suit.symbol}</span>
      </div>
    );
  }

  return (
    <div
      className="w-14 h-20 rounded-lg relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #fafafa 0%, #e8e8e8 100%)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        border: '1px solid rgba(200,200,200,0.4)',
      }}
    >
      {/* Top-left rank + suit */}
      <div className="absolute top-1 left-1.5 flex flex-col items-center leading-none">
        <span className="text-sm font-black" style={{ color: suit.color }}>{card.rank}</span>
        <span className="text-xs -mt-0.5" style={{ color: suit.color }}>{suit.symbol}</span>
      </div>
      {/* Center suit (large) */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl opacity-20" style={{ color: suit.color }}>{suit.symbol}</span>
      </div>
      {/* Bottom-right rank + suit (rotated) */}
      <div className="absolute bottom-1 right-1.5 flex flex-col items-center leading-none rotate-180">
        <span className="text-sm font-black" style={{ color: suit.color }}>{card.rank}</span>
        <span className="text-xs -mt-0.5" style={{ color: suit.color }}>{suit.symbol}</span>
      </div>
    </div>
  );
}

// Card slot (clickable)
function CardSlot({ card, onClick, label }: { card: CardData | null; onClick: () => void; label?: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button type="button" onClick={onClick} className="relative group">
        <PokerCard card={card} />
        <div className="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/10 transition-colors" />
      </button>
      {label && <span className="text-[9px] text-gray-500 uppercase tracking-wider">{label}</span>}
    </div>
  );
}

// --- Card picker (rendered inside Dialog) ---
interface CardPickerInnerProps {
  onSelect: (card: CardData) => void;
  onClear: () => void;
  usedCards: string[];
}

function CardPickerInner({ onSelect, onClear, usedCards }: CardPickerInnerProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <button onClick={onClear} className="text-xs text-gray-400 hover:text-red-400 transition-colors">Limpar</button>
      </div>
      {SUITS.map((suit) => (
        <div key={suit.name} className="flex items-center gap-1 p-1.5 rounded-lg bg-gray-800/50">
          <span className="w-6 text-center text-lg" style={{ color: suit.color }}>{suit.symbol}</span>
          <div className="flex gap-0.5 flex-1 flex-wrap">
            {RANKS.map((rank) => {
              const cardKey = `${rank}${suit.name}`;
              const isUsed = usedCards.includes(cardKey);
              return (
                <button
                  key={cardKey}
                  type="button"
                  disabled={isUsed}
                  className={`w-[22px] h-8 rounded text-xs font-bold flex items-center justify-center transition-all ${
                    isUsed
                      ? 'bg-gray-700/50 text-gray-600 cursor-not-allowed opacity-30'
                      : 'bg-gray-800 hover:bg-gray-600 hover:scale-110 cursor-pointer active:scale-95'
                  }`}
                  style={{ color: isUsed ? undefined : suit.color }}
                  onClick={() => onSelect({ rank, suit: suit.name })}
                >
                  {rank}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Main widget ---
export interface BoardWidgetProps {
  boards: BoardData[];
  onChange: (boards: BoardData[]) => void;
}

export function BoardWidget({ boards, onChange }: BoardWidgetProps) {
  const [pickerState, setPickerState] = useState<{
    boardId: string;
    slotType: 'flop';
    slotIndex: number;
  } | {
    boardId: string;
    slotType: 'turn' | 'river';
  } | null>(null);

  const [textInputs, setTextInputs] = useState<Record<string, string>>({});

  const getUsedCards = useCallback(
    (boardId: string): string[] => {
      const board = boards.find((b) => b.id === boardId);
      if (!board) return [];
      const used: string[] = [];
      for (const c of board.flop) {
        if (c) used.push(`${c.rank}${c.suit}`);
      }
      if (board.turn) used.push(`${board.turn.rank}${board.turn.suit}`);
      if (board.river) used.push(`${board.river.rank}${board.river.suit}`);
      return used;
    },
    [boards]
  );

  const handleCardSelect = (card: CardData) => {
    if (!pickerState) return;
    const { boardId } = pickerState;

    const updatedBoards = boards.map((b) => {
      if (b.id !== boardId) return b;
      if (pickerState.slotType === 'flop') {
        const newFlop = [...b.flop] as BoardData['flop'];
        newFlop[pickerState.slotIndex] = card;
        return { ...b, flop: newFlop };
      } else if (pickerState.slotType === 'turn') {
        return { ...b, turn: card };
      } else {
        return { ...b, river: card };
      }
    });
    onChange(updatedBoards);

    // Auto-advance to next empty slot
    const board = boards.find(b => b.id === boardId);
    if (board && pickerState.slotType === 'flop' && pickerState.slotIndex < 2) {
      const nextIndex = pickerState.slotIndex + 1;
      if (!board.flop[nextIndex]) {
        setPickerState({ boardId, slotType: 'flop', slotIndex: nextIndex });
        return;
      }
    }
    if (board && pickerState.slotType === 'flop' && pickerState.slotIndex === 2 && !board.turn) {
      setPickerState({ boardId, slotType: 'turn' });
      return;
    }
    if (board && pickerState.slotType === 'turn' && !board.river) {
      setPickerState({ boardId, slotType: 'river' });
      return;
    }

    setPickerState(null);
  };

  const handleCardClear = () => {
    if (!pickerState) return;
    const { boardId } = pickerState;

    onChange(
      boards.map((b) => {
        if (b.id !== boardId) return b;
        if (pickerState.slotType === 'flop') {
          const newFlop = [...b.flop] as BoardData['flop'];
          newFlop[pickerState.slotIndex] = null;
          return { ...b, flop: newFlop };
        } else if (pickerState.slotType === 'turn') {
          return { ...b, turn: null };
        } else {
          return { ...b, river: null };
        }
      })
    );
    setPickerState(null);
  };

  // Handle text input parsing
  const handleTextInputApply = (boardId: string, text: string) => {
    const cards = parseCardNotation(text);
    if (cards.length === 0) return;

    onChange(
      boards.map((b) => {
        if (b.id !== boardId) return b;
        return {
          ...b,
          flop: [cards[0] ?? null, cards[1] ?? null, cards[2] ?? null],
          turn: cards[3] ?? null,
          river: cards[4] ?? null,
        };
      })
    );
    setTextInputs(prev => ({ ...prev, [boardId]: '' }));
  };

  // Duplicate a board
  const handleDuplicate = (boardId: string) => {
    const board = boards.find(b => b.id === boardId);
    if (!board) return;
    const newBoard: BoardData = {
      ...board,
      id: `board-${Date.now()}`,
      label: board.label ? `${board.label} (copia)` : '(copia)',
      flop: [...board.flop] as BoardData['flop'],
    };
    const idx = boards.findIndex(b => b.id === boardId);
    const newBoards = [...boards];
    newBoards.splice(idx + 1, 0, newBoard);
    onChange(newBoards);
  };

  // Add preset board
  const handlePreset = (preset: typeof BOARD_PRESETS[number]) => {
    const newBoard = createBoardWithCards(`board-${Date.now()}`, preset.label, preset.cards);
    onChange([...boards, newBoard]);
  };

  // Build text representation for display
  const getBoardText = (board: BoardData): string => {
    const parts: string[] = [];
    const flopStr = board.flop
      .map(c => c ? `${c.rank}${getSuitData(c.suit)?.symbol ?? ''}` : '')
      .filter(Boolean)
      .join(' ');
    if (flopStr) parts.push(flopStr);
    if (board.turn) parts.push(`${board.turn.rank}${getSuitData(board.turn.suit)?.symbol ?? ''}`);
    if (board.river) parts.push(`${board.river.rank}${getSuitData(board.river.suit)?.symbol ?? ''}`);
    return parts.join(' | ');
  };

  if (boards.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="text-gray-400 border-gray-700 hover:text-white hover:border-gray-500 bg-transparent"
          onClick={() => onChange([createEmptyBoard(`board-${Date.now()}`)])}
        >
          <Plus className="h-3 w-3 mr-1" />
          Adicionar Board
        </Button>
        <PresetsDropdown onSelect={handlePreset} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {boards.map((board) => {
        const texture = detectBoardTexture(board.flop);
        const boardText = getBoardText(board);
        return (
          <div key={board.id} className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            {/* Header: label + actions */}
            <div className="flex items-center justify-between mb-3">
              <Input
                value={board.label}
                onChange={(e) => onChange(boards.map((b) => (b.id === board.id ? { ...b, label: e.target.value } : b)))}
                placeholder="Ex: Board seco A-high rainbow"
                className="h-7 text-sm bg-transparent border-none text-gray-300 placeholder:text-gray-600 p-0 focus-visible:ring-0 max-w-[300px]"
                maxLength={60}
              />
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-gray-500 hover:text-blue-400"
                  title="Duplicar board"
                  onClick={() => handleDuplicate(board.id)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-gray-500 hover:text-red-400"
                  onClick={() => onChange(boards.filter((b) => b.id !== board.id))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Text input for board notation */}
            <div className="flex items-center gap-2 mb-3">
              <Input
                value={textInputs[board.id] ?? ''}
                onChange={(e) => setTextInputs(prev => ({ ...prev, [board.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleTextInputApply(board.id, textInputs[board.id] ?? '');
                  }
                }}
                onBlur={() => {
                  const val = textInputs[board.id] ?? '';
                  if (val.trim()) handleTextInputApply(board.id, val);
                }}
                placeholder="Ex: AhKd7c"
                className="h-7 text-xs bg-gray-900/60 border-gray-600 text-gray-300 placeholder:text-gray-600 font-mono max-w-[180px]"
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-gray-500 hover:text-gray-300 transition-colors">
                      <HelpCircle className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px] text-xs">
                    <p className="font-semibold mb-1">Notacao de cartas:</p>
                    <p>Cada carta = Rank + Naipe</p>
                    <p>Ranks: A K Q J T 9 8 7 6 5 4 3 2</p>
                    <p>Naipes: h=copas, d=ouros, c=paus, s=espadas</p>
                    <p className="mt-1">Ex: <span className="font-mono">AhKd7c</span> ou <span className="font-mono">As Kd 7c Th 2s</span></p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Card slots */}
            <div className="flex items-end gap-2 flex-wrap">
              {/* Flop */}
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-widest">Flop</span>
                <div className="flex gap-1.5">
                  {board.flop.map((card, i) => (
                    <CardSlot
                      key={i}
                      card={card}
                      onClick={() => setPickerState({ boardId: board.id, slotType: 'flop', slotIndex: i })}
                    />
                  ))}
                </div>
              </div>

              <div className="w-px h-12 bg-gray-600 self-end mb-1" />

              {/* Turn */}
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-blue-400 font-semibold uppercase tracking-widest">Turn</span>
                <CardSlot
                  card={board.turn}
                  onClick={() => setPickerState({ boardId: board.id, slotType: 'turn' })}
                />
              </div>

              <div className="w-px h-12 bg-gray-600 self-end mb-1" />

              {/* River */}
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-purple-400 font-semibold uppercase tracking-widest">River</span>
                <CardSlot
                  card={board.river}
                  onClick={() => setPickerState({ boardId: board.id, slotType: 'river' })}
                />
              </div>

              {/* Board text + texture */}
              {boardText && (
                <div className="ml-3 self-end mb-1 flex flex-col gap-1">
                  <span className="text-xs text-gray-500 font-mono">{boardText}</span>
                  <TextureBadge texture={texture} />
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Card Picker Dialog */}
      <Dialog
        open={pickerState !== null}
        onOpenChange={(open) => { if (!open) setPickerState(null); }}
      >
        <DialogContent className="sm:max-w-[400px] bg-gray-900 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-sm text-white">Selecione uma carta</DialogTitle>
            <DialogDescription className="text-xs text-gray-400">
              {pickerState && (
                <>
                  {pickerState.slotType === 'flop' && `Flop - Carta ${'slotIndex' in pickerState ? pickerState.slotIndex + 1 : ''}`}
                  {pickerState.slotType === 'turn' && 'Turn'}
                  {pickerState.slotType === 'river' && 'River'}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {pickerState && (
            <CardPickerInner
              onSelect={handleCardSelect}
              onClear={handleCardClear}
              usedCards={getUsedCards(pickerState.boardId)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Bottom actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="text-gray-400 border-gray-700 hover:text-white hover:border-gray-500 bg-transparent"
          onClick={() => onChange([...boards, createEmptyBoard(`board-${Date.now()}`)])}
        >
          <Plus className="h-3 w-3 mr-1" />
          Adicionar Board
        </Button>
        <PresetsDropdown onSelect={handlePreset} />
      </div>
    </div>
  );
}

// --- Presets dropdown ---
function PresetsDropdown({ onSelect }: { onSelect: (preset: typeof BOARD_PRESETS[number]) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="text-gray-400 border-gray-700 hover:text-white hover:border-gray-500 bg-transparent"
        >
          Presets
          <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-gray-900 border-gray-700">
        {BOARD_PRESETS.map((preset) => {
          const display = preset.cards.map(c => `${c.rank}${getSuitData(c.suit)?.symbol ?? ''}`).join(' ');
          return (
            <DropdownMenuItem
              key={preset.label}
              onClick={() => onSelect(preset)}
              className="text-gray-300 hover:text-white focus:text-white cursor-pointer"
            >
              <span className="font-mono text-xs mr-2">{display}</span>
              <span className="text-gray-500 text-xs">{preset.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { createEmptyBoard };

import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Plus, Trash2 } from 'lucide-react';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const;
const SUITS = [
  { symbol: '♠', name: 'spades', color: '#60a5fa', bg: 'bg-blue-950/50', border: 'border-blue-700/50' },
  { symbol: '♥', name: 'hearts', color: '#f87171', bg: 'bg-red-950/50', border: 'border-red-700/50' },
  { symbol: '♦', name: 'diamonds', color: '#fbbf24', bg: 'bg-yellow-950/50', border: 'border-yellow-700/50' },
  { symbol: '♣', name: 'clubs', color: '#4ade80', bg: 'bg-green-950/50', border: 'border-green-700/50' },
] as const;

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

// Visual card rendering
function PokerCard({ card, size = 'md' }: { card: CardData | null; size?: 'sm' | 'md' }) {
  const suit = card ? SUITS.find((s) => s.name === card.suit) : null;
  const dims = size === 'sm' ? 'w-8 h-11' : 'w-14 h-20';
  const rankSize = size === 'sm' ? 'text-xs' : 'text-lg';
  const suitSize = size === 'sm' ? 'text-sm' : 'text-xl';

  if (!card || !suit) {
    return (
      <div className={`${dims} rounded-lg border-2 border-dashed border-gray-600 bg-gray-800/80 flex items-center justify-center`}>
        <span className="text-gray-600 text-xs">?</span>
      </div>
    );
  }

  return (
    <div className={`${dims} rounded-lg border ${suit.border} ${suit.bg} flex flex-col items-center justify-center shadow-md`}>
      <span className={`${rankSize} font-black text-white leading-none`}>{card.rank}</span>
      <span className={`${suitSize} leading-none`} style={{ color: suit.color }}>{suit.symbol}</span>
    </div>
  );
}

// Card slot (clickable)
function CardSlot({ card, onClick, label }: { card: CardData | null; onClick: () => void; label?: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button type="button" onClick={onClick} className="relative group">
        <PokerCard card={card} />
        <div className="absolute inset-0 rounded-lg bg-white/0 group-hover:bg-white/10 transition-colors" />
      </button>
      {label && <span className="text-[9px] text-gray-500 uppercase tracking-wider">{label}</span>}
    </div>
  );
}

// Full card picker with visual naipes
interface CardPickerProps {
  onSelect: (card: CardData) => void;
  onClear: () => void;
  onClose: () => void;
  usedCards: string[];
}

function CardPicker({ onSelect, onClear, onClose, usedCards }: CardPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute z-50 top-full mt-2 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-600 rounded-xl p-4 shadow-2xl min-w-[340px]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-white font-medium">Selecione uma carta</span>
        <div className="flex items-center gap-2">
          <button onClick={onClear} className="text-xs text-gray-400 hover:text-red-400 transition-colors">Limpar</button>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {SUITS.map((suit) => (
          <div key={suit.name} className={`flex items-center gap-1 p-1.5 rounded-lg ${suit.bg}`}>
            <span className="w-6 text-center text-lg" style={{ color: suit.color }}>{suit.symbol}</span>
            <div className="flex gap-0.5 flex-1">
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
    </div>
  );
}

// Main widget
interface BoardWidgetProps {
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

    onChange(
      boards.map((b) => {
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
      })
    );

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

  if (boards.length === 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="text-gray-400 border-gray-700 hover:text-white hover:border-gray-500 bg-transparent"
        onClick={() => onChange([createEmptyBoard(`board-${Date.now()}`)])}
      >
        <Plus className="h-3 w-3 mr-1" />
        Adicionar Board
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      {boards.map((board) => (
        <div key={board.id} className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <Input
              value={board.label}
              onChange={(e) => onChange(boards.map((b) => (b.id === board.id ? { ...b, label: e.target.value } : b)))}
              placeholder="Ex: Board seco A-high rainbow"
              className="h-7 text-sm bg-transparent border-none text-gray-300 placeholder:text-gray-600 p-0 focus-visible:ring-0 max-w-[300px]"
              maxLength={60}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-gray-500 hover:text-red-400"
              onClick={() => onChange(boards.filter((b) => b.id !== board.id))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex items-end gap-2">
            {/* Flop */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-widest">Flop</span>
              <div className="flex gap-1.5 relative">
                {board.flop.map((card, i) => (
                  <div key={i} className="relative">
                    <CardSlot
                      card={card}
                      onClick={() => setPickerState({ boardId: board.id, slotType: 'flop', slotIndex: i })}
                    />
                    {pickerState && pickerState.boardId === board.id && pickerState.slotType === 'flop' && 'slotIndex' in pickerState && pickerState.slotIndex === i && (
                      <CardPicker onSelect={handleCardSelect} onClear={handleCardClear} onClose={() => setPickerState(null)} usedCards={getUsedCards(board.id)} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="w-px h-12 bg-gray-600 self-end mb-1" />

            {/* Turn */}
            <div className="flex flex-col items-center gap-1 relative">
              <span className="text-[10px] text-blue-400 font-semibold uppercase tracking-widest">Turn</span>
              <CardSlot
                card={board.turn}
                onClick={() => setPickerState({ boardId: board.id, slotType: 'turn' })}
              />
              {pickerState && pickerState.boardId === board.id && pickerState.slotType === 'turn' && (
                <CardPicker onSelect={handleCardSelect} onClear={handleCardClear} onClose={() => setPickerState(null)} usedCards={getUsedCards(board.id)} />
              )}
            </div>

            <div className="w-px h-12 bg-gray-600 self-end mb-1" />

            {/* River */}
            <div className="flex flex-col items-center gap-1 relative">
              <span className="text-[10px] text-purple-400 font-semibold uppercase tracking-widest">River</span>
              <CardSlot
                card={board.river}
                onClick={() => setPickerState({ boardId: board.id, slotType: 'river' })}
              />
              {pickerState && pickerState.boardId === board.id && pickerState.slotType === 'river' && (
                <CardPicker onSelect={handleCardSelect} onClear={handleCardClear} onClose={() => setPickerState(null)} usedCards={getUsedCards(board.id)} />
              )}
            </div>

            {/* Board text representation */}
            {(board.flop[0] || board.turn || board.river) && (
              <div className="ml-3 self-end mb-1">
                <span className="text-xs text-gray-500 font-mono">
                  {board.flop.map(c => c ? `${c.rank}${SUITS.find(s => s.name === c.suit)?.symbol}` : '').filter(Boolean).join(' ')}
                  {board.turn ? ` | ${board.turn.rank}${SUITS.find(s => s.name === board.turn!.suit)?.symbol}` : ''}
                  {board.river ? ` | ${board.river.rank}${SUITS.find(s => s.name === board.river!.suit)?.symbol}` : ''}
                </span>
              </div>
            )}
          </div>
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        className="text-gray-400 border-gray-700 hover:text-white hover:border-gray-500 bg-transparent"
        onClick={() => onChange([...boards, createEmptyBoard(`board-${Date.now()}`)])}
      >
        <Plus className="h-3 w-3 mr-1" />
        Adicionar Board
      </Button>
    </div>
  );
}

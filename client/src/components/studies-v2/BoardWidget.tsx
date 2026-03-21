import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Plus } from 'lucide-react';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const;
const SUITS = [
  { symbol: '\u2660', name: 'spades', color: '#3b82f6' },
  { symbol: '\u2665', name: 'hearts', color: '#ef4444' },
  { symbol: '\u2663', name: 'clubs', color: '#16a34a' },
  { symbol: '\u2666', name: 'diamonds', color: '#f59e0b' },
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
  return {
    id,
    label: '',
    flop: [null, null, null],
    turn: null,
    river: null,
  };
}

interface CardSlotProps {
  card: CardData | null;
  onClick: () => void;
  slotLabel?: string;
}

function CardSlot({ card, onClick, slotLabel }: CardSlotProps) {
  if (!card) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-12 h-16 rounded-md border-2 border-dashed border-gray-600 hover:border-gray-400 bg-gray-800 flex items-center justify-center transition-colors"
        title={slotLabel || 'Selecionar carta'}
      >
        <span className="text-gray-500 text-xs">?</span>
      </button>
    );
  }

  const suit = SUITS.find((s) => s.name === card.suit);
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-12 h-16 rounded-md border border-gray-600 bg-gray-900 flex flex-col items-center justify-center transition-colors hover:border-gray-400"
    >
      <span className="text-sm font-bold text-white">{card.rank}</span>
      <span style={{ color: suit?.color }} className="text-lg leading-none">
        {suit?.symbol}
      </span>
    </button>
  );
}

interface CardPickerProps {
  onSelect: (card: CardData) => void;
  onClear: () => void;
  onClose: () => void;
  usedCards: string[];
}

function CardPicker({ onSelect, onClear, onClose, usedCards }: CardPickerProps) {
  return (
    <div className="absolute z-50 bg-gray-800 border border-gray-600 rounded-lg p-3 shadow-xl">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400 font-medium">Selecione uma carta</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-gray-400 hover:text-red-400"
            onClick={onClear}
            title="Limpar"
          >
            <X className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-gray-400 hover:text-white"
            onClick={onClose}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        {SUITS.map((suit) => (
          <div key={suit.name} className="flex gap-0.5">
            {RANKS.map((rank) => {
              const cardKey = `${rank}${suit.name}`;
              const isUsed = usedCards.includes(cardKey);
              return (
                <button
                  key={cardKey}
                  type="button"
                  disabled={isUsed}
                  className={`w-6 h-7 rounded text-xs font-bold flex items-center justify-center transition-colors ${
                    isUsed
                      ? 'bg-gray-700 text-gray-600 cursor-not-allowed'
                      : 'bg-gray-900 hover:bg-gray-700 cursor-pointer'
                  }`}
                  style={{ color: isUsed ? undefined : suit.color }}
                  onClick={() => onSelect({ rank, suit: suit.name })}
                  title={`${rank}${suit.symbol}`}
                >
                  {rank}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

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

  const handleAddBoard = () => {
    const id = `board-${Date.now()}`;
    onChange([...boards, createEmptyBoard(id)]);
  };

  const handleRemoveBoard = (id: string) => {
    onChange(boards.filter((b) => b.id !== id));
  };

  const handleLabelChange = (id: string, label: string) => {
    onChange(boards.map((b) => (b.id === id ? { ...b, label } : b)));
  };

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
        onClick={handleAddBoard}
      >
        <Plus className="h-3 w-3 mr-1" />
        Adicionar Board
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      {boards.map((board) => (
        <div
          key={board.id}
          className="bg-gray-800/50 border border-gray-700 rounded-lg p-3"
        >
          <div className="flex items-center justify-between mb-2">
            <Input
              value={board.label}
              onChange={(e) => handleLabelChange(board.id, e.target.value)}
              placeholder="Label (ex: Board seco A-high)"
              className="h-6 text-xs bg-transparent border-none text-gray-300 placeholder:text-gray-600 p-0 focus-visible:ring-0 max-w-[250px]"
              maxLength={60}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-gray-500 hover:text-red-400"
              onClick={() => handleRemoveBoard(board.id)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>

          <div className="flex items-center gap-1 relative">
            {/* Flop */}
            <div className="flex items-center gap-1">
              {board.flop.map((card, i) => (
                <div key={i} className="relative">
                  <CardSlot
                    card={card}
                    onClick={() =>
                      setPickerState({ boardId: board.id, slotType: 'flop', slotIndex: i })
                    }
                  />
                  {pickerState &&
                    pickerState.boardId === board.id &&
                    pickerState.slotType === 'flop' &&
                    'slotIndex' in pickerState &&
                    pickerState.slotIndex === i && (
                      <CardPicker
                        onSelect={handleCardSelect}
                        onClear={handleCardClear}
                        onClose={() => setPickerState(null)}
                        usedCards={getUsedCards(board.id)}
                      />
                    )}
                </div>
              ))}
            </div>

            <div className="w-px h-8 bg-gray-600 mx-1" />

            {/* Turn */}
            <div className="relative">
              <CardSlot
                card={board.turn}
                onClick={() =>
                  setPickerState({ boardId: board.id, slotType: 'turn' })
                }
              />
              {pickerState &&
                pickerState.boardId === board.id &&
                pickerState.slotType === 'turn' && (
                  <CardPicker
                    onSelect={handleCardSelect}
                    onClear={handleCardClear}
                    onClose={() => setPickerState(null)}
                    usedCards={getUsedCards(board.id)}
                  />
                )}
            </div>

            <div className="w-px h-8 bg-gray-600 mx-1" />

            {/* River */}
            <div className="relative">
              <CardSlot
                card={board.river}
                onClick={() =>
                  setPickerState({ boardId: board.id, slotType: 'river' })
                }
              />
              {pickerState &&
                pickerState.boardId === board.id &&
                pickerState.slotType === 'river' && (
                  <CardPicker
                    onSelect={handleCardSelect}
                    onClear={handleCardClear}
                    onClose={() => setPickerState(null)}
                    usedCards={getUsedCards(board.id)}
                  />
                )}
            </div>

            {/* Street labels */}
            <div className="flex items-center gap-1 ml-2">
              <span className="text-[10px] text-gray-500">Flop | Turn | River</span>
            </div>
          </div>
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        className="text-gray-400 border-gray-700 hover:text-white hover:border-gray-500 bg-transparent"
        onClick={handleAddBoard}
      >
        <Plus className="h-3 w-3 mr-1" />
        Adicionar Board
      </Button>
    </div>
  );
}

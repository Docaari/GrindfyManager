import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Plus } from 'lucide-react';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const;

const COLORS: Record<string, { bg: string; label: string }> = {
  green: { bg: '#16a34a', label: 'Raise/Bet' },
  blue: { bg: '#3b82f6', label: 'Call' },
  red: { bg: '#ef4444', label: 'Fold' },
  yellow: { bg: '#f59e0b', label: 'Mixed' },
};

const COLOR_CYCLE = ['', 'green', 'blue', 'red', 'yellow'] as const;

export interface RangeData {
  id: string;
  label: string;
  grid: Record<string, string>; // e.g. { "AKs": "green", "AA": "blue" }
}

function createEmptyRange(id: string): RangeData {
  return { id, label: '', grid: {} };
}

function getHandLabel(row: number, col: number): string {
  if (row === col) {
    return `${RANKS[row]}${RANKS[col]}`;
  } else if (col > row) {
    // Upper triangle = suited
    return `${RANKS[row]}${RANKS[col]}s`;
  } else {
    // Lower triangle = offsuit
    return `${RANKS[col]}${RANKS[row]}o`;
  }
}

interface SingleRangeGridProps {
  range: RangeData;
  onChange: (range: RangeData) => void;
  onRemove: () => void;
}

function SingleRangeGrid({ range, onChange, onRemove }: SingleRangeGridProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragColor, setDragColor] = useState<string>('');

  const handleCellClick = useCallback(
    (hand: string) => {
      const current = range.grid[hand] || '';
      const currentIndex = COLOR_CYCLE.indexOf(current as typeof COLOR_CYCLE[number]);
      const nextIndex = (currentIndex + 1) % COLOR_CYCLE.length;
      const nextColor = COLOR_CYCLE[nextIndex];

      const newGrid = { ...range.grid };
      if (nextColor === '') {
        delete newGrid[hand];
      } else {
        newGrid[hand] = nextColor;
      }
      onChange({ ...range, grid: newGrid });
    },
    [range, onChange]
  );

  const handleMouseDown = useCallback(
    (hand: string) => {
      const current = range.grid[hand] || '';
      const currentIndex = COLOR_CYCLE.indexOf(current as typeof COLOR_CYCLE[number]);
      const nextIndex = (currentIndex + 1) % COLOR_CYCLE.length;
      const nextColor = COLOR_CYCLE[nextIndex];

      setIsDragging(true);
      setDragColor(nextColor);

      const newGrid = { ...range.grid };
      if (nextColor === '') {
        delete newGrid[hand];
      } else {
        newGrid[hand] = nextColor;
      }
      onChange({ ...range, grid: newGrid });
    },
    [range, onChange]
  );

  const handleMouseEnter = useCallback(
    (hand: string) => {
      if (!isDragging) return;
      const newGrid = { ...range.grid };
      if (dragColor === '') {
        delete newGrid[hand];
      } else {
        newGrid[hand] = dragColor;
      }
      onChange({ ...range, grid: newGrid });
    },
    [isDragging, dragColor, range, onChange]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleClear = () => {
    onChange({ ...range, grid: {} });
  };

  const totalCells = 169;
  const filledCells = Object.keys(range.grid).length;
  const percentage = totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0;

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <Input
          value={range.label}
          onChange={(e) => onChange({ ...range, label: e.target.value })}
          placeholder="Label (ex: BTN Open Range)"
          className="h-6 text-xs bg-transparent border-none text-gray-300 placeholder:text-gray-600 p-0 focus-visible:ring-0 max-w-[250px]"
          maxLength={60}
        />
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">{percentage}%</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-gray-500 hover:text-yellow-400"
            onClick={handleClear}
            title="Limpar range"
          >
            <X className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-gray-500 hover:text-red-400"
            onClick={onRemove}
            title="Remover range"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div
        className="select-none"
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(13, 1fr)` }}>
          {RANKS.map((_, row) =>
            RANKS.map((_, col) => {
              const hand = getHandLabel(row, col);
              const color = range.grid[hand];
              const bgColor = color ? COLORS[color]?.bg : undefined;
              const isPair = row === col;
              const isSuited = col > row;

              return (
                <button
                  key={hand}
                  type="button"
                  className={`aspect-square text-[9px] font-medium rounded-[2px] flex items-center justify-center transition-colors select-none ${
                    bgColor
                      ? 'text-white'
                      : isPair
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      : isSuited
                      ? 'bg-gray-750 text-gray-400 hover:bg-gray-600'
                      : 'bg-gray-800 text-gray-500 hover:bg-gray-600'
                  }`}
                  style={bgColor ? { backgroundColor: bgColor + 'cc' } : undefined}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleMouseDown(hand);
                  }}
                  onMouseEnter={() => handleMouseEnter(hand)}
                  onClick={(e) => {
                    // Only fire click if not dragging
                    if (!isDragging) {
                      e.preventDefault();
                    }
                  }}
                >
                  {hand}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-2">
        {Object.entries(COLORS).map(([key, value]) => (
          <div key={key} className="flex items-center gap-1">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: value.bg }}
            />
            <span className="text-[10px] text-gray-400">{value.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface RangeGridProps {
  ranges: RangeData[];
  onChange: (ranges: RangeData[]) => void;
}

export function RangeGrid({ ranges, onChange }: RangeGridProps) {
  const handleAddRange = () => {
    const id = `range-${Date.now()}`;
    onChange([...ranges, createEmptyRange(id)]);
  };

  const handleRemoveRange = (id: string) => {
    onChange(ranges.filter((r) => r.id !== id));
  };

  const handleUpdateRange = (updated: RangeData) => {
    onChange(ranges.map((r) => (r.id === updated.id ? updated : r)));
  };

  if (ranges.length === 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="text-gray-400 border-gray-700 hover:text-white hover:border-gray-500 bg-transparent"
        onClick={handleAddRange}
      >
        <Plus className="h-3 w-3 mr-1" />
        Adicionar Range
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      {ranges.map((range) => (
        <SingleRangeGrid
          key={range.id}
          range={range}
          onChange={handleUpdateRange}
          onRemove={() => handleRemoveRange(range.id)}
        />
      ))}

      <Button
        variant="outline"
        size="sm"
        className="text-gray-400 border-gray-700 hover:text-white hover:border-gray-500 bg-transparent"
        onClick={handleAddRange}
      >
        <Plus className="h-3 w-3 mr-1" />
        Adicionar Range
      </Button>
    </div>
  );
}

import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Plus } from 'lucide-react';

export interface HandNoteData {
  id: string;
  text: string;
}

// Regex to match poker hand notations: AA, AKs, AKo, AKs+, 22+, A5s-A2s etc.
const HAND_PATTERN =
  /\b([AKQJT2-9]{2}[so]?(?:\+|(?:-[AKQJT2-9]{2}[so]?))?)(?=\s|$|,|;|\.|!|\))/g;

function classifyHand(hand: string): 'pair' | 'suited' | 'offsuit' | 'unknown' {
  const base = hand.replace(/[+\-].*/, '');
  if (base.length === 2 && base[0] === base[1]) return 'pair';
  if (base.endsWith('s')) return 'suited';
  if (base.endsWith('o')) return 'offsuit';
  if (base.length === 2) return 'unknown';
  return 'unknown';
}

function formatHandText(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  const regex = new RegExp(HAND_PATTERN.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(
        <span key={`text-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>
      );
    }

    const hand = match[1];
    const type = classifyHand(hand);
    let className = 'px-1 py-0.5 rounded text-xs font-mono font-bold ';

    switch (type) {
      case 'pair':
        className += 'bg-purple-500/20 text-purple-300';
        break;
      case 'suited':
        className += 'bg-green-500/20 text-green-300';
        break;
      case 'offsuit':
        className += 'bg-blue-500/20 text-blue-300';
        break;
      default:
        className += 'bg-gray-500/20 text-gray-300';
    }

    parts.push(
      <span key={`hand-${match.index}`} className={className}>
        {hand}
      </span>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(
      <span key={`text-${lastIndex}`}>{text.slice(lastIndex)}</span>
    );
  }

  return parts.length > 0 ? parts : [<span key="empty">{text}</span>];
}

interface HandNotationProps {
  handNotes: HandNoteData[];
  onChange: (handNotes: HandNoteData[]) => void;
}

export function HandNotation({ handNotes, onChange }: HandNotationProps) {
  const handleAdd = () => {
    const id = `hand-${Date.now()}`;
    onChange([...handNotes, { id, text: '' }]);
  };

  const handleRemove = (id: string) => {
    onChange(handNotes.filter((n) => n.id !== id));
  };

  const handleUpdate = (id: string, text: string) => {
    onChange(handNotes.map((n) => (n.id === id ? { ...n, text } : n)));
  };

  if (handNotes.length === 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="text-gray-400 border-gray-700 hover:text-white hover:border-gray-500 bg-transparent"
        onClick={handleAdd}
      >
        <Plus className="h-3 w-3 mr-1" />
        Notas de Mao
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      {handNotes.map((note) => (
        <div
          key={note.id}
          className="bg-gray-800/50 border border-gray-700 rounded-lg p-3"
        >
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-2">
              <Input
                value={note.text}
                onChange={(e) => handleUpdate(note.id, e.target.value)}
                placeholder="Ex: Open ATs+ AJo+ 88+ do BTN, 3bet QQ+ AKs"
                className="h-7 text-xs bg-gray-900 border-gray-700 text-white placeholder:text-gray-600"
              />
              {note.text && (
                <div className="text-sm text-gray-300 leading-relaxed">
                  {formatHandText(note.text)}
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-gray-500 hover:text-red-400 flex-shrink-0 mt-1"
              onClick={() => handleRemove(note.id)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        className="text-gray-400 border-gray-700 hover:text-white hover:border-gray-500 bg-transparent"
        onClick={handleAdd}
      >
        <Plus className="h-3 w-3 mr-1" />
        Notas de Mao
      </Button>

      {/* Legend */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="px-1 py-0.5 rounded text-[10px] font-mono bg-purple-500/20 text-purple-300">
            AA
          </span>
          <span className="text-[10px] text-gray-500">Pair</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="px-1 py-0.5 rounded text-[10px] font-mono bg-green-500/20 text-green-300">
            AKs
          </span>
          <span className="text-[10px] text-gray-500">Suited</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="px-1 py-0.5 rounded text-[10px] font-mono bg-blue-500/20 text-blue-300">
            AKo
          </span>
          <span className="text-[10px] text-gray-500">Offsuit</span>
        </div>
      </div>
    </div>
  );
}

import React from 'react';
import { Badge } from '@/components/ui/badge';

interface SelectionCounterProps {
  count: number;
  total: number;
  className?: string;
}

export default function SelectionCounter({ count, total, className = '' }: SelectionCounterProps) {
  if (count === 0) return null;

  return (
    <Badge variant="secondary" className={`${className} bg-blue-500 text-white`}>
      {count} de {total} selecionados
    </Badge>
  );
}
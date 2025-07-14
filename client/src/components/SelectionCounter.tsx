import React from 'react';
import { Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface SelectionCounterProps {
  selectedCount: number;
  totalCount: number;
  onClearSelection: () => void;
  className?: string;
}

export const SelectionCounter: React.FC<SelectionCounterProps> = ({
  selectedCount,
  totalCount,
  onClearSelection,
  className = ''
}) => {
  if (selectedCount === 0) {
    return (
      <div className={`flex items-center space-x-2 text-gray-500 ${className}`}>
        <Users className="h-4 w-4" />
        <span>Nenhum usuário selecionado</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      <div className="flex items-center space-x-2 text-green-600">
        <Users className="h-4 w-4" />
        <span className="font-medium">
          {selectedCount} de {totalCount} usuários selecionados
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onClearSelection}
        className="flex items-center space-x-1 hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition-colors"
      >
        <X className="h-3 w-3" />
        <span>Limpar</span>
      </Button>
    </div>
  );
};

export default SelectionCounter;
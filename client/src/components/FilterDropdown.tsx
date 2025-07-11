import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Filter, X } from "lucide-react";
import FilterPopup, { FilterState } from "@/components/FilterPopup";

interface FilterDropdownProps {
  onApplyFilters: (filters: FilterState) => void;
  initialFilters: FilterState;
}

export default function FilterDropdown({ onApplyFilters, initialFilters }: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const countActiveFilters = () => {
    let count = 0;
    
    // Período personalizado
    if (initialFilters.period === 'custom') count++;
    
    // Range filters (só conta se não estiver no valor padrão)
    if (initialFilters.abiRange[0] !== 0 || initialFilters.abiRange[1] !== 500) count++;
    if (initialFilters.preparationRange[0] !== 0 || initialFilters.preparationRange[1] !== 10) count++;
    if (initialFilters.interferenceRange[0] !== 0 || initialFilters.interferenceRange[1] !== 10) count++;
    if (initialFilters.energyRange[0] !== 0 || initialFilters.energyRange[1] !== 10) count++;
    if (initialFilters.confidenceRange[0] !== 0 || initialFilters.confidenceRange[1] !== 10) count++;
    if (initialFilters.emotionalRange[0] !== 0 || initialFilters.emotionalRange[1] !== 10) count++;
    if (initialFilters.focusRange[0] !== 0 || initialFilters.focusRange[1] !== 10) count++;
    
    // Multi-select filters
    if (initialFilters.tournamentTypes.length > 0) count++;
    if (initialFilters.tournamentSpeeds.length > 0) count++;
    
    return count;
  };

  return (
    <div className="w-full">
      {/* Botão de filtros */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="outline"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 border-gray-600 text-gray-300 hover:bg-gray-800 hover:border-gray-500"
        >
          <Filter className="w-4 h-4" />
          Filtros
          {countActiveFilters() > 0 && (
            <span className="ml-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
              {countActiveFilters()}
            </span>
          )}
        </Button>
        
        {isOpen && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Componente de filtros integrado */}
      <FilterPopup
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onApplyFilters={onApplyFilters}
        initialFilters={initialFilters}
      />
    </div>
  );
}
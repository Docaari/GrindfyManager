// Componente simplificado para evitar erros de sintaxe
export interface FilterState {
  period: 'all' | '7d' | '14d' | '30d' | '90d' | '1y' | 'custom';
  customStartDate: string;
  customEndDate: string;
  // Range filters
  abiRange: [number, number];
  preparationRange: [number, number];
  interferenceRange: [number, number];
  energyRange: [number, number];
  confidenceRange: [number, number];
  emotionalRange: [number, number];
  focusRange: [number, number];
  // Multi-select filters
  tournamentTypes: string[];
  tournamentSpeeds: string[];
}

interface FilterPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyFilters: (filters: FilterState) => void;
  initialFilters: FilterState;
}

export default function FilterPopup({ isOpen, onClose, onApplyFilters, initialFilters }: FilterPopupProps) {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-900 p-6 rounded-lg max-w-md w-full">
        <h2 className="text-white text-xl font-bold mb-4">Filtros</h2>
        <p className="text-gray-300 mb-4">Componente simplificado temporário</p>
        <button
          onClick={onClose}
          className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
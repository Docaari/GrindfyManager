import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar, Filter, X } from 'lucide-react';

interface FilterPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyFilters: (filters: FilterState) => void;
  initialFilters: FilterState;
}

export interface FilterState {
  period: 'all' | '7d' | '14d' | '30d' | '90d' | '1y' | 'custom';
  customStartDate: string;
  customEndDate: string;
}

const FilterPopup: React.FC<FilterPopupProps> = ({
  isOpen,
  onClose,
  onApplyFilters,
  initialFilters
}) => {
  const [filters, setFilters] = useState<FilterState>(initialFilters);

  const periodOptions = [
    { value: '7d', label: '7 dias', description: 'Última semana' },
    { value: '14d', label: '14 dias', description: 'Últimas 2 semanas' },
    { value: '30d', label: '30 dias', description: 'Último mês' },
    { value: '90d', label: '90 dias', description: 'Últimos 3 meses' },
    { value: '1y', label: '1 ano', description: 'Último ano' },
    { value: 'custom', label: 'Personalizado', description: 'Escolha as datas' }
  ];

  const handlePeriodChange = (period: string) => {
    setFilters(prev => ({
      ...prev,
      period: period as FilterState['period']
    }));
  };

  const handleCustomDateChange = (field: 'customStartDate' | 'customEndDate', value: string) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleApplyFilters = () => {
    onApplyFilters(filters);
    onClose();
  };

  const handleResetFilters = () => {
    const resetFilters: FilterState = {
      period: 'all',
      customStartDate: '',
      customEndDate: ''
    };
    setFilters(resetFilters);
    onApplyFilters(resetFilters);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="filter-popup-modal max-w-lg bg-gray-900 border-gray-700">
        <DialogHeader className="pb-4">
          <DialogTitle className="text-white text-lg font-semibold flex items-center gap-2">
            <Filter className="w-5 h-5 text-red-400" />
            Filtros Avançados
          </DialogTitle>
          <DialogDescription className="text-gray-300 text-sm">
            Personalize a visualização dos dados do seu histórico de sessões
          </DialogDescription>
        </DialogHeader>

        <div className="filter-content space-y-6">
          {/* Seção de Período */}
          <div className="period-section">
            <h3 className="text-white font-medium mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-red-400" />
              Período
            </h3>
            
            <div className="period-buttons grid grid-cols-2 gap-2 mb-4">
              {periodOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={filters.period === option.value ? "default" : "outline"}
                  onClick={() => handlePeriodChange(option.value)}
                  className={`period-btn ${
                    filters.period === option.value 
                      ? 'bg-red-600 hover:bg-red-700 text-white border-red-600' 
                      : 'border-gray-600 text-gray-300 hover:bg-gray-800 hover:border-gray-500'
                  } font-medium py-2.5 px-3 rounded-lg transition-all duration-200`}
                >
                  <div className="text-center">
                    <div className="text-sm font-semibold">{option.label}</div>
                    <div className="text-xs opacity-75">{option.description}</div>
                  </div>
                </Button>
              ))}
            </div>

            {/* Campos de Data Personalizada */}
            {filters.period === 'custom' && (
              <div className="custom-date-section bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-3">
                <h4 className="text-white font-medium text-sm">Datas Personalizadas</h4>
                <div className="date-inputs grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-gray-300 text-xs mb-1 block">Data Inicial</label>
                    <Input
                      type="date"
                      value={filters.customStartDate}
                      onChange={(e) => handleCustomDateChange('customStartDate', e.target.value)}
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-gray-300 text-xs mb-1 block">Data Final</label>
                    <Input
                      type="date"
                      value={filters.customEndDate}
                      onChange={(e) => handleCustomDateChange('customEndDate', e.target.value)}
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer com Botões */}
        <div className="filter-footer flex justify-between items-center pt-4 border-t border-gray-700">
          <Button
            variant="ghost"
            onClick={handleResetFilters}
            className="text-gray-400 hover:text-gray-300 hover:bg-gray-800/50"
          >
            Limpar Filtros
          </Button>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleApplyFilters}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Aplicar Filtros
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FilterPopup;
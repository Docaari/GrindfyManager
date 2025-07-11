import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar, Filter, X, DollarSign, Target, Zap, Brain, Heart, Volume2, Users, RotateCcw, Check } from 'lucide-react';
import RangeSlider from './RangeSlider';
import MultiSelect from './MultiSelect';

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

const FilterPopup: React.FC<FilterPopupProps> = ({
  isOpen,
  onClose,
  onApplyFilters,
  initialFilters
}) => {
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragStartExpanded, setDragStartExpanded] = useState(false);

  // Hook para detectar tecla ESC
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        if (isExpanded) {
          setIsExpanded(false);
        } else {
          onClose();
        }
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose, isExpanded]);

  // Sincronizar com filtros iniciais quando o componente abre
  useEffect(() => {
    if (isOpen) {
      setFilters(initialFilters);
      setIsExpanded(true); // Começar expandido quando abre
    } else {
      setIsExpanded(false); // Fechar quando o componente fecha
    }
  }, [isOpen, initialFilters]);

  // Funções para controle de drag
  const handleDragStart = (clientY: number) => {
    setIsDragging(true);
    setDragStartY(clientY);
    setDragStartExpanded(isExpanded);
  };

  const handleDragMove = (clientY: number) => {
    if (!isDragging) return;
    
    const deltaY = dragStartY - clientY;
    const shouldExpand = deltaY > 50;
    const shouldCollapse = deltaY < -50;
    
    if (dragStartExpanded) {
      if (shouldCollapse) {
        setIsExpanded(false);
      }
    } else {
      if (shouldExpand) {
        setIsExpanded(true);
      }
    }
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setDragStartY(0);
    setDragStartExpanded(false);
    setDragDistance(0);
  };

  // Event handlers para mouse
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleDragStart(e.clientY);
  };

  const handleMouseMove = (e: MouseEvent) => {
    handleDragMoveWithDistance(e.clientY);
  };

  const handleMouseUp = () => {
    handleDragEnd();
  };

  // Event handlers para touch
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    handleDragStart(e.touches[0].clientY);
  };

  const handleTouchMove = (e: TouchEvent) => {
    handleDragMoveWithDistance(e.touches[0].clientY);
  };

  const handleTouchEnd = () => {
    handleDragEnd();
  };

  // Adicionar/remover event listeners globais
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleTouchEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [isDragging, dragStartY, dragStartExpanded]);

  // Handle click simples para toggle
  const handleHandleClick = (e: React.MouseEvent) => {
    // Só toggle se não houve drag significativo (menos de 10px)
    if (dragDistance < 10) {
      setIsExpanded(!isExpanded);
    }
  };

  // Prevenir drag se for apenas um click
  const [dragDistance, setDragDistance] = useState(0);
  
  const handleDragMoveWithDistance = (clientY: number) => {
    if (!isDragging) return;
    
    const deltaY = Math.abs(dragStartY - clientY);
    setDragDistance(deltaY);
    
    // Só considera drag se moveu mais de 10px
    if (deltaY > 10) {
      const moveDirection = dragStartY - clientY;
      const shouldExpand = moveDirection > 50;
      const shouldCollapse = moveDirection < -50;
      
      if (dragStartExpanded) {
        if (shouldCollapse) {
          setIsExpanded(false);
        }
      } else {
        if (shouldExpand) {
          setIsExpanded(true);
        }
      }
    }
  };

  const periodOptions = [
    { value: '7d', label: '7 dias', description: 'Última semana' },
    { value: '14d', label: '14 dias', description: 'Últimas 2 semanas' },
    { value: '30d', label: '30 dias', description: 'Último mês' },
    { value: '90d', label: '90 dias', description: 'Últimos 3 meses' },
    { value: '1y', label: '1 ano', description: 'Último ano' },
    { value: 'custom', label: 'Personalizado', description: 'Escolha as datas' }
  ];

  const tournamentTypeOptions = [
    { value: 'vanilla', label: 'Vanilla', color: 'blue' },
    { value: 'pko', label: 'PKO', color: 'orange' },
    { value: 'mystery', label: 'Mystery', color: 'pink' }
  ];

  const tournamentSpeedOptions = [
    { value: 'normal', label: 'Normal', color: 'green' },
    { value: 'turbo', label: 'Turbo', color: 'yellow' },
    { value: 'hyper', label: 'Hyper', color: 'red' }
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

  // Função para contar filtros ativos
  const countActiveFilters = () => {
    let count = 0;
    
    // Período personalizado
    if (filters.period === 'custom' && (filters.customStartDate || filters.customEndDate)) {
      count++;
    }
    
    // Filtros de range (verifica se não estão nos valores padrão)
    if (filters.abiRange[0] !== 0 || filters.abiRange[1] !== 500) count++;
    if (filters.preparationRange[0] !== 0 || filters.preparationRange[1] !== 10) count++;
    if (filters.interferenceRange[0] !== 0 || filters.interferenceRange[1] !== 10) count++;
    if (filters.energyRange[0] !== 0 || filters.energyRange[1] !== 10) count++;
    if (filters.confidenceRange[0] !== 0 || filters.confidenceRange[1] !== 10) count++;
    if (filters.emotionalRange[0] !== 0 || filters.emotionalRange[1] !== 10) count++;
    if (filters.focusRange[0] !== 0 || filters.focusRange[1] !== 10) count++;
    
    // Filtros multi-select
    if (filters.tournamentTypes.length > 0) count++;
    if (filters.tournamentSpeeds.length > 0) count++;
    
    return count;
  };

  // Função para reset completo
  const handleResetAllFilters = () => {
    const resetFilters: FilterState = {
      period: 'all',
      customStartDate: '',
      customEndDate: '',
      // Range filters
      abiRange: [0, 500],
      preparationRange: [0, 10],
      interferenceRange: [0, 10],
      energyRange: [0, 10],
      confidenceRange: [0, 10],
      emotionalRange: [0, 10],
      focusRange: [0, 10],
      // Multi-select filters
      tournamentTypes: [],
      tournamentSpeeds: []
    };
    setFilters(resetFilters);
  };

  // Handlers para os filtros do grid 3x3
  const handleRangeChange = (key: keyof FilterState, value: [number, number]) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleMultiSelectChange = (key: keyof FilterState, value: string[]) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleResetFilters = () => {
    const resetFilters: FilterState = {
      period: 'all',
      customStartDate: '',
      customEndDate: '',
      // Range filters
      abiRange: [0, 500],
      preparationRange: [0, 10],
      interferenceRange: [0, 10],
      energyRange: [0, 10],
      confidenceRange: [0, 10],
      emotionalRange: [0, 10],
      focusRange: [0, 10],
      // Multi-select filters
      tournamentTypes: [],
      tournamentSpeeds: []
    };
    setFilters(resetFilters);
    onApplyFilters(resetFilters);
    onClose();
  };

  return (
    <div className="w-full">
      {/* Componente integrado na página - sem backdrop */}
      <div 
        className={`w-full bg-gray-900 border border-gray-700 rounded-lg shadow-lg transition-all duration-300 ease-in-out ${
          isOpen ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
        }`}
        style={{ 
          transformOrigin: 'top',
          transition: 'max-height 0.3s ease-out, opacity 0.3s ease-out'
        }}
      >
        {/* Header do componente integrado */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center text-gray-300">
            <Filter className="w-4 h-4 mr-2" />
            <span className="text-sm font-medium">Filtros Avançados</span>
            {countActiveFilters() > 0 && (
              <span className="ml-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {countActiveFilters()}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo do componente integrado */}
        <div className="p-6 max-h-[700px] overflow-y-auto">
          <div className="mb-4">
            <p className="text-gray-300 text-sm">
              Personalize a visualização dos dados do seu histórico de sessões
            </p>
          </div>

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

          {/* Grid 3x3 de Filtros */}
          <div className="filters-grid-section">
            <h3 className="text-white font-medium mb-4 flex items-center gap-2">
              <Filter className="w-4 h-4 text-red-400" />
              Filtros Avançados
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Linha 1: ABI - Tipo - Velocidade */}
              <RangeSlider
                label="ABI"
                icon={<DollarSign className="w-4 h-4 text-green-400" />}
                min={0}
                max={500}
                step={1}
                value={filters.abiRange}
                onChange={(value) => handleRangeChange('abiRange', value)}
                unit="$"
                color="green"
              />

              <MultiSelect
                label="Tipo"
                icon={<Target className="w-4 h-4 text-blue-400" />}
                options={tournamentTypeOptions}
                value={filters.tournamentTypes}
                onChange={(value) => handleMultiSelectChange('tournamentTypes', value)}
                color="blue"
              />

              <MultiSelect
                label="Velocidade"
                icon={<Zap className="w-4 h-4 text-yellow-400" />}
                options={tournamentSpeedOptions}
                value={filters.tournamentSpeeds}
                onChange={(value) => handleMultiSelectChange('tournamentSpeeds', value)}
                color="yellow"
              />

              {/* Linha 2: Preparação - Interferências - Foco */}
              <RangeSlider
                label="Preparação"
                icon={<Brain className="w-4 h-4 text-blue-400" />}
                min={0}
                max={10}
                step={0.1}
                value={filters.preparationRange}
                onChange={(value) => handleRangeChange('preparationRange', value)}
                unit="/10"
                color="blue"
              />

              <RangeSlider
                label="Interferências"
                icon={<Volume2 className="w-4 h-4 text-gray-400" />}
                min={0}
                max={10}
                step={0.1}
                value={filters.interferenceRange}
                onChange={(value) => handleRangeChange('interferenceRange', value)}
                unit="/10"
                color="red"
              />

              <RangeSlider
                label="Foco"
                icon={<Target className="w-4 h-4 text-green-400" />}
                min={0}
                max={10}
                step={0.1}
                value={filters.focusRange}
                onChange={(value) => handleRangeChange('focusRange', value)}
                unit="/10"
                color="green"
              />

              {/* Linha 3: Energia - Confiança - Emocional */}
              <RangeSlider
                label="Energia"
                icon={<Zap className="w-4 h-4 text-red-400" />}
                min={0}
                max={10}
                step={0.1}
                value={filters.energyRange}
                onChange={(value) => handleRangeChange('energyRange', value)}
                unit="/10"
                color="red"
              />

              <RangeSlider
                label="Confiança"
                icon={<Heart className="w-4 h-4 text-yellow-400" />}
                min={0}
                max={10}
                step={0.1}
                value={filters.confidenceRange}
                onChange={(value) => handleRangeChange('confidenceRange', value)}
                unit="/10"
                color="yellow"
              />

              <RangeSlider
                label="Emocional"
                icon={<Heart className="w-4 h-4 text-purple-400" />}
                min={0}
                max={10}
                step={0.1}
                value={filters.emotionalRange}
                onChange={(value) => handleRangeChange('emotionalRange', value)}
                unit="/10"
                color="purple"
              />
            </div>
          </div>
        </div>

        {/* Footer com Botões */}
        <div className="filter-footer flex justify-between items-center pt-4 border-t border-gray-700">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              onClick={handleResetAllFilters}
              className="text-gray-400 hover:text-gray-300 hover:bg-gray-800/50 flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Limpar Tudo
            </Button>
            
            {/* Badge de Filtros Ativos */}
            {countActiveFilters() > 0 && (
              <div className="flex items-center gap-2 px-3 py-1 bg-red-500/20 border border-red-500/30 rounded-full">
                <Filter className="w-3 h-3 text-red-400" />
                <span className="text-xs text-red-300 font-medium">
                  {countActiveFilters()} filtro{countActiveFilters() > 1 ? 's' : ''} ativo{countActiveFilters() > 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
          
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
              className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Aplicar Filtros
            </Button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default FilterPopup;
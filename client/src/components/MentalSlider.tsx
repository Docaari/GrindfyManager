import { useState, forwardRef } from 'react';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';

interface MentalSliderProps {
  label: string;
  icon?: string;
  value: number;
  onChange: (value: number) => void;
  tabIndex?: number;
  onEnter?: () => void;
}

export const MentalSlider = forwardRef<HTMLDivElement, MentalSliderProps>(({
  label,
  icon,
  value,
  onChange,
  tabIndex,
  onEnter
}, ref) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Determinar cores baseadas no valor
  const getColorClasses = (val: number) => {
    if (val >= 1 && val <= 3) {
      return {
        track: 'bg-red-500',
        thumb: 'border-red-500',
        gradient: 'from-red-600 to-red-400',
        text: 'text-red-400'
      };
    } else if (val >= 4 && val <= 6) {
      return {
        track: 'bg-yellow-500',
        thumb: 'border-yellow-500',
        gradient: 'from-yellow-600 to-yellow-400',
        text: 'text-yellow-400'
      };
    } else if (val >= 7 && val <= 10) {
      return {
        track: 'bg-green-500',
        thumb: 'border-green-500',
        gradient: 'from-green-600 to-green-400',
        text: 'text-green-400'
      };
    }
    return {
      track: 'bg-gray-500',
      thumb: 'border-gray-500',
      gradient: 'from-gray-600 to-gray-400',
      text: 'text-gray-400'
    };
  };

  const colors = getColorClasses(value);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && onEnter) {
      e.preventDefault();
      onEnter();
    }
    // Controle por setas
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(Math.max(1, value - 1));
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(Math.min(10, value + 1));
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    // Prevenir scroll da página quando mouse está sobre o slider
    e.preventDefault();
    
    // Determinar direção do scroll
    const delta = e.deltaY;
    
    if (delta < 0) {
      // Scroll para cima - aumentar valor
      onChange(Math.min(10, value + 1));
    } else if (delta > 0) {
      // Scroll para baixo - diminuir valor
      onChange(Math.max(1, value - 1));
    }
  };

  return (
    <div className="field-group">
      <Label className="field-label text-gray-300 font-medium flex items-center justify-between mb-3">
        <span className="flex items-center gap-2">
          {icon && <span className="text-sm">{icon}</span>}
          {label}
        </span>
        <span className={`text-lg font-bold ${colors.text} transition-colors duration-300`}>
          {value}/10
        </span>
      </Label>
      
      <div
        ref={ref}
        className="relative"
        tabIndex={tabIndex}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onKeyDown={handleKeyDown}
        onWheel={handleWheel}
      >
        <Slider
          value={[value]}
          onValueChange={(vals) => onChange(vals[0])}
          max={10}
          min={0}
          step={1}
          className={`
            w-full transition-all duration-300
            ${isFocused || isHovered ? 'ring-2 ring-[#16a249]/20' : ''}
          `}
        />
        
        
        
        {/* Barra de progresso colorida */}
        <div className="mt-3 h-2 bg-gray-800 rounded-full overflow-hidden">
          <div 
            className={`h-full bg-gradient-to-r ${colors.gradient} transition-all duration-500 ease-out`}
            style={{ width: `${(value / 10) * 100}%` }}
          />
        </div>
        
        {/* Feedback textual */}
        <div className="mt-2 text-center">
          <span className={`text-xs ${colors.text} font-medium transition-colors duration-300`}>
            {value === 0 && 'Não avaliado'}
            {value >= 1 && value <= 2 && 'Muito baixo'}
            {value >= 3 && value <= 3 && 'Baixo'}
            {value >= 4 && value <= 5 && 'Médio'}
            {value >= 6 && value <= 6 && 'Bom'}
            {value >= 7 && value <= 8 && 'Muito bom'}
            {value >= 9 && value <= 10 && 'Excelente'}
          </span>
        </div>
      </div>
    </div>
  );
});

MentalSlider.displayName = 'MentalSlider';
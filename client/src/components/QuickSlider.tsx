import { forwardRef, useState } from 'react';
import { Target, Zap, Heart, Users, Volume2 } from 'lucide-react';

interface QuickSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  icon?: 'target' | 'zap' | 'heart' | 'users' | 'volume';
  className?: string;
}

const iconMap = {
  target: Target,
  zap: Zap,
  heart: Heart,
  users: Users,
  volume: Volume2
};

export const QuickSlider = forwardRef<HTMLDivElement, QuickSliderProps>(({
  label,
  value,
  onChange,
  icon = 'target',
  className = ''
}, ref) => {
  const [isHovered, setIsHovered] = useState(false);
  const IconComponent = iconMap[icon];

  // Determinar cor baseada no valor
  const getColorClasses = () => {
    if (value >= 1 && value <= 3) {
      return {
        gradient: 'from-red-500 to-red-600',
        text: 'text-red-400',
        bg: 'bg-red-500/20',
        border: 'border-red-500'
      };
    } else if (value >= 4 && value <= 6) {
      return {
        gradient: 'from-yellow-500 to-yellow-600',
        text: 'text-yellow-400',
        bg: 'bg-yellow-500/20',
        border: 'border-yellow-500'
      };
    } else if (value >= 7 && value <= 10) {
      return {
        gradient: 'from-green-500 to-green-600',
        text: 'text-green-400',
        bg: 'bg-green-500/20',
        border: 'border-green-500'
      };
    }
    return {
      gradient: 'from-gray-500 to-gray-600',
      text: 'text-gray-400',
      bg: 'bg-gray-500/20',
      border: 'border-gray-500'
    };
  };

  const colors = getColorClasses();

  return (
    <div ref={ref} className={`quick-slider-container ${className}`}>
      {/* Header com Label e Ícone */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <IconComponent className={`w-4 h-4 ${colors.text}`} />
          <label className="text-sm font-medium text-gray-300">
            {label}
          </label>
        </div>
        
        {/* Display do Valor com Gradiente */}
        <div className={`px-3 py-1 rounded-full ${colors.bg} ${colors.border} border`}>
          <span className={`text-sm font-bold ${colors.text}`}>
            {value}/10
          </span>
        </div>
      </div>

      {/* Slider Container */}
      <div 
        className="relative"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Slider Track */}
        <div className="slider-track bg-gray-800 rounded-full overflow-hidden">
          <div 
            className={`slider-fill bg-gradient-to-r ${colors.gradient} transition-all duration-300`}
            style={{ width: `${(value / 10) * 100}%` }}
          />
        </div>

        {/* Slider Input */}
        <input
          type="range"
          min="0"
          max="10"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`slider-input ${isHovered ? 'hovered' : ''}`}
        />

        {/* Marcadores de Posição */}
        <div className="slider-markers">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
            <div
              key={num}
              className={`marker ${value >= num ? 'active' : ''}`}
              style={{ left: `${(num / 10) * 100}%` }}
            />
          ))}
        </div>
      </div>

      {/* Feedback Textual */}
      <div className="mt-2 text-center">
        <span className={`text-xs font-medium ${colors.text} transition-colors duration-300`}>
          {value === 0 && 'Não avaliado'}
          {value >= 1 && value <= 2 && 'Muito baixo'}
          {value === 3 && 'Baixo'}
          {value >= 4 && value <= 5 && 'Médio'}
          {value === 6 && 'Bom'}
          {value >= 7 && value <= 8 && 'Muito bom'}
          {value >= 9 && value <= 10 && 'Excelente'}
        </span>
      </div>
    </div>
  );
});

QuickSlider.displayName = 'QuickSlider';
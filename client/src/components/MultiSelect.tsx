import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Check, X } from "lucide-react";

interface MultiSelectOption {
  value: string;
  label: string;
  color?: string;
}

interface MultiSelectProps {
  label: string;
  icon: React.ReactNode;
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
  color?: string;
}

export default function MultiSelect({
  label,
  icon,
  options,
  value,
  onChange,
  className = "",
  color = "red"
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleOptionToggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter(v => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  const handleSelectAll = () => {
    if (value.length === options.length) {
      onChange([]);
    } else {
      onChange(options.map(opt => opt.value));
    }
  };

  const getColorClasses = () => {
    const colorMap = {
      red: "border-red-500 hover:border-red-400",
      green: "border-green-500 hover:border-green-400",
      blue: "border-blue-500 hover:border-blue-400",
      yellow: "border-yellow-500 hover:border-yellow-400",
      purple: "border-purple-500 hover:border-purple-400",
      orange: "border-orange-500 hover:border-orange-400",
    };
    return colorMap[color as keyof typeof colorMap] || colorMap.red;
  };

  const getOptionColor = (option: MultiSelectOption) => {
    if (option.color) {
      const colorMap = {
        blue: "bg-blue-500/20 border-blue-500/50 text-blue-300",
        orange: "bg-orange-500/20 border-orange-500/50 text-orange-300",
        pink: "bg-pink-500/20 border-pink-500/50 text-pink-300",
        green: "bg-green-500/20 border-green-500/50 text-green-300",
        yellow: "bg-yellow-500/20 border-yellow-500/50 text-yellow-300",
        red: "bg-red-500/20 border-red-500/50 text-red-300",
      };
      return colorMap[option.color as keyof typeof colorMap] || "bg-gray-500/20 border-gray-500/50 text-gray-300";
    }
    return "bg-gray-500/20 border-gray-500/50 text-gray-300";
  };

  return (
    <div className={`multi-select-container ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="filter-icon">{icon}</div>
        <Label className="text-white text-sm font-medium">{label}</Label>
      </div>
      
      <div className="multi-select-content">
        {/* Selected Values Display */}
        {value.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {value.map(val => {
              const option = options.find(opt => opt.value === val);
              return (
                <Badge
                  key={val}
                  variant="secondary"
                  className={`${getOptionColor(option!)} text-xs px-2 py-1`}
                >
                  {option?.label}
                  <button
                    onClick={() => handleOptionToggle(val)}
                    className="ml-1 hover:bg-white/20 rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}

        {/* Toggle Button */}
        <Button
          variant="outline"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full bg-gray-800 border-gray-600 text-white hover:bg-gray-700 text-sm h-8 ${getColorClasses()}`}
        >
          {value.length === 0 ? "Selecionar..." : `${value.length} selecionado(s)`}
        </Button>

        {/* Options List */}
        {isOpen && (
          <div className="mt-2 bg-gray-800 border border-gray-600 rounded-lg p-2 max-h-40 overflow-y-auto">
            {/* Select All Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
              className="w-full justify-start text-xs text-gray-300 hover:bg-gray-700 mb-1"
            >
              <Check className="w-3 h-3 mr-2" />
              {value.length === options.length ? "Desmarcar Todos" : "Selecionar Todos"}
            </Button>

            {/* Individual Options */}
            {options.map(option => (
              <Button
                key={option.value}
                variant="ghost"
                size="sm"
                onClick={() => handleOptionToggle(option.value)}
                className={`w-full justify-start text-xs hover:bg-gray-700 ${
                  value.includes(option.value) ? getOptionColor(option) : "text-gray-300"
                }`}
              >
                <Check className={`w-3 h-3 mr-2 ${value.includes(option.value) ? "opacity-100" : "opacity-0"}`} />
                {option.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
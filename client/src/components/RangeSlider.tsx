import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RangeSliderProps {
  label: string;
  icon: React.ReactNode;
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  unit?: string;
  className?: string;
  color?: string;
}

export default function RangeSlider({
  label,
  icon,
  min,
  max,
  step = 1,
  value,
  onChange,
  unit = "",
  className = "",
  color = "red"
}: RangeSliderProps) {
  const [minValue, maxValue] = value;

  const handleSliderChange = (newValue: number[]) => {
    onChange([newValue[0], newValue[1]]);
  };

  const handleMinInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMin = parseFloat(e.target.value) || min;
    if (newMin <= maxValue) {
      onChange([newMin, maxValue]);
    }
  };

  const handleMaxInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMax = parseFloat(e.target.value) || max;
    if (newMax >= minValue) {
      onChange([minValue, newMax]);
    }
  };

  const getColorClasses = () => {
    const colorMap = {
      red: "border-red-500 focus:ring-red-500",
      green: "border-green-500 focus:ring-green-500",
      blue: "border-blue-500 focus:ring-blue-500",
      yellow: "border-yellow-500 focus:ring-yellow-500",
      purple: "border-purple-500 focus:ring-purple-500",
      orange: "border-orange-500 focus:ring-orange-500",
    };
    return colorMap[color as keyof typeof colorMap] || colorMap.red;
  };

  return (
    <div className={`range-slider-container ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="filter-icon">{icon}</div>
        <Label className="text-white text-sm font-medium">{label}</Label>
      </div>
      
      <div className="range-slider-content">
        {/* Slider */}
        <div className="mb-4">
          <Slider
            value={[minValue, maxValue]}
            onValueChange={handleSliderChange}
            min={min}
            max={max}
            step={step}
            className="range-slider"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{min}{unit}</span>
            <span>{max}{unit}</span>
          </div>
        </div>

        {/* Input Fields */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Label className="text-xs text-gray-400 mb-1 block">Min</Label>
            <Input
              type="number"
              value={minValue}
              onChange={handleMinInputChange}
              min={min}
              max={max}
              step={step}
              className={`bg-gray-800 border-gray-600 text-white text-sm h-8 ${getColorClasses()}`}
            />
          </div>
          <div className="text-gray-400 text-sm mt-4">—</div>
          <div className="flex-1">
            <Label className="text-xs text-gray-400 mb-1 block">Max</Label>
            <Input
              type="number"
              value={maxValue}
              onChange={handleMaxInputChange}
              min={min}
              max={max}
              step={step}
              className={`bg-gray-800 border-gray-600 text-white text-sm h-8 ${getColorClasses()}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
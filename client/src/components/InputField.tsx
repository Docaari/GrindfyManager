import { useState, forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle, AlertCircle } from 'lucide-react';

interface InputFieldProps {
  label: string;
  icon?: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: 'text' | 'number' | 'date';
  placeholder?: string;
  required?: boolean;
  validation?: (value: string) => boolean;
  errorMessage?: string;
  step?: string;
  tabIndex?: number;
  onEnter?: () => void;
}

export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(({
  label,
  icon,
  value,
  onChange,
  type = 'text',
  placeholder,
  required = false,
  validation,
  errorMessage,
  step,
  tabIndex,
  onEnter
}, ref) => {
  const [isFocused, setIsFocused] = useState(false);
  const [hasBeenTouched, setHasBeenTouched] = useState(false);

  const stringValue = String(value);
  const isEmpty = stringValue === '' || stringValue === '0';
  const isValid = validation ? validation(stringValue) : !required || !isEmpty;
  const showError = hasBeenTouched && !isValid;
  const showSuccess = hasBeenTouched && isValid && !isEmpty;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && onEnter) {
      e.preventDefault();
      onEnter();
    }
  };

  return (
    <div className="field-group">
      <Label className="field-label text-gray-300 font-medium flex items-center gap-2">
        {icon && <span className="text-sm">{icon}</span>}
        {label}
        {required && <span className="text-red-400">*</span>}
      </Label>
      
      <div className="relative">
        <Input
          ref={ref}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            setHasBeenTouched(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          step={step}
          tabIndex={tabIndex}
          className={`
            bg-gray-900 border-gray-600 text-white transition-all duration-300
            ${isFocused ? 'border-[#16a249] ring-2 ring-[#16a249]/20' : ''}
            ${showError ? 'border-red-500 ring-2 ring-red-500/20' : ''}
            ${showSuccess ? 'border-green-500 ring-2 ring-green-500/20' : ''}
            pr-10
          `}
        />
        
        {/* Status Icon */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {showSuccess && (
            <CheckCircle className="w-4 h-4 text-green-500 animate-in fade-in duration-200" />
          )}
          {showError && (
            <AlertCircle className="w-4 h-4 text-red-500 animate-in fade-in duration-200" />
          )}
        </div>
      </div>
      
      {/* Error Message */}
      {showError && errorMessage && (
        <p className="text-xs text-red-400 mt-1 animate-in slide-in-from-top-1 duration-200">
          {errorMessage}
        </p>
      )}
      
      {/* Success Message */}
      {showSuccess && type === 'date' && (
        <p className="text-xs text-green-400 mt-1 animate-in slide-in-from-top-1 duration-200">
          Data válida selecionada
        </p>
      )}
    </div>
  );
});

InputField.displayName = 'InputField';
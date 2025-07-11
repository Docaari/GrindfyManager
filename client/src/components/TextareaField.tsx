import { useState, forwardRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CheckCircle, AlertCircle } from 'lucide-react';

interface TextareaFieldProps {
  label: string;
  icon?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  validation?: (value: string) => boolean;
  errorMessage?: string;
  maxLength?: number;
  rows?: number;
  tabIndex?: number;
  onEnter?: () => void;
}

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(({
  label,
  icon,
  value,
  onChange,
  placeholder,
  required = false,
  validation,
  errorMessage,
  maxLength = 500,
  rows = 4,
  tabIndex,
  onEnter
}, ref) => {
  const [isFocused, setIsFocused] = useState(false);
  const [hasBeenTouched, setHasBeenTouched] = useState(false);

  const isEmpty = value.trim() === '';
  const isValid = validation ? validation(value) : !required || !isEmpty;
  const showError = hasBeenTouched && !isValid;
  const showSuccess = hasBeenTouched && isValid && !isEmpty;
  const charCount = value.length;
  const isNearLimit = charCount >= maxLength * 0.8;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey && onEnter) {
      e.preventDefault();
      onEnter();
    }
  };

  return (
    <div className="field-group">
      <Label className="field-label text-gray-300 font-medium flex items-center justify-between mb-2">
        <span className="flex items-center gap-2">
          {icon && <span className="text-sm">{icon}</span>}
          {label}
          {required && <span className="text-red-400">*</span>}
        </span>
        <span className={`text-xs ${isNearLimit ? 'text-yellow-400' : 'text-gray-500'}`}>
          {charCount}/{maxLength}
        </span>
      </Label>
      
      <div className="relative">
        <Textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            setHasBeenTouched(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={rows}
          tabIndex={tabIndex}
          className={`
            bg-gray-900 border-gray-600 text-white transition-all duration-300 resize-none
            ${isFocused ? 'border-[#16a249] ring-2 ring-[#16a249]/20' : ''}
            ${showError ? 'border-red-500 ring-2 ring-red-500/20' : ''}
            ${showSuccess ? 'border-green-500 ring-2 ring-green-500/20' : ''}
            pr-10
          `}
        />
        
        {/* Status Icon */}
        <div className="absolute right-3 top-3">
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
      
      {/* Helper Text */}
      {!showError && (
        <p className="text-xs text-gray-400 mt-1">
          {required && isEmpty && 'Campo obrigatório'}
          {!isEmpty && 'Ctrl+Enter para próximo campo'}
        </p>
      )}
    </div>
  );
});

TextareaField.displayName = 'TextareaField';
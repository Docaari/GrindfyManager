import { useState, useEffect, useCallback } from 'react';

export interface RegisterSessionData {
  date: string;
  duration: string;
  volume: number;
  profit: number;
  abiMed: number;
  roi: number;
  fts: number;
  cravadas: number;
  energiaMedia: number;
  focoMedio: number;
  confiancaMedia: number;
  inteligenciaEmocionalMedia: number;
  interferenciasMedia: number;
  preparationNotes: string;
  dailyGoals: string;
  finalNotes: string;
  objectiveCompleted: boolean;
}

export interface ValidationErrors {
  date?: string;
  duration?: string;
  volume?: string;
  profit?: string;
  abiMed?: string;
  roi?: string;
  fts?: string;
  cravadas?: string;
  preparationNotes?: string;
  dailyGoals?: string;
  finalNotes?: string;
}

export interface ValidationState {
  errors: ValidationErrors;
  hasErrors: boolean;
  touchedFields: Set<string>;
  isValid: boolean;
}

export const useRegisterSessionValidation = (data: RegisterSessionData) => {
  const [validationState, setValidationState] = useState<ValidationState>({
    errors: {},
    hasErrors: false,
    touchedFields: new Set(),
    isValid: false
  });

  const validateField = useCallback((field: string, value: any): string | undefined => {
    switch (field) {
      case 'date':
        if (!value) return 'Data é obrigatória';
        const selectedDate = new Date(value);
        const today = new Date();
        today.setHours(23, 59, 59, 999); // End of today
        if (selectedDate > today) return 'Data não pode ser futura';
        break;

      case 'duration':
        if (!value || value.trim() === '') return 'Duração é obrigatória';
        break;

      case 'volume':
        const vol = Number(value);
        if (isNaN(vol) || vol <= 0) return 'Volume deve ser maior que 0';
        if (vol > 1000) return 'Volume não pode ser maior que 1000';
        break;

      case 'profit':
        if (isNaN(Number(value))) return 'Lucro deve ser um número válido';
        break;

      case 'abiMed':
        const abi = Number(value);
        if (isNaN(abi) || abi <= 0) return 'ABI deve ser maior que 0';
        break;

      case 'fts':
        const fts = Number(value);
        const volume = Number(data.volume);
        if (isNaN(fts) || fts < 0) return 'Final Tables deve ser 0 ou maior';
        if (fts > volume) return 'Final Tables não pode ser maior que Volume';
        break;

      case 'cravadas':
        const cravadas = Number(value);
        const finalTables = Number(data.fts);
        if (isNaN(cravadas) || cravadas < 0) return 'Cravadas deve ser 0 ou maior';
        if (cravadas > finalTables) return 'Cravadas não pode ser maior que Final Tables';
        break;

      case 'dailyGoals':
        if (!value || value.trim() === '') return 'Objetivos são obrigatórios';
        break;

      case 'preparationNotes':
        if (value && value.length > 300) return 'Máximo 300 caracteres';
        break;

      case 'finalNotes':
        if (value && value.length > 500) return 'Máximo 500 caracteres';
        break;

      default:
        return undefined;
    }
    return undefined;
  }, [data]);

  const validateAllFields = useCallback(() => {
    const errors: ValidationErrors = {};
    
    Object.keys(data).forEach(field => {
      const error = validateField(field, (data as any)[field]);
      if (error) {
        errors[field as keyof ValidationErrors] = error;
      }
    });

    return errors;
  }, [data, validateField]);

  const touchField = useCallback((field: string) => {
    setValidationState(prev => ({
      ...prev,
      touchedFields: new Set([...prev.touchedFields, field])
    }));
  }, []);

  const resetValidation = useCallback(() => {
    setValidationState({
      errors: {},
      hasErrors: false,
      touchedFields: new Set(),
      isValid: false
    });
  }, []);

  // Validação em tempo real
  useEffect(() => {
    const errors = validateAllFields();
    const hasErrors = Object.keys(errors).length > 0;
    const isValid = !hasErrors && 
      data.date && 
      data.duration && 
      data.volume > 0 && 
      data.abiMed > 0 && 
      data.dailyGoals;

    setValidationState(prev => ({
      ...prev,
      errors,
      hasErrors,
      isValid
    }));
  }, [data, validateAllFields]);

  // Cálculo automático de ROI
  const calculateROI = useCallback(() => {
    const profit = Number(data.profit) || 0;
    const investment = Number(data.abiMed) * Number(data.volume);
    
    if (investment === 0) return 0;
    return Math.round((profit / investment) * 100 * 100) / 100; // 2 casas decimais
  }, [data.profit, data.abiMed, data.volume]);

  return {
    validationState,
    validateField,
    touchField,
    resetValidation,
    calculateROI
  };
};
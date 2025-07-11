import { useState, useCallback, useEffect } from 'react';
import { useRegisterSessionValidation, RegisterSessionData } from './useRegisterSessionValidation';

export interface UseRegisterSessionFormProps {
  onSave: (data: RegisterSessionData) => void;
  onClose: () => void;
}

export const useRegisterSessionForm = ({ onSave, onClose }: UseRegisterSessionFormProps) => {
  const [formData, setFormData] = useState<RegisterSessionData>({
    date: '',
    duration: '',
    volume: 0,
    profit: 0,
    abiMed: 0,
    roi: 0,
    fts: 0,
    cravadas: 0,
    energiaMedia: 5,
    focoMedio: 5,
    confiancaMedia: 5,
    inteligenciaEmocionalMedia: 5,
    interferenciasMedia: 5,
    preparationNotes: '',
    dailyGoals: '',
    finalNotes: '',
    objectiveCompleted: false
  });

  const { validationState, validateField, touchField, resetValidation, calculateROI } = useRegisterSessionValidation(formData);

  // Cálculo automático de ROI
  useEffect(() => {
    const calculatedROI = calculateROI();
    if (calculatedROI !== formData.roi) {
      setFormData(prev => ({ ...prev, roi: calculatedROI }));
    }
  }, [formData.profit, formData.abiMed, formData.volume, calculateROI]);

  const updateField = useCallback((field: keyof RegisterSessionData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleFieldChange = useCallback((field: keyof RegisterSessionData, value: any) => {
    updateField(field, value);
    touchField(field);
  }, [updateField, touchField]);

  const resetForm = useCallback(() => {
    setFormData({
      date: '',
      duration: '',
      volume: 0,
      profit: 0,
      abiMed: 0,
      roi: 0,
      fts: 0,
      cravadas: 0,
      energiaMedia: 5,
      focoMedio: 5,
      confiancaMedia: 5,
      inteligenciaEmocionalMedia: 5,
      interferenciasMedia: 5,
      preparationNotes: '',
      dailyGoals: '',
      finalNotes: '',
      objectiveCompleted: false
    });
    resetValidation();
  }, [resetValidation]);

  const handleSave = useCallback(() => {
    if (validationState.isValid) {
      onSave(formData);
      resetForm();
    }
  }, [formData, validationState.isValid, onSave, resetForm]);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const getFieldError = useCallback((field: keyof RegisterSessionData) => {
    return validationState.touchedFields.has(field) ? validationState.errors[field as keyof typeof validationState.errors] : undefined;
  }, [validationState.touchedFields, validationState.errors]);

  const hasFieldError = useCallback((field: keyof RegisterSessionData) => {
    return validationState.touchedFields.has(field) && !!validationState.errors[field as keyof typeof validationState.errors];
  }, [validationState.touchedFields, validationState.errors]);

  const isFieldValid = useCallback((field: keyof RegisterSessionData) => {
    return validationState.touchedFields.has(field) && !validationState.errors[field as keyof typeof validationState.errors];
  }, [validationState.touchedFields, validationState.errors]);

  const handleSubmit = useCallback((onSubmit: (data: RegisterSessionData) => void) => {
    // Marcar todos os campos como tocados
    const allFields = ['date', 'duration', 'volume', 'profit', 'abiMed', 'roi', 'fts', 'cravadas', 'preparationNotes', 'dailyGoals', 'finalNotes'];
    allFields.forEach(field => touchField(field));
    
    // Verificar se o formulário é válido
    if (validationState.isValid) {
      onSubmit(formData);
    }
  }, [formData, validationState.isValid, touchField]);

  const resetMentalValues = useCallback(() => {
    setFormData(prev => ({
      ...prev,
      energiaMedia: 5,
      focoMedio: 5,
      confiancaMedia: 5,
      inteligenciaEmocionalMedia: 5,
      interferenciasMedia: 5
    }));
  }, []);

  return {
    formData,
    validationState,
    updateField,
    handleFieldChange,
    resetForm,
    handleSave,
    handleClose,
    getFieldError,
    hasFieldError,
    isFieldValid,
    touchField,
    handleSubmit,
    resetMentalValues,
    isValid: validationState.isValid,
    isSubmitting: false
  };
};
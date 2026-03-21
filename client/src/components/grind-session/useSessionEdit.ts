import { useState, useEffect, useMemo } from "react";
import { createSessionValidator } from "./helpers";
import { SessionHistoryData } from "./types";

// Hook for session edit state management
export const useSessionEdit = (initialSession: SessionHistoryData) => {
  const [editData, setEditData] = useState(initialSession);

  const updateField = (field: string, value: any) => {
    setEditData(prevData => ({
      ...prevData,
      [field]: value
    }));
  };

  useEffect(() => {
    setEditData(initialSession);
  }, [initialSession]);

  return { editData, updateField };
};

// Hook for visual feedback on fields
export const useVisualFeedback = () => {
  const [savedField, setSavedField] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const [isAnimating, setIsAnimating] = useState<Record<string, boolean>>({});

  const showFieldSaved = (fieldName: string) => {
    setSavedField(fieldName);
    setIsAnimating(prev => ({ ...prev, [fieldName]: true }));

    setTimeout(() => {
      setSavedField(null);
      setIsAnimating(prev => ({ ...prev, [fieldName]: false }));
    }, 2000);
  };

  const setFieldError = (fieldName: string, hasError: boolean) => {
    setFieldErrors(prev => ({ ...prev, [fieldName]: hasError }));
  };

  const getFieldClassName = (fieldName: string, baseClass: string) => {
    let className = baseClass;

    if (fieldErrors[fieldName]) {
      className += " field-error";
    } else if (savedField === fieldName) {
      className += " field-saved";
    } else {
      className += " field-normal";
    }

    return className;
  };

  const getSliderClassName = (fieldName: string, value: number, maxValue: number = 10) => {
    let className = "slider-container";

    if (value <= maxValue * 0.3) {
      className += " slider-low";
    } else if (value <= maxValue * 0.7) {
      className += " slider-medium";
    } else {
      className += " slider-high";
    }

    if (value === 1 || value === maxValue) {
      className += " extreme-value";
    }

    if (isAnimating[fieldName]) {
      className += " updating";
    }

    return className;
  };

  return {
    showFieldSaved,
    setFieldError,
    getFieldClassName,
    getSliderClassName,
    savedField,
    fieldErrors,
    isAnimating
  };
};

// Hook for auto-save and recovery
export const useAutoSave = (editData: any, sessionId: string) => {
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    const autoSaveKey = `edit-session-${sessionId}`;

    const interval = setInterval(() => {
      if (hasUnsavedChanges) {
        localStorage.setItem(autoSaveKey, JSON.stringify({
          data: editData,
          timestamp: new Date().toISOString()
        }));
        setLastSaved(new Date());
        setHasUnsavedChanges(false);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [editData, sessionId, hasUnsavedChanges]);

  useEffect(() => {
    setHasUnsavedChanges(true);
  }, [editData]);

  const clearAutoSave = () => {
    localStorage.removeItem(`edit-session-${sessionId}`);
    setHasUnsavedChanges(false);
    setLastSaved(new Date());
  };

  const recoverAutoSave = (): any | null => {
    const autoSaveKey = `edit-session-${sessionId}`;
    const saved = localStorage.getItem(autoSaveKey);

    if (saved) {
      try {
        const { data, timestamp } = JSON.parse(saved);
        const saveTime = new Date(timestamp);
        const now = new Date();

        if (now.getTime() - saveTime.getTime() < 2 * 60 * 60 * 1000) {
          return data;
        }
      } catch (error) {
      }
    }

    return null;
  };

  return {
    lastSaved,
    hasUnsavedChanges,
    clearAutoSave,
    recoverAutoSave
  };
};

// Hook for debounced validation
export const useDebouncedValidation = (editData: any, delay = 500) => {
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const debouncedValidate = useMemo(
    () => {
      let timeoutId: NodeJS.Timeout;
      return (data: any) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          const { errors } = createSessionValidator().validate(data);
          setValidationErrors(errors);
        }, delay);
      };
    },
    [delay]
  );

  useEffect(() => {
    debouncedValidate(editData);
  }, [editData, debouncedValidate]);

  return validationErrors;
};

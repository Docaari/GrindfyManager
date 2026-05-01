/**
 * Sprint Studies-Reform — RF-11 (D8): OnboardingWizard primeira vez
 *
 * Modal com 4 cards educativos para primeira visita do usuario.
 * Pula automatico se ja tem temas/snapshots/spots (D8).
 *
 * Lessons:
 *   #1 hooks first
 *  #11 sem auto-finish (default minimo) — botao Concluir explicito
 *  #12 estado persistente: step em localStorage para sobreviver re-mount
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';

const COMPLETED_KEY = 'grindfy:studies:onboarding_completed';
const STEP_KEY = 'grindfy:studies:onboarding_step';

interface OnboardingWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function readStep(): number {
  try {
    const raw = localStorage.getItem(STEP_KEY);
    if (!raw) return 1;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 1 && parsed <= 4 ? parsed : 1;
  } catch {
    return 1;
  }
}

function writeStep(step: number): void {
  try {
    localStorage.setItem(STEP_KEY, String(step));
  } catch {
    // ignore
  }
}

function setCompleted(): void {
  try {
    localStorage.setItem(COMPLETED_KEY, 'true');
    localStorage.removeItem(STEP_KEY);
  } catch {
    // ignore
  }
}

export function OnboardingWizard({ open, onOpenChange }: OnboardingWizardProps) {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<number>(readStep);

  // Hooks first — verifica se usuario ja tem dados (D8)
  const { data: themes = [] } = useQuery<any[]>({
    queryKey: ['/api/study-themes'],
    queryFn: async () => {
      const res = await fetch('/api/study-themes', { credentials: 'include' });
      if (!res.ok) return [];
      return await res.json();
    },
    enabled: open,
  });

  const { data: spots = [] } = useQuery<any[]>({
    queryKey: ['/api/starred-hands'],
    queryFn: async () => {
      const res = await fetch('/api/starred-hands', { credentials: 'include' });
      if (!res.ok) return [];
      return await res.json();
    },
    enabled: open,
  });

  const { data: snapshots = [] } = useQuery<any[]>({
    queryKey: ['/api/study-snapshots'],
    queryFn: async () => {
      const res = await fetch('/api/study-snapshots', { credentials: 'include' });
      if (!res.ok) return [];
      return await res.json();
    },
    enabled: open,
  });

  const hasData = useMemo(
    () => (themes?.length ?? 0) >= 1 || (spots?.length ?? 0) >= 1 || (snapshots?.length ?? 0) >= 1,
    [themes, spots, snapshots],
  );

  // Sync step <-> localStorage (lesson #12)
  useEffect(() => {
    writeStep(step);
  }, [step]);

  // D8: pula automatico se ja tem dados
  useEffect(() => {
    if (open && hasData) {
      setCompleted();
      onOpenChange(false);
    }
  }, [open, hasData, onOpenChange]);

  if (!open || hasData) return null;

  function next() {
    setStep((s) => Math.min(4, s + 1));
  }

  function prev() {
    setStep((s) => Math.max(1, s - 1));
  }

  function close() {
    setCompleted();
    onOpenChange(false);
  }

  return (
    <div
      data-testid="onboarding-wizard"
      role="dialog"
      aria-label="Tutorial Estudos"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-[90vw] max-w-xl">
        {/* Dots indicator */}
        <div className="flex items-center justify-center gap-2 pt-4">
          {[1, 2, 3, 4].map((n) => (
            <span
              key={n}
              data-testid={`onboarding-dot-${n}`}
              className={`w-2 h-2 rounded-full ${
                n === step ? 'bg-poker-accent' : 'bg-gray-600'
              }`}
            />
          ))}
        </div>

        {/* Card content */}
        <div className="p-8 min-h-[260px]">
          {step === 1 && (
            <div data-testid="onboarding-card-1" className="text-center">
              <h3 className="text-xl font-semibold text-white mb-3">Bem-vindo aos Estudos</h3>
              <p className="text-sm text-gray-400">
                Organize seu conhecimento de poker em 4 modulos: Temas, Stats, Spots e Coach.
              </p>
            </div>
          )}
          {step === 2 && (
            <div data-testid="onboarding-card-2" className="text-center">
              <h3 className="text-xl font-semibold text-white mb-3">Crie seu primeiro Tema</h3>
              <p className="text-sm text-gray-400">
                Comece criando "IP vs BB" — o tema mais comum entre profissionais.
              </p>
            </div>
          )}
          {step === 3 && (
            <div data-testid="onboarding-card-3" className="text-center">
              <h3 className="text-xl font-semibold text-white mb-3">Importe historicos</h3>
              <p className="text-sm text-gray-400 mb-4">
                Importe historicos com 50+ MTTs para detectar leaks automaticamente.
              </p>
              <button
                type="button"
                data-testid="onboarding-card-3-skip"
                onClick={next}
                className="text-sm text-gray-400 hover:text-white"
              >
                Pular
              </button>
            </div>
          )}
          {step === 4 && (
            <div data-testid="onboarding-card-4" className="text-center">
              <h3 className="text-xl font-semibold text-white mb-3">Configure o Coach</h3>
              <p className="text-sm text-gray-400 mb-6">
                Use o assistente AI para revisar spots e sugerir leaks.
              </p>
              <button
                type="button"
                data-testid="onboarding-finish"
                onClick={close}
                className="px-4 py-2 rounded bg-poker-accent text-black font-semibold"
              >
                Concluir
              </button>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between border-t border-gray-800 p-4">
          <button
            type="button"
            data-testid="onboarding-skip"
            onClick={close}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            Pular tudo
          </button>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button
                type="button"
                data-testid="onboarding-prev"
                onClick={prev}
                className="px-3 py-1.5 rounded border border-gray-700 text-sm text-gray-300 hover:bg-gray-800"
              >
                Anterior
              </button>
            )}
            {step < 4 && (
              <button
                type="button"
                data-testid="onboarding-next"
                onClick={next}
                className="px-3 py-1.5 rounded bg-poker-accent text-black text-sm font-semibold"
              >
                Proximo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default OnboardingWizard;

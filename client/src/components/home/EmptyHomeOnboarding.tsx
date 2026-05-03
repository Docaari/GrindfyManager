/**
 * RF-20 — EmptyHomeOnboarding (Sprint home-reform-1).
 *
 * Spec: Docs/specs/home-reform-1.md §RF-20, §3 D7
 * ADR-099 §2.3
 *
 * 4 passos checklist: Importar CSV / Configurar banca / Planejar grade / Iniciar sessao live.
 * Step "completed" baseado em quickStats. Botao "Pular onboarding" persiste em
 * localStorage:home:skipOnboarding=true.
 */

import React from 'react';
import { Link } from 'wouter';

interface OnboardingData {
  totalTournaments: number;
  totalSessions: number;
  walletsConfigured: boolean;
  gradeDays: number;
}

interface Props {
  data: OnboardingData;
}

interface StepProps {
  testId: string;
  label: string;
  description: string;
  href: string;
  ctaLabel: string;
  completed: boolean;
}

function Step(props: StepProps): JSX.Element {
  return (
    <div
      data-testid={props.testId}
      data-completed={props.completed ? 'true' : 'false'}
      className={`rounded-lg border p-4 transition-colors ${
        props.completed
          ? 'border-green-500/40 bg-green-500/10'
          : 'border-border bg-card'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${
            props.completed
              ? 'bg-green-500 text-white'
              : 'bg-muted text-muted-foreground border border-border'
          }`}
        >
          {props.completed ? 'OK' : '·'}
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">{props.label}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {props.description}
          </div>
          {!props.completed && (
            <Link href={props.href}>
              <a className="mt-2 inline-block text-sm text-primary hover:underline">
                {props.ctaLabel}
              </a>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EmptyHomeOnboarding({ data }: Props): JSX.Element {
  const handleSkip = () => {
    try {
      localStorage.setItem('home:skipOnboarding', 'true');
    } catch {
      // ignore
    }
    // Forca refresh local — em integracao real Home reagiria via getter.
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new Event('storage'));
      } catch {
        // ignore
      }
    }
  };

  return (
    <div
      data-testid="home-empty-onboarding"
      className="max-w-2xl mx-auto p-4"
    >
      <header className="mb-4">
        <h1 className="text-xl font-bold">Bem-vindo ao Grindfy</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Complete os 4 passos abaixo para destravar o cockpit completo.
        </p>
      </header>

      <div className="space-y-3">
        <Step
          testId="onboarding-step-import"
          label="Importar CSVs"
          description="Carregue seus historicos de torneios para popular o dashboard."
          href="/upload"
          ctaLabel="Ir para Import →"
          completed={data.totalTournaments > 0}
        />
        <Step
          testId="onboarding-step-banca"
          label="Configurar banca"
          description="Defina sua banca atual em multiplas moedas + regra de stop."
          href="/bankroll"
          ctaLabel="Configurar banca →"
          completed={data.walletsConfigured}
        />
        <Step
          testId="onboarding-step-grade"
          label="Planejar grade"
          description="Defina perfil A/B/C de torneios por dia da semana."
          href="/coach"
          ctaLabel="Configurar grade →"
          completed={data.gradeDays > 0}
        />
        <Step
          testId="onboarding-step-sessao"
          label="Iniciar sessao live"
          description="Track sua proxima sessao em tempo real."
          href="/grind-live"
          ctaLabel="Iniciar sessao →"
          completed={data.totalSessions > 0}
        />
      </div>

      <button
        data-testid="onboarding-skip-button"
        onClick={handleSkip}
        className="mt-4 text-xs text-muted-foreground hover:underline"
      >
        Pular onboarding (mostrar dashboard vazio)
      </button>
    </div>
  );
}

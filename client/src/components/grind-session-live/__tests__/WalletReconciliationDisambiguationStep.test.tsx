/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Spec: Docs/specs/session-end-reconciliation-v2.md
 *  - RF-13: Step de desambiguacao quando 2+ wallets do mesmo site
 *  - ADR-045: tie-break proporcional (default)
 *
 * Modulo NAO existe ainda — implementer cria:
 *   client/src/components/grind-session-live/WalletReconciliationDisambiguationStep.tsx
 *
 *   Props:
 *     {
 *       open: boolean;
 *       siteCandidates: Array<{
 *         site: string;
 *         wallets: Array<{ walletId: string; name: string; balance: number; nativeCurrency: string }>;
 *       }>;
 *       onChoice: (site: string, choice: 'single' | 'proportional' | 'custom', walletId?: string) => void;
 *       onContinueWithDefault: () => void;
 *     }
 *
 *   data-testid:
 *     reconcile-disambiguation-step
 *     reconcile-disambiguation-section-{site}
 *     reconcile-disambiguation-option-single-{walletId}
 *     reconcile-disambiguation-option-proportional-{site}
 *     reconcile-disambiguation-option-custom-{site}
 *     reconcile-disambiguation-continue
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Modulo NAO existe ainda — implementer cria.
import { WalletReconciliationDisambiguationStep } from '../WalletReconciliationDisambiguationStep';

const candidates2WalletsBlackChip = [
  {
    site: 'BlackChip',
    wallets: [
      { walletId: 'wA', name: 'BlackChip Main', balance: 700, nativeCurrency: 'USD' },
      { walletId: 'wB', name: 'BlackChip Reserve', balance: 300, nativeCurrency: 'USD' },
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WalletReconciliationDisambiguationStep — skip auto quando 1 wallet por site (RF-13)', () => {
  it('siteCandidates vazio -> step NAO renderiza', () => {
    const onChoice = vi.fn();
    const onContinue = vi.fn();
    const { container } = render(
      <WalletReconciliationDisambiguationStep
        open={true}
        siteCandidates={[]}
        onChoice={onChoice}
        onContinueWithDefault={onContinue}
      />,
    );
    expect(screen.queryByTestId('reconcile-disambiguation-step')).not.toBeInTheDocument();
  });
});

describe('WalletReconciliationDisambiguationStep — 2+ wallets/site renderiza opcoes (RF-13)', () => {
  it('renderiza section por site', () => {
    render(
      <WalletReconciliationDisambiguationStep
        open={true}
        siteCandidates={candidates2WalletsBlackChip}
        onChoice={vi.fn()}
        onContinueWithDefault={vi.fn()}
      />,
    );
    expect(screen.getByTestId('reconcile-disambiguation-section-BlackChip')).toBeInTheDocument();
  });

  it('renderiza 1 opcao "single" por wallet candidate', () => {
    render(
      <WalletReconciliationDisambiguationStep
        open={true}
        siteCandidates={candidates2WalletsBlackChip}
        onChoice={vi.fn()}
        onContinueWithDefault={vi.fn()}
      />,
    );
    expect(screen.getByTestId('reconcile-disambiguation-option-single-wA')).toBeInTheDocument();
    expect(screen.getByTestId('reconcile-disambiguation-option-single-wB')).toBeInTheDocument();
  });

  it('renderiza opcao "Distribuir proporcionalmente" (default ADR-045)', () => {
    render(
      <WalletReconciliationDisambiguationStep
        open={true}
        siteCandidates={candidates2WalletsBlackChip}
        onChoice={vi.fn()}
        onContinueWithDefault={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId('reconcile-disambiguation-option-proportional-BlackChip'),
    ).toBeInTheDocument();
  });

  it('renderiza opcao "Personalizado"', () => {
    render(
      <WalletReconciliationDisambiguationStep
        open={true}
        siteCandidates={candidates2WalletsBlackChip}
        onChoice={vi.fn()}
        onContinueWithDefault={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId('reconcile-disambiguation-option-custom-BlackChip'),
    ).toBeInTheDocument();
  });
});

describe('WalletReconciliationDisambiguationStep — onChoice callbacks (RF-13)', () => {
  it('click single wallet A -> onChoice("BlackChip", "single", "wA")', () => {
    const onChoice = vi.fn();
    render(
      <WalletReconciliationDisambiguationStep
        open={true}
        siteCandidates={candidates2WalletsBlackChip}
        onChoice={onChoice}
        onContinueWithDefault={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('reconcile-disambiguation-option-single-wA'));
    expect(onChoice).toHaveBeenCalledWith('BlackChip', 'single', 'wA');
  });

  it('click "Distribuir proporcionalmente" -> onChoice("BlackChip", "proportional")', () => {
    const onChoice = vi.fn();
    render(
      <WalletReconciliationDisambiguationStep
        open={true}
        siteCandidates={candidates2WalletsBlackChip}
        onChoice={onChoice}
        onContinueWithDefault={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('reconcile-disambiguation-option-proportional-BlackChip'));
    expect(onChoice).toHaveBeenCalledWith('BlackChip', 'proportional', undefined);
  });

  it('click "Personalizado" -> onChoice("BlackChip", "custom")', () => {
    const onChoice = vi.fn();
    render(
      <WalletReconciliationDisambiguationStep
        open={true}
        siteCandidates={candidates2WalletsBlackChip}
        onChoice={onChoice}
        onContinueWithDefault={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('reconcile-disambiguation-option-custom-BlackChip'));
    expect(onChoice).toHaveBeenCalledWith('BlackChip', 'custom', undefined);
  });
});

describe('WalletReconciliationDisambiguationStep — botao Continuar com default (RF-13)', () => {
  it('botao "Continuar com default" presente', () => {
    render(
      <WalletReconciliationDisambiguationStep
        open={true}
        siteCandidates={candidates2WalletsBlackChip}
        onChoice={vi.fn()}
        onContinueWithDefault={vi.fn()}
      />,
    );
    expect(screen.getByTestId('reconcile-disambiguation-continue')).toBeInTheDocument();
  });

  it('click "Continuar com default" -> chama onContinueWithDefault', () => {
    const onContinue = vi.fn();
    render(
      <WalletReconciliationDisambiguationStep
        open={true}
        siteCandidates={candidates2WalletsBlackChip}
        onChoice={vi.fn()}
        onContinueWithDefault={onContinue}
      />,
    );
    fireEvent.click(screen.getByTestId('reconcile-disambiguation-continue'));
    expect(onContinue).toHaveBeenCalled();
  });
});

describe('WalletReconciliationDisambiguationStep — multiplos sites ambiguos', () => {
  it('renderiza section por site quando ha 2 sites com 2+ wallets cada', () => {
    const candidates = [
      {
        site: 'BlackChip',
        wallets: [
          { walletId: 'wA', name: 'BlackChip Main', balance: 700, nativeCurrency: 'USD' },
          { walletId: 'wB', name: 'BlackChip Reserve', balance: 300, nativeCurrency: 'USD' },
        ],
      },
      {
        site: 'GGPoker',
        wallets: [
          { walletId: 'wG1', name: 'GG Main', balance: 500, nativeCurrency: 'USD' },
          { walletId: 'wG2', name: 'GG Pessoal', balance: 200, nativeCurrency: 'USD' },
        ],
      },
    ];
    render(
      <WalletReconciliationDisambiguationStep
        open={true}
        siteCandidates={candidates}
        onChoice={vi.fn()}
        onContinueWithDefault={vi.fn()}
      />,
    );

    expect(screen.getByTestId('reconcile-disambiguation-section-BlackChip')).toBeInTheDocument();
    expect(screen.getByTestId('reconcile-disambiguation-section-GGPoker')).toBeInTheDocument();
  });
});

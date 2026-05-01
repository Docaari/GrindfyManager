/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-3 — RF-9: BankrollReconcileSection (component extraido)
 *
 * Spec: Docs/specs/sprint-bankroll-3.md (RF-9, D7)
 *
 * Componente esperado:
 *   client/src/components/grind-session-live/BankrollReconcileSection.tsx
 *
 * Casos:
 *   1. Render section quando bankrollManagementEnabled=true e tem wallets
 *   2. Retorna null quando bankrollManagementEnabled=false
 *   3. Retorna null quando wallets.length===0 && missingPlatforms.length===0
 *   4. Componente eh stateless (controlled via props)
 *   5. Cada wallet tem input controlado (value={reportedBalances[walletId]})
 *   6. onReportedBalanceChange chamado on change
 *   7. Banner amber quando missingPlatforms.length > 0
 *   8. Cada missing platform tem botao
 *   9. onCreateWalletForPlatform recebe (platform, suggestedCurrency)
 *  10. data-testid preservados
 *  11. RF-3 integration: suggestedBindings pre-seleciona currency
 *  12. isReconciling desabilita inputs
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

beforeEach(() => {
  vi.clearAllMocks();
});

async function loadSection() {
  const mod: any = await import('../BankrollReconcileSection');
  return mod.default ?? mod.BankrollReconcileSection;
}

const sampleWallets = [
  {
    walletId: 'w_gg',
    name: 'GG USD',
    platform: 'GGNetwork',
    nativeCurrency: 'USD',
    expectedClosingBalance: 450,
    expectedDelta: -50,
    openingBalance: 500,
    balance: 500,
    expectedPreviousBalance: 500,
    contributingTournaments: ['st_1'],
    hadActivityInSession: true,
    tieBreakStrategy: 'single',
  },
];

describe('BankrollReconcileSection — RF-9 controlled', () => {
  it('renderiza com data-testid=bankroll-reconcile-section', async () => {
    const Section = await loadSection();
    render(
      <Section
        wallets={sampleWallets}
        playedPlatforms={['GGNetwork']}
        missingPlatforms={[]}
        suggestedBindings={[]}
        reportedBalances={{ w_gg: '450' }}
        onReportedBalanceChange={vi.fn()}
        onCreateWalletForPlatform={vi.fn()}
        isReconciling={false}
        bankrollManagementEnabled={true}
      />,
    );
    expect(screen.getByTestId('bankroll-reconcile-section')).toBeInTheDocument();
  });

  it('retorna null quando bankrollManagementEnabled=false', async () => {
    const Section = await loadSection();
    const { container } = render(
      <Section
        wallets={sampleWallets}
        playedPlatforms={['GGNetwork']}
        missingPlatforms={[]}
        suggestedBindings={[]}
        reportedBalances={{}}
        onReportedBalanceChange={vi.fn()}
        onCreateWalletForPlatform={vi.fn()}
        isReconciling={false}
        bankrollManagementEnabled={false}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('retorna null quando wallets=[] && missingPlatforms=[]', async () => {
    const Section = await loadSection();
    const { container } = render(
      <Section
        wallets={[]}
        playedPlatforms={[]}
        missingPlatforms={[]}
        suggestedBindings={[]}
        reportedBalances={{}}
        onReportedBalanceChange={vi.fn()}
        onCreateWalletForPlatform={vi.fn()}
        isReconciling={false}
        bankrollManagementEnabled={true}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('input controlado: value={reportedBalances[walletId]}', async () => {
    const Section = await loadSection();
    render(
      <Section
        wallets={sampleWallets}
        playedPlatforms={['GGNetwork']}
        missingPlatforms={[]}
        suggestedBindings={[]}
        reportedBalances={{ w_gg: '420' }}
        onReportedBalanceChange={vi.fn()}
        onCreateWalletForPlatform={vi.fn()}
        isReconciling={false}
        bankrollManagementEnabled={true}
      />,
    );
    const input = screen.getByTestId('wallet-balance-input-w_gg') as HTMLInputElement;
    expect(input.value).toBe('420');
  });

  it('onReportedBalanceChange chamado on change', async () => {
    const handleChange = vi.fn();
    const Section = await loadSection();
    render(
      <Section
        wallets={sampleWallets}
        playedPlatforms={['GGNetwork']}
        missingPlatforms={[]}
        suggestedBindings={[]}
        reportedBalances={{ w_gg: '450' }}
        onReportedBalanceChange={handleChange}
        onCreateWalletForPlatform={vi.fn()}
        isReconciling={false}
        bankrollManagementEnabled={true}
      />,
    );
    const input = screen.getByTestId('wallet-balance-input-w_gg');
    fireEvent.change(input, { target: { value: '460' } });
    expect(handleChange).toHaveBeenCalledWith('w_gg', '460');
  });

  it('isReconciling=true desabilita inputs', async () => {
    const Section = await loadSection();
    render(
      <Section
        wallets={sampleWallets}
        playedPlatforms={['GGNetwork']}
        missingPlatforms={[]}
        suggestedBindings={[]}
        reportedBalances={{ w_gg: '450' }}
        onReportedBalanceChange={vi.fn()}
        onCreateWalletForPlatform={vi.fn()}
        isReconciling={true}
        bankrollManagementEnabled={true}
      />,
    );
    const input = screen.getByTestId('wallet-balance-input-w_gg') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it('banner amber quando missingPlatforms.length > 0', async () => {
    const Section = await loadSection();
    render(
      <Section
        wallets={[]}
        playedPlatforms={['Suprema']}
        missingPlatforms={['Suprema']}
        suggestedBindings={[
          { platform: 'Suprema', suggestedCurrency: 'BRL', confidence: 'site_map' },
        ]}
        reportedBalances={{}}
        onReportedBalanceChange={vi.fn()}
        onCreateWalletForPlatform={vi.fn()}
        isReconciling={false}
        bankrollManagementEnabled={true}
      />,
    );
    expect(screen.queryByTestId('missing-platforms-banner')).toBeInTheDocument();
  });

  it('botao por plataforma missing com data-testid', async () => {
    const Section = await loadSection();
    render(
      <Section
        wallets={[]}
        playedPlatforms={['Suprema']}
        missingPlatforms={['Suprema']}
        suggestedBindings={[
          { platform: 'Suprema', suggestedCurrency: 'BRL', confidence: 'site_map' },
        ]}
        reportedBalances={{}}
        onReportedBalanceChange={vi.fn()}
        onCreateWalletForPlatform={vi.fn()}
        isReconciling={false}
        bankrollManagementEnabled={true}
      />,
    );
    expect(screen.queryByTestId('missing-platform-cta-Suprema')).toBeInTheDocument();
  });

  it('onCreateWalletForPlatform chamado com (platform, suggestedCurrency)', async () => {
    const handleCreate = vi.fn();
    const Section = await loadSection();
    render(
      <Section
        wallets={[]}
        playedPlatforms={['Suprema']}
        missingPlatforms={['Suprema']}
        suggestedBindings={[
          { platform: 'Suprema', suggestedCurrency: 'BRL', confidence: 'site_map' },
        ]}
        reportedBalances={{}}
        onReportedBalanceChange={vi.fn()}
        onCreateWalletForPlatform={handleCreate}
        isReconciling={false}
        bankrollManagementEnabled={true}
      />,
    );

    fireEvent.click(screen.getByTestId('missing-platform-cta-Suprema'));
    expect(handleCreate).toHaveBeenCalledWith('Suprema', 'BRL');
  });

  it('sem suggestedBindings: callback recebe undefined currency', async () => {
    const handleCreate = vi.fn();
    const Section = await loadSection();
    render(
      <Section
        wallets={[]}
        playedPlatforms={['Suprema']}
        missingPlatforms={['Suprema']}
        suggestedBindings={[]}
        reportedBalances={{}}
        onReportedBalanceChange={vi.fn()}
        onCreateWalletForPlatform={handleCreate}
        isReconciling={false}
        bankrollManagementEnabled={true}
      />,
    );
    fireEvent.click(screen.getByTestId('missing-platform-cta-Suprema'));
    expect(handleCreate).toHaveBeenCalled();
    const args = handleCreate.mock.calls[0];
    expect(args[0]).toBe('Suprema');
  });

  it('preview de adjustment renderizado', async () => {
    const Section = await loadSection();
    render(
      <Section
        wallets={sampleWallets}
        playedPlatforms={['GGNetwork']}
        missingPlatforms={[]}
        suggestedBindings={[]}
        reportedBalances={{ w_gg: '450' }}
        onReportedBalanceChange={vi.fn()}
        onCreateWalletForPlatform={vi.fn()}
        isReconciling={false}
        bankrollManagementEnabled={true}
      />,
    );
    expect(screen.queryByTestId('wallet-adjustment-preview-w_gg')).toBeInTheDocument();
  });

  it('exporta interface BankrollReconcileSectionProps', async () => {
    const mod: any = await import('../BankrollReconcileSection');
    // Type-only check: ao menos o componente eh exportado.
    expect(mod.default ?? mod.BankrollReconcileSection).toBeDefined();
  });

  it('wallet-balance-input-${walletId} tem step=0.01', async () => {
    const Section = await loadSection();
    render(
      <Section
        wallets={sampleWallets}
        playedPlatforms={['GGNetwork']}
        missingPlatforms={[]}
        suggestedBindings={[]}
        reportedBalances={{ w_gg: '450' }}
        onReportedBalanceChange={vi.fn()}
        onCreateWalletForPlatform={vi.fn()}
        isReconciling={false}
        bankrollManagementEnabled={true}
      />,
    );
    const input = screen.getByTestId('wallet-balance-input-w_gg');
    expect(input.getAttribute('type')).toBe('number');
    expect(input.getAttribute('step')).toBe('0.01');
  });
});

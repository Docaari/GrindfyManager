import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
// Modulo NAO EXISTE ainda (red phase).
import WizardBadges from '../../../client/src/components/tournament-form/WizardBadges';
import {
  TYPE_LABELS_PT_BR,
  MODIFIER_LABELS_PT_BR,
  TYPE_COLORS,
  MODIFIER_COLORS,
} from '../../../shared/tournamentTypes';

// =============================================================================
// Sprint 2 - RF-06 WizardBadges
//
// Header sempre visivel mostrando 1-3 badges em tempo real:
//   - Sempre 1 badge para o tipo primario
//   - +1 "Flight" se isFlight=true
//   - +1 "Live" se isLive=true
//
// data-testid:
//   - wizard-badge-type-{Vanilla|PKO|Mystery|Satellite}
//   - wizard-badge-mod-isFlight
//   - wizard-badge-mod-isLive
//
// RED PHASE.
// =============================================================================

describe('WizardBadges', () => {
  it('renderiza badge para tipo primario Vanilla', () => {
    render(<WizardBadges type="Vanilla" isFlight={false} isLive={false} />);
    expect(screen.getByTestId('wizard-badge-type-Vanilla')).toBeTruthy();
  });

  it('renderiza badge para tipo PKO com label PT-BR', () => {
    render(<WizardBadges type="PKO" isFlight={false} isLive={false} />);
    const badge = screen.getByTestId('wizard-badge-type-PKO');
    expect(badge.textContent).toContain(TYPE_LABELS_PT_BR.PKO);
  });

  it('renderiza label "Satélite" (PT-BR) para Satellite', () => {
    render(<WizardBadges type="Satellite" isFlight={false} isLive={false} />);
    const badge = screen.getByTestId('wizard-badge-type-Satellite');
    expect(badge.textContent).toContain('Satélite');
  });

  it('NAO renderiza badge Flight quando isFlight=false', () => {
    render(<WizardBadges type="Vanilla" isFlight={false} isLive={false} />);
    expect(screen.queryByTestId('wizard-badge-mod-isFlight')).toBeNull();
  });

  it('NAO renderiza badge Live quando isLive=false', () => {
    render(<WizardBadges type="Vanilla" isFlight={false} isLive={false} />);
    expect(screen.queryByTestId('wizard-badge-mod-isLive')).toBeNull();
  });

  it('renderiza badge Flight quando isFlight=true', () => {
    render(<WizardBadges type="Vanilla" isFlight={true} isLive={false} />);
    expect(screen.getByTestId('wizard-badge-mod-isFlight')).toBeTruthy();
  });

  it('renderiza badge Live quando isLive=true', () => {
    render(<WizardBadges type="Vanilla" isFlight={false} isLive={true} />);
    expect(screen.getByTestId('wizard-badge-mod-isLive')).toBeTruthy();
  });

  it('badge Flight tem o label PT-BR do SSoT', () => {
    render(<WizardBadges type="Vanilla" isFlight={true} isLive={false} />);
    const badge = screen.getByTestId('wizard-badge-mod-isFlight');
    expect(badge.textContent).toContain(MODIFIER_LABELS_PT_BR.isFlight);
  });

  it('badge Live tem o label PT-BR do SSoT', () => {
    render(<WizardBadges type="Vanilla" isFlight={false} isLive={true} />);
    const badge = screen.getByTestId('wizard-badge-mod-isLive');
    expect(badge.textContent).toContain(MODIFIER_LABELS_PT_BR.isLive);
  });

  it('renderiza 3 badges em combinacao PKO+Flight+Live', () => {
    render(<WizardBadges type="PKO" isFlight={true} isLive={true} />);
    expect(screen.getByTestId('wizard-badge-type-PKO')).toBeTruthy();
    expect(screen.getByTestId('wizard-badge-mod-isFlight')).toBeTruthy();
    expect(screen.getByTestId('wizard-badge-mod-isLive')).toBeTruthy();
  });

  it('badge tipo aplica classe `bg` do SSoT TYPE_COLORS', () => {
    render(<WizardBadges type="Satellite" isFlight={false} isLive={false} />);
    const badge = screen.getByTestId('wizard-badge-type-Satellite');
    const expectedBg = TYPE_COLORS.Satellite.bg.split(' ')[0]; // bg-amber-100
    expect(badge.outerHTML).toContain(expectedBg);
  });

  it('badge Flight aplica classe `bg` cyan do SSoT MODIFIER_COLORS', () => {
    render(<WizardBadges type="Vanilla" isFlight={true} isLive={false} />);
    const badge = screen.getByTestId('wizard-badge-mod-isFlight');
    const expectedBg = MODIFIER_COLORS.isFlight.bg.split(' ')[0]; // bg-cyan-100
    expect(badge.outerHTML).toContain(expectedBg);
  });

  it('badge Live aplica classe `bg` emerald do SSoT MODIFIER_COLORS', () => {
    render(<WizardBadges type="Vanilla" isFlight={false} isLive={true} />);
    const badge = screen.getByTestId('wizard-badge-mod-isLive');
    const expectedBg = MODIFIER_COLORS.isLive.bg.split(' ')[0]; // bg-emerald-100
    expect(badge.outerHTML).toContain(expectedBg);
  });

  it('atualiza badges em re-render (sem flicker - exige consistencia em rerender)', () => {
    const { rerender } = render(
      <WizardBadges type="Vanilla" isFlight={false} isLive={false} />,
    );
    expect(screen.queryByTestId('wizard-badge-mod-isFlight')).toBeNull();
    rerender(<WizardBadges type="Vanilla" isFlight={true} isLive={false} />);
    expect(screen.getByTestId('wizard-badge-mod-isFlight')).toBeTruthy();
  });
});

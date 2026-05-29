import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// =============================================================================
// Test-Writer (Modo TDD — Red Phase)
//
// Sprint: bankroll-toggle-audit-and-shot-removal (RF-02 + RF-03)
// Spec: Docs/specs/sprint-bankroll-toggle-audit-and-shot-removal.md
//
// Abordagem: SOURCE-AS-CONTRACT (precedente: tests/unit/infra/neon-driver-removed.test.ts).
// GrindSessionLive.tsx tem 3326 LoC + state global pesado; full RTL mount eh
// impraticavel (mocks de sessionTournaments/plannedTournaments/suprema custosos)
// — por isso os testes de integracao do componente foram deixados como it.todo
// na suite irma (tests/unit/bankroll/GrindSessionLive.test.tsx).
//
// Em vez de montar o componente, este arquivo le o SOURCE via fs.readFileSync e
// assert que os marcadores exclusivos do "Bankroll Shot Modal" NAO existem mais.
// RED PHASE: estes testes FALHAM hoje (o codigo ainda existe). Apos o implementer
// remover o shot modal (RF-02/RF-03), eles passam.
//
// Roda no projeto `server` (node) — `.test.ts` puro, sem jsdom.
// =============================================================================

const GRIND_SESSION_LIVE = path.resolve(
  __dirname,
  '../../../client/src/pages/GrindSessionLive.tsx',
);

function readSource(): string {
  return fs.readFileSync(GRIND_SESSION_LIVE, 'utf-8');
}

describe('Bankroll Shot Modal — removal (source-as-contract)', () => {
  it('o arquivo fonte GrindSessionLive.tsx existe e eh legivel', () => {
    expect(fs.existsSync(GRIND_SESSION_LIVE)).toBe(true);
    expect(readSource().length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // RF-02: state, handlers e JSX do modal removidos
  // ---------------------------------------------------------------------------
  describe('RF-02: state e handlers do shot modal removidos', () => {
    it('NAO contem o state `bankrollShotModalOpen`', () => {
      expect(readSource()).not.toContain('bankrollShotModalOpen');
    });

    it('NAO contem o handler `handleConfirmBankrollShot`', () => {
      expect(readSource()).not.toContain('handleConfirmBankrollShot');
    });

    it('NAO contem o handler `handleCancelBankrollShot`', () => {
      expect(readSource()).not.toContain('handleCancelBankrollShot');
    });
  });

  // ---------------------------------------------------------------------------
  // RF-02: JSX do modal (data-testid) removido
  // ---------------------------------------------------------------------------
  describe('RF-02: JSX/markers do shot modal removidos', () => {
    it('NAO contem data-testid="bankroll-shot-modal"', () => {
      expect(readSource()).not.toContain('bankroll-shot-modal');
    });

    it('NAO contem data-testid="bankroll-shot-cancel"', () => {
      expect(readSource()).not.toContain('bankroll-shot-cancel');
    });

    it('NAO contem data-testid="bankroll-shot-confirm"', () => {
      expect(readSource()).not.toContain('bankroll-shot-confirm');
    });
  });

  // ---------------------------------------------------------------------------
  // RF-03: flag de bloqueio removida do fluxo de adicao
  // ---------------------------------------------------------------------------
  describe('RF-03: flag de bloqueio `aboveBankrollRule` removida', () => {
    it('NAO contem `aboveBankrollRule` (a flag deixa de ser setada/enviada)', () => {
      expect(readSource()).not.toContain('aboveBankrollRule');
    });
  });
});

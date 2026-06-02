/**
 * Test-Writer (Modo TDD — Red Phase) — Sprint Fase D #5 (Stop-loss cold-commit)
 *
 * Spec: Docs/specs/sprint-fase-d-stop-loss-2026-06-02.md (RF-01, RF-02, RF-05)
 * ADR:  Docs/architecture/decisions/235-fase-d-stop-loss-cold-commit.md (D-6)
 *
 * Estende client/src/components/warmup/IntentionBlock.tsx (bloco 4) com o controle
 * de cold-commit do stop-loss. Elementos AINDA NÃO EXISTEM (red por testid ausente).
 *
 * data-testid estáveis (lesson #2):
 *   - cold-stop-suggest-bi   (seletor/botões 3/4/5 BI; some quando degrada — DEC-4)
 *   - cold-stop-input        (campo USD comitável)
 *   - cold-stop-commit       (botão "Comitar stop a frio")
 *   - cold-stop-concept      (texto conceitual desperation — RF-05)
 *
 * --- CONTRATO ESCOLHIDO PELO TEST-WRITER (documentado p/ implementer) ----------
 * IntentionBlock ganha props opcionais (back-compat — testes existentes não passam):
 *   - abiUsd?: number | null          // ABI já resolvido p/ USD pelo caller (lesson #6);
 *                                      // null/<=0/ausente -> esconde sugestão BI (DEC-4 degrade).
 *   - onCommitColdStop?: (payload: {
 *       committedUsd: number; basis: 'bi'|'manual'; nBI?: 3|4|5; abiUsdAtCommit?: number;
 *     }) => void                       // chamado ao clicar "Comitar stop a frio".
 * O componente monta `committedAt` no commit final do ritual (não testado aqui).
 * Implementer pode ajustar nomes desde que preserve os data-testid e a semântica:
 *   BI default 3, sugestão = nBI×abiUsd, editar input -> basis 'manual'.
 * -------------------------------------------------------------------------------
 *
 * Lessons: #14/#26 await import; #11 sugere não impõe (campo USD livre sempre presente).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const MOD = '@/components/warmup/IntentionBlock';

async function loadIntentionBlock() {
  const m = await import(MOD);
  return m.IntentionBlock as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('IntentionBlock cold-commit — sugestão BI (ABI disponível)', () => {
  it('com abiUsd=50: exibe controle de sugestão BI + campo USD + botão comitar', async () => {
    const IntentionBlock = await loadIntentionBlock();
    render(<IntentionBlock onSubmit={() => {}} abiUsd={50} />);
    expect(screen.getByTestId('cold-stop-suggest-bi')).toBeTruthy();
    expect(screen.getByTestId('cold-stop-input')).toBeTruthy();
    expect(screen.getByTestId('cold-stop-commit')).toBeTruthy();
  });

  it('default 3 BI × $50 -> sugestão $150 pré-preenche o campo USD', async () => {
    const IntentionBlock = await loadIntentionBlock();
    render(<IntentionBlock onSubmit={() => {}} abiUsd={50} />);
    const input = screen.getByTestId('cold-stop-input') as HTMLInputElement;
    // 3 (default) × 50 = 150
    expect(Number(input.value)).toBe(150);
  });

  it('exibe texto conceitual desperation (RF-05)', async () => {
    const IntentionBlock = await loadIntentionBlock();
    render(<IntentionBlock onSubmit={() => {}} abiUsd={50} />);
    expect(screen.getByTestId('cold-stop-concept')).toBeTruthy();
    expect(document.body.textContent).toMatch(/desespero|antídoto|antidoto/i);
  });

  it('comitar com sugestão BI -> onCommitColdStop com basis="bi", nBI=3, committedUsd=150', async () => {
    const IntentionBlock = await loadIntentionBlock();
    const onCommitColdStop = vi.fn();
    render(<IntentionBlock onSubmit={() => {}} abiUsd={50} onCommitColdStop={onCommitColdStop} />);
    fireEvent.click(screen.getByTestId('cold-stop-commit'));
    expect(onCommitColdStop).toHaveBeenCalledTimes(1);
    const payload = onCommitColdStop.mock.calls[0][0];
    expect(payload.basis).toBe('bi');
    expect(payload.nBI).toBe(3);
    expect(payload.committedUsd).toBe(150);
    expect(payload.abiUsdAtCommit).toBe(50);
  });

  it('sobrescrever o campo USD -> commit vira basis="manual" (sem nBI)', async () => {
    const IntentionBlock = await loadIntentionBlock();
    const onCommitColdStop = vi.fn();
    render(<IntentionBlock onSubmit={() => {}} abiUsd={50} onCommitColdStop={onCommitColdStop} />);
    fireEvent.change(screen.getByTestId('cold-stop-input'), { target: { value: '200' } });
    fireEvent.click(screen.getByTestId('cold-stop-commit'));
    const payload = onCommitColdStop.mock.calls[0][0];
    expect(payload.basis).toBe('manual');
    expect(payload.committedUsd).toBe(200);
  });
});

describe('IntentionBlock cold-commit — degrade (ABI ausente, DEC-4)', () => {
  it('sem abiUsd: esconde sugestão BI mas mantém campo USD livre + botão comitar', async () => {
    const IntentionBlock = await loadIntentionBlock();
    render(<IntentionBlock onSubmit={() => {}} />);
    expect(screen.queryByTestId('cold-stop-suggest-bi')).toBeNull();
    expect(screen.getByTestId('cold-stop-input')).toBeTruthy();
    expect(screen.getByTestId('cold-stop-commit')).toBeTruthy();
  });

  it('abiUsd=0 -> degrada (sem sugestão BI), campo USD presente', async () => {
    const IntentionBlock = await loadIntentionBlock();
    render(<IntentionBlock onSubmit={() => {}} abiUsd={0} />);
    expect(screen.queryByTestId('cold-stop-suggest-bi')).toBeNull();
    expect(screen.getByTestId('cold-stop-input')).toBeTruthy();
  });

  it('degrade + digitar USD livre + comitar -> basis="manual"', async () => {
    const IntentionBlock = await loadIntentionBlock();
    const onCommitColdStop = vi.fn();
    render(<IntentionBlock onSubmit={() => {}} onCommitColdStop={onCommitColdStop} />);
    fireEvent.change(screen.getByTestId('cold-stop-input'), { target: { value: '120' } });
    fireEvent.click(screen.getByTestId('cold-stop-commit'));
    const payload = onCommitColdStop.mock.calls[0][0];
    expect(payload.basis).toBe('manual');
    expect(payload.committedUsd).toBe(120);
  });

  it('comitar USD <= 0 -> NÃO chama onCommitColdStop (sugere não impõe valor inválido)', async () => {
    const IntentionBlock = await loadIntentionBlock();
    const onCommitColdStop = vi.fn();
    render(<IntentionBlock onSubmit={() => {}} onCommitColdStop={onCommitColdStop} />);
    fireEvent.change(screen.getByTestId('cold-stop-input'), { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('cold-stop-commit'));
    expect(onCommitColdStop).not.toHaveBeenCalled();
  });
});

describe('IntentionBlock — back-compat (testes existentes não regridem)', () => {
  it('botão "Proximo" (intention-submit) continua presente e habilitado', async () => {
    const IntentionBlock = await loadIntentionBlock();
    render(<IntentionBlock onSubmit={() => {}} />);
    const submit = screen.getByTestId('intention-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });
});

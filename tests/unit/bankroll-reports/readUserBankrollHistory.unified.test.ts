/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-Reports-Detail — RF-07 (Coach tool extension)
 * Spec: Docs/specs/sprint-bankroll-reports-detail.md (D12)
 * ADR-069
 *
 * Foco: tool `read_user_bankroll_history` retorna entries com discriminator
 * `type: 'session' | 'manual_report'` (back-compat: clients antigos tratam
 * default como 'session').
 *
 * Lessons:
 *   #3 — mock shape REAL do helper getGrindSessionHistory (reuso do mesmo source RF-05).
 *   #10 — DRY de prompts: tool reusa source unica (nao duplica logica de cluster).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock helper compartilhado entre route + tool (sprint atual)
vi.mock('../../../server/services/grindSessionHistory', () => ({
  getGrindSessionHistory: vi.fn(),
}));

// @ts-expect-error — RED: tool ainda nao existe em server/coach/tools
import { readUserBankrollHistoryTool } from '../../../server/coach/tools/readUserBankrollHistory';
// @ts-expect-error — helper nao existe ainda
import { getGrindSessionHistory } from '../../../server/services/grindSessionHistory';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Coach tool read_user_bankroll_history (RF-07)', () => {
  it('tool exportado com nome read_user_bankroll_history', () => {
    // RED: tool nao existe
    expect(readUserBankrollHistoryTool).toBeDefined();
    expect(readUserBankrollHistoryTool.name).toBe('read_user_bankroll_history');
  });

  it('JSON Schema documenta campo type em description (RF-07 doc)', () => {
    // RED: schema da tool ainda nao redigido
    const schema = readUserBankrollHistoryTool.input_schema ?? readUserBankrollHistoryTool.parameters ?? {};
    // Pelo menos a descricao do tool deve mencionar manual_report
    const desc = (readUserBankrollHistoryTool.description ?? '').toLowerCase();
    expect(desc).toMatch(/manual_report|type/);
  });

  it('runtime: cada entry retornado tem campo type (presence)', async () => {
    (getGrindSessionHistory as any).mockResolvedValue([
      { type: 'session', id: 'SES-1', occurredAt: '2026-05-01T22:30:00Z', profitUsd: -30, platformsAffected: ['PokerStars'], detailsAvailable: true, tournamentsCount: 5 },
      { type: 'manual_report', id: 'mr_tx_a', occurredAt: '2026-05-01T14:30:00Z', profitUsd: 249.4, transactionIds: ['tx_a'], platformsAffected: ['PokerStars'], detailsAvailable: true },
    ]);

    const result = await readUserBankrollHistoryTool.execute({ userId: 'USER-0001', limit: 10 });
    expect(Array.isArray(result.entries)).toBe(true);
    for (const entry of result.entries) {
      expect(entry.type).toBeDefined();
      expect(['session', 'manual_report']).toContain(entry.type);
    }
  });

  it('manual_reports incluidos no historico (cluster D5 ja resolvido pelo helper)', async () => {
    (getGrindSessionHistory as any).mockResolvedValue([
      { type: 'manual_report', id: 'mr_x', occurredAt: '2026-05-01T14:30:00Z', profitUsd: 100, transactionIds: ['tx_a', 'tx_b'], platformsAffected: ['PokerStars', 'GGNetwork'], detailsAvailable: true },
    ]);

    const result = await readUserBankrollHistoryTool.execute({ userId: 'USER-0001' });
    const mr = result.entries.find((e: any) => e.type === 'manual_report');
    expect(mr).toBeDefined();
    expect(mr.transactionIds.length).toBe(2);
  });

  it('back-compat: tool aceita schema sem `type` mas tagueia internamente (campo opcional)', async () => {
    // Helper retorna entries sem type explicito — tool ainda devolve type='session' default
    (getGrindSessionHistory as any).mockResolvedValue([
      { id: 'SES-2', occurredAt: '2026-05-01T22:30:00Z', profitUsd: 10, platformsAffected: ['PokerStars'], detailsAvailable: true, tournamentsCount: 3 },
    ]);

    const result = await readUserBankrollHistoryTool.execute({ userId: 'USER-0001' });
    expect(result.entries[0].type).toBe('session');
  });

  it('profitUsd preservado por entry', async () => {
    (getGrindSessionHistory as any).mockResolvedValue([
      { type: 'session', id: 'SES-1', occurredAt: '2026-05-01T22:30:00Z', profitUsd: -30.50, platformsAffected: ['PokerStars'], detailsAvailable: true, tournamentsCount: 5 },
    ]);

    const result = await readUserBankrollHistoryTool.execute({ userId: 'USER-0001' });
    expect(result.entries[0].profitUsd).toBeCloseTo(-30.5, 2);
  });

  it('paginacao: passa limit ao helper subjacente', async () => {
    (getGrindSessionHistory as any).mockResolvedValue([]);
    await readUserBankrollHistoryTool.execute({ userId: 'USER-0001', limit: 25 });
    expect(getGrindSessionHistory).toHaveBeenCalledWith('USER-0001', expect.objectContaining({ limit: 25 }));
  });

  it('shape preservado para Coach prompt cache (campos estaveis)', async () => {
    (getGrindSessionHistory as any).mockResolvedValue([
      { type: 'session', id: 'SES-1', occurredAt: '2026-05-01T22:30:00Z', profitUsd: 0, platformsAffected: [], detailsAvailable: false, tournamentsCount: 0 },
    ]);
    const result = await readUserBankrollHistoryTool.execute({ userId: 'USER-0001' });
    const entry = result.entries[0];
    // Campos obrigatorios nunca omitidos
    expect(entry.type).toBeDefined();
    expect(entry.occurredAt).toBeDefined();
    expect(entry.profitUsd).toBeDefined();
  });

  it('tool reusa helper unico (DRY #10) — nao chama storage diretamente', async () => {
    (getGrindSessionHistory as any).mockResolvedValue([]);
    await readUserBankrollHistoryTool.execute({ userId: 'USER-0001' });
    expect(getGrindSessionHistory).toHaveBeenCalled();
  });
});

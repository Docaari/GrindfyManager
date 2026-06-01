import { describe, it, expect } from 'vitest';

// =============================================================================
// EST-5 / ADR-226 — shared/coach-weekly-review.ts (RED phase)
//
// Modulo alvo (AINDA NAO EXISTE): shared/coach-weekly-review.ts
//   - WEEKLY_REVIEW_STATUSES  (array, ordem linear da maquina de estados)
//   - WeeklyReviewStatus       (type — erased em runtime, nao testavel direto)
//   - VALID_TRANSITIONS        (map from -> Set<to>)
//   - WeeklyReview             (interface — erased)
//   - YMD_REGEX                (reexport/local)
//   - startWeeklyReviewBodySchema (Zod — { weekStartDate?: YMD })
//
// Cobre RF-01 (shape da maquina de estados) + cenarios derivados:
//   - transicoes validas SOMENTE avancar, nunca pular/retroceder.
//
// Convencao: import dinamico (RED phase — o modulo ainda nao existe; cada teste
// falha individualmente por "Cannot find module", nao aborta o arquivo).
// Lesson #8: validar presenca INDIVIDUAL de status, nunca length absoluta.
// =============================================================================

async function loadShared() {
  return await import('../../../shared/coach-weekly-review');
}

describe('EST-5 shared WEEKLY_REVIEW_STATUSES', () => {
  it('contem os 5 status da maquina de estados (presenca individual — lesson #8)', async () => {
    const m = await loadShared();
    for (const s of [
      'recap_sent',
      'awaiting_upload',
      'upload_confirmed',
      'deep_analysis_done',
      'planning',
    ]) {
      expect(m.WEEKLY_REVIEW_STATUSES).toContain(s);
    }
  });

  it('a ordem linear é recap_sent -> awaiting_upload -> upload_confirmed -> deep_analysis_done -> planning', async () => {
    const m = await loadShared();
    expect(m.WEEKLY_REVIEW_STATUSES).toEqual([
      'recap_sent',
      'awaiting_upload',
      'upload_confirmed',
      'deep_analysis_done',
      'planning',
    ]);
  });
});

describe('EST-5 shared VALID_TRANSITIONS (map from -> Set<to>)', () => {
  it('recap_sent so avanca para awaiting_upload', async () => {
    const m = await loadShared();
    const to = m.VALID_TRANSITIONS.get('recap_sent');
    expect(to).toBeInstanceOf(Set);
    expect(to.has('awaiting_upload')).toBe(true);
  });

  it('awaiting_upload so avanca para upload_confirmed', async () => {
    const m = await loadShared();
    expect(m.VALID_TRANSITIONS.get('awaiting_upload').has('upload_confirmed')).toBe(true);
  });

  it('upload_confirmed so avanca para deep_analysis_done', async () => {
    const m = await loadShared();
    expect(m.VALID_TRANSITIONS.get('upload_confirmed').has('deep_analysis_done')).toBe(true);
  });

  it('deep_analysis_done so avanca para planning', async () => {
    const m = await loadShared();
    expect(m.VALID_TRANSITIONS.get('deep_analysis_done').has('planning')).toBe(true);
  });

  it('NUNCA permite pular passo (recap_sent -> planning é invalido)', async () => {
    const m = await loadShared();
    const to = m.VALID_TRANSITIONS.get('recap_sent');
    expect(to.has('planning')).toBe(false);
    expect(to.has('upload_confirmed')).toBe(false);
    expect(to.has('deep_analysis_done')).toBe(false);
  });

  it('NUNCA permite retroceder (awaiting_upload -> recap_sent é invalido)', async () => {
    const m = await loadShared();
    const to = m.VALID_TRANSITIONS.get('awaiting_upload');
    expect(to.has('recap_sent')).toBe(false);
  });

  it('planning é estado terminal (sem transicoes de saida ou Set vazio)', async () => {
    const m = await loadShared();
    const to = m.VALID_TRANSITIONS.get('planning');
    // terminal: ou nao tem entrada no mapa, ou tem Set vazio.
    const size = to ? to.size : 0;
    expect(size).toBe(0);
  });

  it('NUNCA permite auto-loop (recap_sent -> recap_sent é invalido)', async () => {
    const m = await loadShared();
    expect(m.VALID_TRANSITIONS.get('recap_sent').has('recap_sent')).toBe(false);
  });
});

describe('EST-5 shared YMD_REGEX', () => {
  it('aceita YYYY-MM-DD', async () => {
    const m = await loadShared();
    expect(m.YMD_REGEX.test('2026-06-08')).toBe(true);
  });

  it('rejeita formato invertido DD-MM-YYYY', async () => {
    const m = await loadShared();
    expect(m.YMD_REGEX.test('08-06-2026')).toBe(false);
  });
});

describe('EST-5 shared startWeeklyReviewBodySchema (Zod)', () => {
  it('aceita body vazio (weekStartDate é opcional — default nextMondayUtc no server)', async () => {
    const m = await loadShared();
    const parsed = m.startWeeklyReviewBodySchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it('aceita weekStartDate YMD valido', async () => {
    const m = await loadShared();
    const parsed = m.startWeeklyReviewBodySchema.safeParse({ weekStartDate: '2026-06-08' });
    expect(parsed.success).toBe(true);
  });

  it('rejeita weekStartDate malformado', async () => {
    const m = await loadShared();
    const parsed = m.startWeeklyReviewBodySchema.safeParse({ weekStartDate: '08/06/2026' });
    expect(parsed.success).toBe(false);
  });
});

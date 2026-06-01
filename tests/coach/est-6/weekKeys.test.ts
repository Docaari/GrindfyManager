import { describe, it, expect } from 'vitest';

// =============================================================================
// EST-6 / ADR-224 — week keys util (RED phase)
//
// Modulo alvo (AINDA NAO EXISTE): server/coach/planning/weekKeys.ts
//   - ymdUtc(d: Date): string                    -> "YYYY-MM-DD" em UTC
//   - nextMondayUtc(from?: Date): Date            -> proxima segunda 00:00 UTC
//   - brtMondayYmd(d: Date): string               -> segunda da semana no fuso
//                                                     America/Sao_Paulo (UTC-3)
//
// Cobre cenarios derivados:
//   - "Drift de chave de semana (UTC vs BRT)" — borda noturna em que o offset
//     BRT cai num dia/semana diferente do UTC.
// =============================================================================

async function loadWeekKeys() {
  return await import('../../../server/coach/planning/weekKeys');
}

describe('EST-6 weekKeys.ymdUtc', () => {
  it('formata uma data como YYYY-MM-DD em UTC', async () => {
    const { ymdUtc } = await loadWeekKeys();
    // 2026-06-08 13:45 UTC -> "2026-06-08"
    const d = new Date(Date.UTC(2026, 5, 8, 13, 45, 0));
    expect(ymdUtc(d)).toBe('2026-06-08');
  });

  it('usa o componente UTC mesmo perto da meia-noite UTC', async () => {
    const { ymdUtc } = await loadWeekKeys();
    // 2026-06-08 23:59 UTC ainda eh dia 08 em UTC
    const d = new Date(Date.UTC(2026, 5, 8, 23, 59, 0));
    expect(ymdUtc(d)).toBe('2026-06-08');
  });

  it('zero-padda mes e dia de um digito', async () => {
    const { ymdUtc } = await loadWeekKeys();
    const d = new Date(Date.UTC(2026, 0, 5, 0, 0, 0)); // 2026-01-05
    expect(ymdUtc(d)).toBe('2026-01-05');
  });
});

describe('EST-6 weekKeys.nextMondayUtc', () => {
  it('a partir de uma quarta retorna a segunda da PROXIMA semana (UTC)', async () => {
    const { nextMondayUtc, ymdUtc } = await loadWeekKeys();
    // 2026-06-03 eh uma quarta-feira (UTC). Proxima segunda = 2026-06-08.
    const from = new Date(Date.UTC(2026, 5, 3, 10, 0, 0));
    const monday = nextMondayUtc(from);
    expect(ymdUtc(monday)).toBe('2026-06-08');
  });

  it('a partir de uma segunda retorna a segunda seguinte (proxima semana, nao a atual)', async () => {
    const { nextMondayUtc, ymdUtc } = await loadWeekKeys();
    // 2026-06-08 eh segunda. "proxima" segunda = 2026-06-15.
    const from = new Date(Date.UTC(2026, 5, 8, 0, 0, 0));
    const monday = nextMondayUtc(from);
    expect(ymdUtc(monday)).toBe('2026-06-15');
  });

  it('a partir de um domingo retorna a segunda do dia seguinte', async () => {
    const { nextMondayUtc, ymdUtc } = await loadWeekKeys();
    // 2026-06-07 eh domingo. Proxima segunda = 2026-06-08.
    const from = new Date(Date.UTC(2026, 5, 7, 22, 0, 0));
    const monday = nextMondayUtc(from);
    expect(ymdUtc(monday)).toBe('2026-06-08');
  });

  it('retorna meia-noite 00:00:00 UTC', async () => {
    const { nextMondayUtc } = await loadWeekKeys();
    const monday = nextMondayUtc(new Date(Date.UTC(2026, 5, 3, 10, 0, 0)));
    expect(monday.getUTCHours()).toBe(0);
    expect(monday.getUTCMinutes()).toBe(0);
    expect(monday.getUTCSeconds()).toBe(0);
    expect(monday.getUTCMilliseconds()).toBe(0);
  });
});

describe('EST-6 weekKeys.brtMondayYmd (UTC-3 — borda noturna)', () => {
  it('caso comum: meio-dia UTC cai na mesma data em BRT — segunda da semana', async () => {
    const { brtMondayYmd } = await loadWeekKeys();
    // 2026-06-10 (quarta) 12:00 UTC -> 09:00 BRT, mesma data. Segunda da semana = 2026-06-08.
    const d = new Date(Date.UTC(2026, 5, 10, 12, 0, 0));
    expect(brtMondayYmd(d)).toBe('2026-06-08');
  });

  it('borda noturna: 01:00 UTC de segunda eh 22:00 BRT do DOMINGO anterior -> semana BRT comeca na segunda anterior', async () => {
    const { brtMondayYmd } = await loadWeekKeys();
    // 2026-06-08 01:00 UTC = 2026-06-07 22:00 BRT (domingo).
    // Em BRT, ainda eh domingo da semana cuja segunda eh 2026-06-01.
    // (A segunda UTC seria 2026-06-08 — guard contra drift.)
    const d = new Date(Date.UTC(2026, 5, 8, 1, 0, 0));
    expect(brtMondayYmd(d)).toBe('2026-06-01');
  });

  it('a chave BRT difere da chave UTC na mesma instancia (prova do drift)', async () => {
    const { brtMondayYmd, ymdUtc, nextMondayUtc } = await loadWeekKeys();
    const d = new Date(Date.UTC(2026, 5, 8, 1, 0, 0));
    // UTC: dia 08 (segunda). BRT: dia 07 (domingo) -> semana anterior.
    expect(ymdUtc(d)).toBe('2026-06-08');
    expect(brtMondayYmd(d)).not.toBe(ymdUtc(nextMondayUtc(d)));
    expect(brtMondayYmd(d)).toBe('2026-06-01');
  });
});

/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint UX-QW-3 — RF-03: shared/calendarDaysSince util DST-aware.
 *
 * Spec: Docs/specs/sprint-ux-qw-3.md (RF-03)
 * ADR:  Docs/architecture/decisions/175-calendar-days-since-dst-aware.md
 *
 * Assinatura esperada:
 *   export function calendarDaysSince(
 *     from: Date | string,
 *     to: Date,
 *     timeZone?: string,
 *   ): number;
 *
 * Algoritmo (ADR-175):
 *   1. Resolve timeZone (default = Intl.DateTimeFormat().resolvedOptions().timeZone)
 *   2. Extrai YYYY-MM-DD de from/to no timeZone via en-CA formatter
 *   3. Converte cada YYYY-MM-DD em Date.UTC(y, m-1, d)
 *   4. Retorna Math.round((utcTo - utcFrom) / 86_400_000)
 *   5. Input invalido -> NaN
 *
 * Inputs aceitos: Date e string. String pode ser ISO completo ou YYYY-MM-DD.
 *
 * Lessons aplicadas:
 *   #14/#26 await import (modulo NAO existe ainda)
 *   #6      conversoes/comparacoes heterogeneas — mesmo padrao de bug
 */

import { describe, it, expect } from 'vitest';

const UTIL_PATH = '@shared/calendarDaysSince';

async function loadUtil() {
  // RED: modulo ainda nao existe (shared/calendarDaysSince.ts).
  // @ts-expect-error — modulo a ser criado pelo implementer
  const mod: any = await import(/* @vite-ignore */ UTIL_PATH);
  return mod.calendarDaysSince as (
    from: Date | string,
    to: Date,
    timeZone?: string,
  ) => number;
}

describe('RF-03 calendarDaysSince — same day', () => {
  it('retorna 0 quando from e to caem no mesmo dia civil em UTC', async () => {
    const calendarDaysSince = await loadUtil();
    const from = new Date('2026-05-20T03:00:00.000Z');
    const to = new Date('2026-05-20T22:00:00.000Z');
    expect(calendarDaysSince(from, to, 'UTC')).toBe(0);
  });

  it('retorna 0 quando from === to', async () => {
    const calendarDaysSince = await loadUtil();
    const d = new Date('2026-05-20T12:00:00.000Z');
    expect(calendarDaysSince(d, d, 'UTC')).toBe(0);
  });

  it('aceita string YYYY-MM-DD e Date misturados', async () => {
    const calendarDaysSince = await loadUtil();
    expect(
      calendarDaysSince('2026-05-20', new Date('2026-05-20T23:59:59.000Z'), 'UTC'),
    ).toBe(0);
  });
});

describe('RF-03 calendarDaysSince — diff positiva', () => {
  it('retorna 1 entre dois dias civis consecutivos (UTC)', async () => {
    const calendarDaysSince = await loadUtil();
    const from = new Date('2026-05-20T22:00:00.000Z');
    const to = new Date('2026-05-21T01:00:00.000Z');
    expect(calendarDaysSince(from, to, 'UTC')).toBe(1);
  });

  it('retorna 7 entre dois dias com 7 dias civis de diferenca', async () => {
    const calendarDaysSince = await loadUtil();
    const from = new Date('2026-05-13T12:00:00.000Z');
    const to = new Date('2026-05-20T12:00:00.000Z');
    expect(calendarDaysSince(from, to, 'UTC')).toBe(7);
  });

  it('retorna 30 para um mes (jan -> fev)', async () => {
    const calendarDaysSince = await loadUtil();
    const from = new Date('2026-01-15T00:00:00.000Z');
    const to = new Date('2026-02-14T00:00:00.000Z');
    expect(calendarDaysSince(from, to, 'UTC')).toBe(30);
  });
});

describe('RF-03 calendarDaysSince — diff negativa (from > to)', () => {
  it('retorna -1 quando from eh 1 dia depois de to', async () => {
    const calendarDaysSince = await loadUtil();
    const from = new Date('2026-05-21T12:00:00.000Z');
    const to = new Date('2026-05-20T12:00:00.000Z');
    expect(calendarDaysSince(from, to, 'UTC')).toBe(-1);
  });

  it('retorna -7 quando from eh 1 semana depois', async () => {
    const calendarDaysSince = await loadUtil();
    const from = new Date('2026-05-27T00:00:00.000Z');
    const to = new Date('2026-05-20T00:00:00.000Z');
    expect(calendarDaysSince(from, to, 'UTC')).toBe(-7);
  });
});

describe('RF-03 calendarDaysSince — input invalido', () => {
  it('retorna NaN para string nao-data', async () => {
    const calendarDaysSince = await loadUtil();
    expect(
      calendarDaysSince('nao-eh-data', new Date('2026-05-20T12:00:00.000Z'), 'UTC'),
    ).toBeNaN();
  });

  it('retorna NaN quando from eh Date invalida', async () => {
    const calendarDaysSince = await loadUtil();
    const invalid = new Date('foo-bar');
    expect(
      calendarDaysSince(invalid, new Date('2026-05-20T12:00:00.000Z'), 'UTC'),
    ).toBeNaN();
  });

  it('retorna NaN quando to eh Date invalida', async () => {
    const calendarDaysSince = await loadUtil();
    expect(
      calendarDaysSince(new Date('2026-05-20T12:00:00.000Z'), new Date('foo'), 'UTC'),
    ).toBeNaN();
  });

  it('retorna NaN para string vazia', async () => {
    const calendarDaysSince = await loadUtil();
    expect(
      calendarDaysSince('', new Date('2026-05-20T12:00:00.000Z'), 'UTC'),
    ).toBeNaN();
  });
});

describe('RF-03 calendarDaysSince — DST forward (spring) NY', () => {
  // EUA spring forward 2026: domingo 8 de marco, 02:00 -> 03:00 local.
  // Dia civil de 23h em America/New_York.
  it('retorna 1 entre 7 de marco 23h NY e 8 de marco 12h NY (atravessa salto)', async () => {
    const calendarDaysSince = await loadUtil();
    // 7 mar 23h NY local = 8 mar 04:00 UTC (EST UTC-5)
    const from = new Date('2026-03-08T04:00:00.000Z');
    // 8 mar 12h NY local = 8 mar 16:00 UTC (EDT UTC-4 pos-salto)
    const to = new Date('2026-03-08T16:00:00.000Z');
    expect(calendarDaysSince(from, to, 'America/New_York')).toBe(1);
  });

  it('retorna 0 para dois pontos no mesmo dia civil 8 de marco NY mesmo cruzando salto', async () => {
    const calendarDaysSince = await loadUtil();
    // 8 mar 01h NY (pre-salto) = 06:00 UTC
    const from = new Date('2026-03-08T06:00:00.000Z');
    // 8 mar 05h NY (pos-salto) = 09:00 UTC
    const to = new Date('2026-03-08T09:00:00.000Z');
    expect(calendarDaysSince(from, to, 'America/New_York')).toBe(0);
  });
});

describe('RF-03 calendarDaysSince — DST backward (fall) NY', () => {
  // EUA fall back 2026: domingo 1 de novembro, 02:00 -> 01:00 local.
  // Dia civil de 25h.
  it('retorna 1 entre 31 out 23h NY e 1 nov 12h NY (atravessa volta)', async () => {
    const calendarDaysSince = await loadUtil();
    // 31 out 23h NY local EDT (UTC-4) = 1 nov 03:00 UTC
    const from = new Date('2026-11-01T03:00:00.000Z');
    // 1 nov 12h NY EST (UTC-5) = 1 nov 17:00 UTC
    const to = new Date('2026-11-01T17:00:00.000Z');
    expect(calendarDaysSince(from, to, 'America/New_York')).toBe(1);
  });

  it('retorna 0 dentro do dia 1 nov NY mesmo com 25h de span', async () => {
    const calendarDaysSince = await loadUtil();
    // 1 nov 01h NY EDT (UTC-4) = 1 nov 05:00 UTC (pre-volta)
    const from = new Date('2026-11-01T05:00:00.000Z');
    // 1 nov 22h NY EST (UTC-5) = 2 nov 03:00 UTC (pos-volta, ainda 1 nov local)
    const to = new Date('2026-11-01T22:00:00.000Z');
    expect(calendarDaysSince(from, to, 'America/New_York')).toBe(0);
  });
});

describe('RF-03 calendarDaysSince — cross-timezone', () => {
  it('LA user as 23h local vs NY now as 02h local -> mesmo dia em LA (0)', async () => {
    const calendarDaysSince = await loadUtil();
    // 20 mai 23h LA (UTC-7 PDT) = 21 mai 06:00 UTC
    const from = new Date('2026-05-21T06:00:00.000Z');
    // 21 mai 02h NY (UTC-4 EDT) = 21 mai 06:00 UTC — mesmo instante
    const to = new Date('2026-05-21T06:00:00.000Z');
    // Avaliado em LA: ambos caem em 20 mai LA -> 0
    expect(calendarDaysSince(from, to, 'America/Los_Angeles')).toBe(0);
    // Avaliado em NY: ambos caem em 21 mai NY -> 0
    expect(calendarDaysSince(from, to, 'America/New_York')).toBe(0);
  });

  it('mesmo instante UTC pode ser dias diferentes em fusos distintos', async () => {
    const calendarDaysSince = await loadUtil();
    // 21 mai 02:00 UTC
    // -> 20 mai 19h LA (UTC-7)
    // -> 21 mai 02h UTC (mesmo dia em UTC)
    const from = new Date('2026-05-20T22:00:00.000Z'); // LA: 15h dia 20; UTC: dia 20
    const to = new Date('2026-05-21T02:00:00.000Z'); // LA: 19h dia 20; UTC: dia 21

    // Em LA: 20 -> 20 = 0
    expect(calendarDaysSince(from, to, 'America/Los_Angeles')).toBe(0);
    // Em UTC: 20 -> 21 = 1
    expect(calendarDaysSince(from, to, 'UTC')).toBe(1);
  });
});

describe('RF-03 calendarDaysSince — timeZone default (browser)', () => {
  it('quando timeZone eh undefined usa fuso resolvido (sem throw)', async () => {
    const calendarDaysSince = await loadUtil();
    const from = new Date('2026-05-19T12:00:00.000Z');
    const to = new Date('2026-05-20T12:00:00.000Z');
    const result = calendarDaysSince(from, to);
    // Em qualquer fuso razoavel, 24h apart caem em 0 ou 1 dia civil.
    expect(Number.isFinite(result)).toBe(true);
    expect(result === 0 || result === 1).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD (red phase) — helpers puros do auto-open clock-aligned BRT.
//
// Spec: Docs/specs/grind-live-break-auto-open.md (RFs 02, 03 + NFR Time-Zone)
// ADR: Docs/architecture/decisions/124-break-auto-open-clock-aligned-brt.md
// Diagrama: Docs/architecture/flows/grind-live-break-auto-open/sequence.mermaid
//
// Modulo a ser criado pelo implementer:
//   client/src/components/grind-session/break-clock-helpers.ts
// Funcoes:
//   - getCurrentHourKey(date, tz?)        -> "YYYY-MM-DD-HH" em BRT (default)
//   - getBrtMinute(date)                  -> 0..59 no fuso BRT
//   - shouldAutoOpenAtClock(now, lastKey) -> bool
//   - shouldAutoCloseAtClock(now, openedAt) -> bool (janela XX:02..XX:06)
//   - isInteractingWithModal(lastSliderInteractionAt, isInTextarea, now?) -> bool
//
// Convencao de timezone:
//   BRT (America/Sao_Paulo) = UTC-3 ano todo (sem DST desde 2019).
//   UTC 17:54 -> BRT 14:54
//   UTC 18:54 -> BRT 15:54
//   UTC 18:02 -> BRT 15:02
//   UTC 00:00 dia X -> BRT 21:00 dia (X-1)
//   UTC 02:00 dia X -> BRT 23:00 dia (X-1)
// =============================================================================

// Lesson #14: dynamic import + /* @vite-ignore */ para tolerar red phase
// (modulo nao existe ainda; sem este pattern, Vite quebra com "failed suite,
// no tests" antes mesmo de registrar os it()).
const MODULE_PATH = '../../../client/src/components/grind-session/break-clock-helpers';

import { beforeEach } from 'vitest';

let getCurrentHourKey: (date: Date, tz?: string) => string;
let getBrtMinute: (date: Date) => number;
let shouldAutoOpenAtClock: (now: Date, lastKey: string | null) => boolean;
let shouldAutoCloseAtClock: (now: Date, openedAt: Date) => boolean;
let isInteractingWithModal: (
  lastSliderInteractionAt: number,
  isInTextarea: boolean,
  now?: number
) => boolean;

beforeEach(async () => {
  const mod = await import(/* @vite-ignore */ MODULE_PATH);
  getCurrentHourKey = mod.getCurrentHourKey;
  getBrtMinute = mod.getBrtMinute;
  shouldAutoOpenAtClock = mod.shouldAutoOpenAtClock;
  shouldAutoCloseAtClock = mod.shouldAutoCloseAtClock;
  isInteractingWithModal = mod.isInteractingWithModal;
});

// =============================================================================
// getCurrentHourKey
// =============================================================================
describe('getCurrentHourKey', () => {
  it('UTC 17:54 vira BRT 14:54 -> "2026-05-05-14"', () => {
    const d = new Date('2026-05-05T17:54:00Z');
    expect(getCurrentHourKey(d)).toBe('2026-05-05-14');
  });

  it('UTC midnight -> BRT 21:00 do dia anterior', () => {
    const d = new Date('2026-05-05T00:00:00Z');
    // BRT = UTC-3 -> 04/05 21:00
    expect(getCurrentHourKey(d)).toBe('2026-05-04-21');
  });

  it('UTC 02:00 dia X -> BRT 23:00 dia (X-1)', () => {
    const d = new Date('2026-05-06T02:00:00Z');
    expect(getCurrentHourKey(d)).toBe('2026-05-05-23');
  });

  it('default tz e America/Sao_Paulo (omitir tz produz mesmo resultado que tz="America/Sao_Paulo")', () => {
    const d = new Date('2026-05-05T17:54:00Z');
    expect(getCurrentHourKey(d)).toBe(getCurrentHourKey(d, 'America/Sao_Paulo'));
  });

  it('tz custom (Europe/London) muda resultado vs BRT', () => {
    const d = new Date('2026-05-05T17:54:00Z');
    // Em Maio, Londres esta em BST (UTC+1) -> 18:54
    const london = getCurrentHourKey(d, 'Europe/London');
    const brt = getCurrentHourKey(d);
    expect(london).not.toBe(brt);
    expect(london).toBe('2026-05-05-18');
  });

  it('hora unidigit em BRT vira "08" (zero-padded)', () => {
    // UTC 11:30 -> BRT 08:30
    const d = new Date('2026-05-05T11:30:00Z');
    expect(getCurrentHourKey(d)).toBe('2026-05-05-08');
  });

  it('mes unidigit vira "03" (zero-padded)', () => {
    // UTC 17:00 03/03/2026 -> BRT 14:00
    const d = new Date('2026-03-03T17:00:00Z');
    expect(getCurrentHourKey(d)).toBe('2026-03-03-14');
  });

  it('dia unidigit vira "07" (zero-padded)', () => {
    const d = new Date('2026-05-07T18:00:00Z');
    expect(getCurrentHourKey(d)).toBe('2026-05-07-15');
  });

  it('formato eh exatamente "YYYY-MM-DD-HH" (4-2-2-2 com hifens)', () => {
    const d = new Date('2026-05-05T17:54:00Z');
    expect(getCurrentHourKey(d)).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}$/);
  });
});

// =============================================================================
// getBrtMinute
// =============================================================================
describe('getBrtMinute', () => {
  it('UTC 17:54 -> 54 (BRT 14:54)', () => {
    expect(getBrtMinute(new Date('2026-05-05T17:54:00Z'))).toBe(54);
  });

  it('UTC 02:00 -> 0 (BRT 23:00, virada de dia)', () => {
    expect(getBrtMinute(new Date('2026-05-06T02:00:00Z'))).toBe(0);
  });

  it('UTC 17:00 -> 0', () => {
    expect(getBrtMinute(new Date('2026-05-05T17:00:00Z'))).toBe(0);
  });

  it('UTC 17:30 -> 30', () => {
    expect(getBrtMinute(new Date('2026-05-05T17:30:00Z'))).toBe(30);
  });

  it('UTC 17:59 -> 59', () => {
    expect(getBrtMinute(new Date('2026-05-05T17:59:00Z'))).toBe(59);
  });

  it('seg adicional nao quebra (UTC 17:54:45 -> 54)', () => {
    expect(getBrtMinute(new Date('2026-05-05T17:54:45Z'))).toBe(54);
  });

  it('retorna number entre 0 e 59', () => {
    const d = new Date('2026-05-05T17:54:00Z');
    const m = getBrtMinute(d);
    expect(typeof m).toBe('number');
    expect(m).toBeGreaterThanOrEqual(0);
    expect(m).toBeLessThan(60);
  });
});

// =============================================================================
// shouldAutoOpenAtClock
// Regra: BRT minute === 54 E lastTriggerHourKey !== currentHourKey
// =============================================================================
describe('shouldAutoOpenAtClock', () => {
  it('BRT 14:54 + lastKey=null -> true (primeira vez)', () => {
    const now = new Date('2026-05-05T17:54:00Z'); // BRT 14:54
    expect(shouldAutoOpenAtClock(now, null)).toBe(true);
  });

  it('BRT 14:54 + lastKey="2026-05-05-14" -> false (mesma hora ja disparou)', () => {
    const now = new Date('2026-05-05T17:54:00Z'); // BRT 14:54
    expect(shouldAutoOpenAtClock(now, '2026-05-05-14')).toBe(false);
  });

  it('BRT 14:54 + lastKey="2026-05-05-13" -> true (hora anterior, key diferente)', () => {
    const now = new Date('2026-05-05T17:54:00Z'); // BRT 14:54
    expect(shouldAutoOpenAtClock(now, '2026-05-05-13')).toBe(true);
  });

  it('BRT 14:55 + lastKey=null -> false (minuto errado)', () => {
    const now = new Date('2026-05-05T17:55:00Z'); // BRT 14:55
    expect(shouldAutoOpenAtClock(now, null)).toBe(false);
  });

  it('BRT 14:53 + lastKey=null -> false', () => {
    const now = new Date('2026-05-05T17:53:00Z'); // BRT 14:53
    expect(shouldAutoOpenAtClock(now, null)).toBe(false);
  });

  it('BRT 15:54 + lastKey="2026-05-05-14" -> true (proxima hora)', () => {
    const now = new Date('2026-05-05T18:54:00Z'); // BRT 15:54
    expect(shouldAutoOpenAtClock(now, '2026-05-05-14')).toBe(true);
  });

  it('BRT 14:54 dia 06 + lastKey="2026-05-05-14" -> true (dia diferente, mesma hora numerica)', () => {
    const now = new Date('2026-05-06T17:54:00Z'); // BRT 14:54 dia 06
    expect(shouldAutoOpenAtClock(now, '2026-05-05-14')).toBe(true);
  });

  it('BRT 14:54:30 (segundos 30) + lastKey="2026-05-05-14" -> false (dedupe segundo tick)', () => {
    const now = new Date('2026-05-05T17:54:30Z');
    expect(shouldAutoOpenAtClock(now, '2026-05-05-14')).toBe(false);
  });

  it('BRT 23:54 com virada de dia em UTC -> true se key da hora atual nova', () => {
    const now = new Date('2026-05-06T02:54:00Z'); // BRT 23:54 dia 05
    expect(shouldAutoOpenAtClock(now, '2026-05-05-22')).toBe(true);
  });
});

// =============================================================================
// shouldAutoCloseAtClock
// Regra: janela [BRT minute >= 2 AND BRT minute < 4] na hora SEGUINTE ao open
// (modal aberto em XX:54 deve fechar em (XX+1):02..(XX+1):04, com tolerancia
// estendida ate :06 implementada via interacao no parent).
//
// A spec define janela tolerancia "ate XX:06 forca close" — porem a fn pura
// aqui retorna true em [02, 04). Forca-close apos 04 eh decisao do parent
// usando isInteractingWithModal + tempo extra ate 06.
// =============================================================================
describe('shouldAutoCloseAtClock', () => {
  it('aberto BRT 14:54, agora BRT 15:02 -> true (janela aberta)', () => {
    const openedAt = new Date('2026-05-05T17:54:00Z'); // BRT 14:54
    const now = new Date('2026-05-05T18:02:00Z'); // BRT 15:02
    expect(shouldAutoCloseAtClock(now, openedAt)).toBe(true);
  });

  it('aberto BRT 14:54, agora BRT 15:03 -> true (ainda dentro)', () => {
    const openedAt = new Date('2026-05-05T17:54:00Z');
    const now = new Date('2026-05-05T18:03:30Z'); // BRT 15:03:30
    expect(shouldAutoCloseAtClock(now, openedAt)).toBe(true);
  });

  it('aberto BRT 14:54, agora BRT 15:01 -> false (antes da janela)', () => {
    const openedAt = new Date('2026-05-05T17:54:00Z');
    const now = new Date('2026-05-05T18:01:00Z'); // BRT 15:01
    expect(shouldAutoCloseAtClock(now, openedAt)).toBe(false);
  });

  it('aberto BRT 14:54, agora BRT 15:04 -> false (saiu janela [02,04))', () => {
    const openedAt = new Date('2026-05-05T17:54:00Z');
    const now = new Date('2026-05-05T18:04:00Z'); // BRT 15:04
    expect(shouldAutoCloseAtClock(now, openedAt)).toBe(false);
  });

  it('aberto BRT 14:54, agora BRT 14:58 -> false (mesma hora, ainda nao chegou na janela)', () => {
    const openedAt = new Date('2026-05-05T17:54:00Z');
    const now = new Date('2026-05-05T17:58:00Z'); // BRT 14:58
    expect(shouldAutoCloseAtClock(now, openedAt)).toBe(false);
  });

  it('aberto BRT 14:54, agora BRT 15:02:00 (segundo zero) -> true', () => {
    const openedAt = new Date('2026-05-05T17:54:00Z');
    const now = new Date('2026-05-05T18:02:00Z');
    expect(shouldAutoCloseAtClock(now, openedAt)).toBe(true);
  });

  it('aberto BRT 14:54, agora BRT 16:02 (mais de uma hora depois) -> false (janela passou)', () => {
    const openedAt = new Date('2026-05-05T17:54:00Z'); // BRT 14:54
    const now = new Date('2026-05-05T19:02:00Z');     // BRT 16:02 — ja passou janela 15:02..15:04
    expect(shouldAutoCloseAtClock(now, openedAt)).toBe(false);
  });
});

// =============================================================================
// isInteractingWithModal
// Regra: true SE isInTextarea === true OR (now - lastSliderInteractionAt) < 30000
// =============================================================================
describe('isInteractingWithModal', () => {
  it('isInTextarea=true, last=0 -> true (foco em textarea sempre conta)', () => {
    expect(isInteractingWithModal(0, true)).toBe(true);
  });

  it('isInTextarea=false, last=now-15000 -> true (15s atras)', () => {
    const now = Date.now();
    expect(isInteractingWithModal(now - 15000, false, now)).toBe(true);
  });

  it('isInTextarea=false, last=now-29999 -> true (limite inferior, abaixo de 30s)', () => {
    const now = Date.now();
    expect(isInteractingWithModal(now - 29999, false, now)).toBe(true);
  });

  it('isInTextarea=false, last=now-30001 -> false (passou de 30s)', () => {
    const now = Date.now();
    expect(isInteractingWithModal(now - 30001, false, now)).toBe(false);
  });

  it('isInTextarea=false, last=0 -> false (nunca interagiu)', () => {
    // Sem param `now`, fn usa Date.now() interno; com last=0, diff > 30000 sempre.
    expect(isInteractingWithModal(0, false)).toBe(false);
  });

  it('isInTextarea=true, last=0, mesmo apos 1h -> true', () => {
    const now = Date.now();
    expect(isInteractingWithModal(now - 3_600_000, true, now)).toBe(true);
  });

  it('isInTextarea=false, last=now-30000 (exatamente 30s) -> false (limite estrito <30000)', () => {
    const now = Date.now();
    expect(isInteractingWithModal(now - 30000, false, now)).toBe(false);
  });
});

/**
 * Sprint Grind-Live Break Auto-Open (clock-aligned BRT)
 *
 * Spec: Docs/specs/grind-live-break-auto-open.md (RFs 02, 03 + NFR Time-Zone)
 * ADR:  Docs/architecture/decisions/124-break-auto-open-clock-aligned-brt.md
 *
 * Helpers puros (TDD-friendly) para extracao de hora/minuto BRT
 * (America/Sao_Paulo, UTC-3 sem DST desde 2019) e logica de janela
 * de auto-open / auto-close.
 *
 * Lessons:
 *   #1 — funcoes puras, hooks nao se aplicam aqui.
 *   #2 — toggles consumidores devem usar data-testid="toggle-break-auto-open"
 *        estavel (ver BreakAutoOpenToggle.tsx). Nao alterar.
 *   #6 — tudo normalizado para BRT antes de comparar minute === 54.
 *
 * Implementacao via `Intl.DateTimeFormat` (locale `en-US` por estabilidade
 * do output `formatToParts`).
 */

const DEFAULT_TZ = 'America/Sao_Paulo';

interface BrtParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
}

function getBrtParts(date: Date, tz: string = DEFAULT_TZ): BrtParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const lookup: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') {
      lookup[p.type] = p.value;
    }
  }
  // Em alguns runtimes Node, `hour: "2-digit"` + `hour12: false` retorna
  // "24" para meia-noite. Normalizar para "00".
  let hour = lookup.hour ?? '00';
  if (hour === '24') hour = '00';
  return {
    year: lookup.year ?? '0000',
    month: lookup.month ?? '00',
    day: lookup.day ?? '00',
    hour,
    minute: lookup.minute ?? '00',
  };
}

/**
 * Retorna chave de hora `YYYY-MM-DD-HH` no timezone informado (default BRT).
 * Usada como dedupe key para evitar re-disparo do auto-open dentro da mesma hora.
 */
export function getCurrentHourKey(date: Date, tz: string = DEFAULT_TZ): string {
  const p = getBrtParts(date, tz);
  return `${p.year}-${p.month}-${p.day}-${p.hour}`;
}

/**
 * Retorna minuto (0-59) no fuso BRT.
 */
export function getBrtMinute(date: Date): number {
  const p = getBrtParts(date, DEFAULT_TZ);
  return parseInt(p.minute, 10);
}

/**
 * RF-02: True se BRT minute === 54 E lastTriggerHourKey !== currentHourKey.
 */
export function shouldAutoOpenAtClock(
  now: Date,
  lastTriggerHourKey: string | null,
): boolean {
  if (getBrtMinute(now) !== 54) return false;
  const currentKey = getCurrentHourKey(now);
  return currentKey !== lastTriggerHourKey;
}

/**
 * RF-03: True se BRT minute esta na janela [2, 4) — janela de auto-close padrao.
 * O parent estende ate :06 via isInteractingWithModal + force-close defensivo.
 *
 * `openedAt` eh aceito para cobrir defensivamente o caso "modal aberto ha mais
 * de 1 hora" (saiu do escopo da janela XX:02-XX:04 da hora seguinte). Quando
 * `now - openedAt >= 60min + 4min`, retorna false porque a janela ja passou.
 */
export function shouldAutoCloseAtClock(now: Date, openedAt: Date): boolean {
  const minute = getBrtMinute(now);
  if (minute < 2 || minute >= 4) return false;
  // Se passou mais de uma hora desde open + janela, ja nao eh a janela esperada.
  // Janela esperada: openedAt + ~8 a ~10 min (XX:54 -> XX+1:02..XX+1:04).
  const diffMs = now.getTime() - openedAt.getTime();
  // Janela aceitavel: [4 min, 15 min). Open as XX:54 + close as (XX+1):02..(XX+1):04
  // = 8 a 10 min de diff. Margem ate 15 min cobre force-close em :06. Diff de
  // 60+ min (ex: 14:54 -> 16:02) ja perdeu o contexto da hora subsequente.
  if (diffMs < 4 * 60 * 1000) return false;
  if (diffMs >= 15 * 60 * 1000) return false;
  return true;
}

/**
 * RF-03: True se user esta interagindo com o modal:
 *   - foco em textarea (sempre conta), OU
 *   - mudou slider nos ultimos 30s (limite estrito: < 30000 ms).
 */
export function isInteractingWithModal(
  lastSliderInteractionAt: number,
  isInTextarea: boolean,
  now?: number,
): boolean {
  if (isInTextarea) return true;
  const ref = now ?? Date.now();
  const diff = ref - lastSliderInteractionAt;
  return diff < 30_000;
}

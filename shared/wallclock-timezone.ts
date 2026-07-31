/**
 * wallclock-timezone — converte "hora de parede" de um fuso nomeado para UTC.
 *
 * Motivacao (Sprint import-otimizacao / ADR-243): o export do SharkScope declara
 * o fuso NO CABECALHO da coluna, ex. `Data de Início (America/Sao_Paulo)`, e os
 * valores vem SEM offset (`2026-07-27 15:30`). O parser antigo fazia
 * `new Date("2026-07-27 15:30")` e o valor caia como 15:30Z — erro fixo de 3h em
 * toda analise por horario, e torneio das 21h+ (BRT) migrava para o dia UTC
 * seguinte.
 *
 * Funcao PURA e deterministica (sem Date.now(), sem I/O). Usa `Intl` da runtime
 * (ICU do Node) para resolver o offset do fuso NA DATA do evento — logo respeita
 * horario de verao historico sem tabela propria.
 */

/** Offset do fuso, em minutos a leste de UTC, no instante `utcDate`. */
export function tzOffsetMinutes(utcDate: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(utcDate)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const asIfUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) % 24,
    Number(map.minute),
    Number(map.second),
  );
  return (asIfUtc - utcDate.getTime()) / 60000;
}

const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/;

/**
 * Converte `YYYY-MM-DD HH:mm[:ss]` interpretado no fuso `timeZone` para `Date` UTC.
 * Retorna null quando a string nao casa o formato (caller decide o fallback).
 *
 * Itera 2x porque o offset depende do proprio instante (borda de DST).
 */
export function wallClockToUtc(wall: unknown, timeZone: string): Date | null {
  if (wall === null || wall === undefined) return null;
  const s = String(wall).trim();
  const m = WALL_RE.exec(s);
  if (!m) return null;
  const [, Y, Mo, D, H, Mi, S] = m;
  const naive = Date.UTC(
    Number(Y),
    Number(Mo) - 1,
    Number(D),
    Number(H),
    Number(Mi),
    Number(S ?? 0),
  );
  if (!Number.isFinite(naive)) return null;

  let guess = naive;
  for (let i = 0; i < 2; i++) {
    let offset: number;
    try {
      offset = tzOffsetMinutes(new Date(guess), timeZone);
    } catch {
      // Fuso invalido/desconhecido pela runtime — trata como UTC (comportamento antigo).
      return new Date(naive);
    }
    const corrected = naive - offset * 60000;
    if (corrected === guess) break;
    guess = corrected;
  }
  return new Date(guess);
}

/**
 * Extrai o nome do fuso declarado num cabecalho de coluna do SharkScope.
 * `"Data de Início (America/Sao_Paulo)"` -> `"America/Sao_Paulo"`.
 * Retorna null quando nao ha `(Area/Local)` no cabecalho.
 */
export function timezoneFromHeader(header: unknown): string | null {
  if (!header) return null;
  const m = /\(([A-Za-z]+\/[A-Za-z_+\-0-9]+)\)\s*$/.exec(String(header).trim());
  return m ? m[1] : null;
}

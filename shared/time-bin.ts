/**
 * Time-bin de ~2h (Sprint torneios-library-grouping).
 *
 * O agrupamento da Biblioteca de Torneios passa a separar por faixa de horario
 * aproximada (founder: "$55 ao meio-dia e $55 as 21h sao torneios diferentes").
 * Janelas FIXAS de 2h ancoradas em hora par -> deterministico (independe de
 * ordem). 12 bins cobrindo 0-23h + 1 bin "sem-horario" p/ datas ausentes.
 *
 * NAO confundir com server/scoring/timeOfDayBucket.ts (5 buckets de turno que o
 * scoring depende) — este e dedicado ao agrupamento e tem granularidade fina.
 */

export const NO_TIME_BIN = "sem-horario";

/**
 * Extrai a hora (0-23) de um Date/timestamp; null se invalido.
 * Usa getUTCHours (NAO getHours) DE PROPOSITO: o agrupamento roda server-side e
 * a TZ do processo varia (dev BRT vs prod UTC). getUTCHours torna o bin ESTAVEL
 * entre ambientes para o mesmo valor gravado em `tournaments.datePlayed`
 * (timestamp without tz). Assuncao: datePlayed reflete o wall-clock relevante do
 * jogador. Se um dia precisar da TZ exata do jogador, converter antes daqui.
 */
function hourOf(value: Date | string | number | null | undefined): number | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  const h = d.getUTCHours();
  return Number.isFinite(h) ? h : null;
}

/**
 * Mapeia um horario para a chave do bin de 2h (ex.: 13 -> "12-14").
 * Aceita Date/string/number (datePlayed) OU um numero de hora (0-23).
 * Entrada invalida/ausente -> NO_TIME_BIN.
 */
export function timeBin2h(value: Date | string | number | null | undefined): string {
  let hour: number | null;
  // Numero pequeno (0-23) = hora ja extraida; senao trata como timestamp.
  if (typeof value === "number" && value >= 0 && value <= 23 && Number.isInteger(value)) {
    hour = value;
  } else {
    hour = hourOf(value as any);
  }
  if (hour == null || hour < 0 || hour > 23) return NO_TIME_BIN;
  const start = Math.floor(hour / 2) * 2;
  const end = start + 2;
  return `${start}-${end}`;
}

/** Label PT-BR amigavel do bin (ex.: "12-14" -> "~12h-14h"; sem-horario -> "Sem horario"). */
export function timeBinLabel(bin: string): string {
  if (!bin || bin === NO_TIME_BIN) return "Sem horario";
  const [s, e] = bin.split("-");
  const pad = (n: string) => n.padStart(2, "0");
  return `~${pad(s)}h-${pad(e)}h`;
}

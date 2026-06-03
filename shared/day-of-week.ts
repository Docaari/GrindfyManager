/**
 * Dia da semana (Sprint torneios-custom-families — Fase 1).
 *
 * Espelha shared/time-bin.ts. A Biblioteca de Torneios passa a permitir filtrar
 * e agrupar por dia da semana (founder: "$55 na terca != $55 na quinta"). Usa
 * getUTCDay (NAO getDay) DE PROPOSITO: o agrupamento roda server-side e a TZ do
 * processo varia (dev BRT vs prod UTC). getUTCDay torna o dia ESTAVEL entre
 * ambientes para o mesmo valor gravado em `tournaments.datePlayed`.
 *
 * Chave em string ("seg") e nao indice numerico — consistente com timeBin
 * ("12-14") e legivel na familyKey.
 */

export const NO_DAY = "sem-dia";

/** index == getUTCDay() (0=domingo .. 6=sabado). */
export const DAY_KEYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

const DAY_LABELS: Record<string, string> = {
  dom: "Dom",
  seg: "Seg",
  ter: "Ter",
  qua: "Qua",
  qui: "Qui",
  sex: "Sex",
  sab: "Sab",
};

/** getUTCDay (0-6) de um Date/timestamp; null se invalido. */
function dayIndexOf(value: Date | string | number | null | undefined): number | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  const n = d.getUTCDay();
  return Number.isFinite(n) ? n : null;
}

/** Mapeia um Date/string/number para a chave do dia ("ter"); invalido -> NO_DAY. */
export function dayOfWeek(value: Date | string | number | null | undefined): string {
  const i = dayIndexOf(value);
  if (i == null || i < 0 || i > 6) return NO_DAY;
  return DAY_KEYS[i];
}

/** Rotulo PT-BR amigavel ("ter" -> "Ter"; NO_DAY -> "Sem dia"). */
export function dayOfWeekLabel(key: string): string {
  if (!key || key === NO_DAY) return "Sem dia";
  return DAY_LABELS[key] ?? "Sem dia";
}

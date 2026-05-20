/** Hora local 0-23 dado um Date UTC + IANA timezone. Fallback Sao Paulo. */
export function getLocalHour(date: Date, tz?: string | null): number {
  const safeTz = tz || "America/Sao_Paulo";
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: safeTz,
      hour: "numeric",
      hour12: false,
    });
    const parts = fmt.format(date).trim();
    const n = Number(parts);
    if (!Number.isFinite(n)) return getLocalHour(date, "America/Sao_Paulo");
    return n === 24 ? 0 : n;
  } catch {
    if (safeTz !== "America/Sao_Paulo") {
      return getLocalHour(date, "America/Sao_Paulo");
    }
    return date.getUTCHours();
  }
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Dia da semana 0-6 (0=domingo) no fuso informado. Fallback UTC. */
export function getLocalWeekday(date: Date, tz?: string | null): number {
  const safeTz = tz || "America/Sao_Paulo";
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: safeTz, weekday: "short" });
    return WEEKDAY_MAP[fmt.format(date).trim()] ?? date.getUTCDay();
  } catch {
    return date.getUTCDay();
  }
}

/** ISO week key `YYYY-WW` (ISO-8601). */
export function getISOWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-${String(weekNum).padStart(2, "0")}`;
}

/** Lê env var numerica positiva com default. */
export function getEnvNumber(key: string, def: number): number {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n > 0 ? n : def;
}

// =============================================================================
// timezone helpers — Sprint Coach Sprint 0 / RF-03
// Extraido para evitar tests dos jobs precisarem mockar nudgeEngine inteiro.
// =============================================================================

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

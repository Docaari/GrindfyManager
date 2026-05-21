// =============================================================================
// brTimezones — Sprint AI-3 / RF-05.1 (ADR-174 §2.5)
//
// Regex BR canônico + helper isBrUser. Extraído de
// `quarterlyReportGenerator.ts` para reuso futuro (computeIrpfSummary handler,
// outros geradores).
// =============================================================================

export const BR_TIMEZONE_REGEX =
  /^America\/(Sao_Paulo|Bahia|Belem|Fortaleza|Recife|Manaus|Cuiaba|Campo_Grande|Porto_Velho|Boa_Vista|Rio_Branco|Maceio|Araguaina|Eirunepe|Noronha|Santarem)$/;

export function isBrTimezone(tz: any): boolean {
  if (typeof tz !== "string" || tz.length === 0) return false;
  return BR_TIMEZONE_REGEX.test(tz);
}

export function isBrUser(
  u: { country?: string | null; timezone?: string | null } | null | undefined,
): boolean {
  if (u == null || typeof u !== "object") return false;
  const country = typeof u.country === "string" ? u.country.toUpperCase() : "";
  if (country === "BR") return true;
  if (typeof u.timezone === "string" && isBrTimezone(u.timezone)) return true;
  return false;
}

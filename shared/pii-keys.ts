// =============================================================================
// Sprint MP-VALIDATION / ADR-207 §3 — PII denylist + validator
//
// Server-side defesa-em-profundidade: nenhuma metadata enviada para a tabela
// `user_activity` pode conter chaves PII. Client-side ja faz strip; este modulo
// e a segunda linha (validador hard).
// =============================================================================

export const PII_KEYS_DENYLIST: ReadonlySet<string> = new Set([
  "email",
  "emailaddress",
  "useremail",
  "displayname",
  "display_name",
  "name",
  "fullname",
  "full_name",
  "phone",
  "phonenumber",
  "phone_number",
  "cpf",
  "ssn",
  "payment_card",
  "paymentcard",
  "credit_card",
  "creditcard",
  "address",
  "street_address",
]);

export interface PiiValidationResult {
  ok: boolean;
  violations: string[];
}

export function validatePiiFreeMetadata(meta: unknown): PiiValidationResult {
  const violations: string[] = [];
  if (!meta || typeof meta !== "object") {
    return { ok: true, violations };
  }
  const stack: any[] = [meta];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    if (Array.isArray(cur)) {
      for (const v of cur) stack.push(v);
      continue;
    }
    for (const [k, v] of Object.entries(cur)) {
      const lower = k.toLowerCase();
      if (PII_KEYS_DENYLIST.has(lower)) {
        if (!violations.includes(k)) violations.push(k);
      }
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return { ok: violations.length === 0, violations };
}

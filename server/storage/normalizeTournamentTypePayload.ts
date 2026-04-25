/**
 * normalizeTournamentTypePayload
 *
 * Sprint 1 — espelhamento type ↔ category no storage layer.
 *
 * Por que existe (ADR-031 + ADR-032):
 *   - O modelo ortogonal usa `type` como SSoT para o tipo primario.
 *   - A coluna legada `category` esta em deprecation gradual: durante a
 *     transicao, todos os writes em tournaments/planned_tournaments precisam
 *     manter `category = type` para nao quebrar dashboards/analytics que
 *     ainda leem `category`.
 *
 * Comportamento:
 *   1. Se `type` esta presente: espelha `category = type`.
 *   2. Se so `category` esta presente: back-fill `type = category`.
 *   3. Se ambos vierem divergentes: prevalece `type` + console.warn (sinal
 *      de chamada antiga ou bug). NAO modifica em silencio.
 *   4. Se ambos ausentes/null: default `type = category = 'Vanilla'`.
 *
 * Garantias:
 *   - Funcao PURA: nao muta o input. Sempre retorna NOVO objeto.
 *   - Preserva todos os outros campos do payload.
 *   - Nao valida o valor de `type` — deixa essa responsabilidade para o
 *     Zod adiante. Se vier "NotAType", `category` recebe o mesmo valor
 *     (apenas espelha) e o Zod rejeita depois.
 */

export interface TypeAwarePayload {
  type?: string | null | undefined;
  category?: string | null | undefined;
  [key: string]: any;
}

const DEFAULT_TYPE = 'Vanilla';

export function normalizeTournamentTypePayload<T extends TypeAwarePayload>(
  payload: T
): T & { type: string; category: string } {
  // Pureza: shallow clone (suficiente — nao mutamos campos aninhados)
  const result: any = { ...payload };

  const typeRaw = result.type;
  const categoryRaw = result.category;
  const typePresent = typeRaw !== null && typeRaw !== undefined;
  const categoryPresent = categoryRaw !== null && categoryRaw !== undefined;

  if (typePresent && categoryPresent) {
    if (typeRaw !== categoryRaw) {
      // Divergencia — type prevalece (decisao do ADR-032)
      console.warn('type_category_mismatch', {
        received_type: typeRaw,
        received_category: categoryRaw,
      });
    }
    result.type = typeRaw;
    result.category = typeRaw;
  } else if (typePresent && !categoryPresent) {
    // So type — espelha category
    result.type = typeRaw;
    result.category = typeRaw;
  } else if (!typePresent && categoryPresent) {
    // So category — back-fill type
    result.type = categoryRaw;
    result.category = categoryRaw;
  } else {
    // Nada — default seguro
    result.type = DEFAULT_TYPE;
    result.category = DEFAULT_TYPE;
  }

  return result;
}

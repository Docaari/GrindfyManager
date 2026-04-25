/**
 * mapZodIssuesToForm — aplica issues do backend (Zod estruturadas) ao
 * react-hook-form via setError/clearErrors.
 *
 * Sprint 1 RF-01:
 *   Backend (`zodErrorResponse`) retorna `{ issues: [{ field, message, code }] }`.
 *   Frontend chama este helper no `onError` do mutation para iluminar os
 *   campos do formulario com erro inline.
 *
 * Comportamento:
 *   - Issues com array nao-vazio: aplica setError(field, {type:code, message}).
 *   - Issues com array vazio: chama clearErrors (limpa todos os erros do form).
 *   - Campo desconhecido (nao registrado no form): NAO crasha; RHF aceita o
 *     setError mesmo de campo nao registrado e ignora silenciosamente na UI.
 *   - fieldMap opcional: permite traduzir paths do backend para paths do form
 *     (ex: 'tournament.time' -> 'time').
 */

export interface ZodIssue {
  field: string;
  message: string;
  code?: string;
}

export interface MapZodIssuesOptions {
  /**
   * Override de paths: chave = path do backend, valor = path do form.
   * Exemplo: { 'tournament.time': 'time' }
   */
  fieldMap?: Record<string, string>;
}

export interface FormLike {
  setError: (name: any, error: { type?: string; message?: string }, options?: any) => void;
  clearErrors: (name?: any) => void;
}

export function mapZodIssuesToForm(
  issues: ZodIssue[] | null | undefined,
  form: FormLike,
  options: MapZodIssuesOptions = {}
): void {
  // Tolerancia: form pode ser null (ex: harness do teste com .__lastForm
  // nao seteado). Apenas saida silenciosa.
  if (!form || typeof form.setError !== 'function') return;

  // Issues vazia ou null/undefined -> limpa todos os erros (sinal de
  // "agora ta tudo ok do lado servidor").
  if (!Array.isArray(issues) || issues.length === 0) {
    form.clearErrors();
    return;
  }

  const fieldMap = options.fieldMap ?? {};

  for (const issue of issues) {
    if (!issue || typeof issue !== 'object') continue;
    const rawField = issue.field;
    if (!rawField) continue;

    // Aplica fieldMap se houver match
    const mapped = fieldMap[rawField];
    const fieldName = mapped ?? rawField;

    try {
      form.setError(fieldName, {
        type: issue.code ?? 'validation',
        message: issue.message ?? 'Campo invalido',
      });
    } catch {
      // RHF nao deveria throwar para campo desconhecido, mas defensivamente
      // silenciamos qualquer excecao para nao crashar a UI.
    }
  }
}

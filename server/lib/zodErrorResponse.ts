/**
 * zodErrorResponse — helper para retornar erros de validacao Zod estruturados.
 *
 * Sprint 1 RF-01 + RF-10 (D8):
 *   - Em DEV: expoe codes internos do Zod (invalid_string, too_small, etc)
 *     para ajudar debugging.
 *   - Em PROD: retorna o mesmo shape mas com codes generalizados ('invalid')
 *     para nao vazar detalhes internos.
 *
 * Shape de saida:
 *   { status: 400, body: { error: 'validation', issues: [{field, message, code}] } }
 *
 * Para erros que NAO sao ZodError, retorna `null` — o caller deve cair em
 * 500 (ou outro tratamento) usando seu proprio fluxo de erro.
 */

import { ZodError } from 'zod';

export interface ValidationIssue {
  field: string;
  message: string;
  code: string;
}

export interface ValidationErrorResponse {
  status: 400;
  body: {
    error: 'validation';
    issues: ValidationIssue[];
  };
}

/**
 * Converte um ZodError em uma resposta HTTP estruturada.
 *
 * @param error  qualquer valor (so processa ZodError; demais retornam null)
 * @param isProd se true, generaliza `code` para 'invalid' (sanitizacao prod)
 * @returns objeto {status, body} ou null se nao for ZodError
 */
export function zodErrorResponse(
  error: unknown,
  isProd: boolean
): ValidationErrorResponse | null {
  if (!(error instanceof ZodError)) {
    return null;
  }

  const issues: ValidationIssue[] = error.issues.map((issue) => ({
    field: Array.isArray(issue.path) ? issue.path.join('.') : String(issue.path ?? ''),
    message: issue.message,
    code: isProd ? 'invalid' : String(issue.code),
  }));

  return {
    status: 400,
    body: {
      error: 'validation',
      issues,
    },
  };
}

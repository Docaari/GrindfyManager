import { describe, it, expect } from 'vitest';
import { isUnauthorizedError } from '../../../client/src/lib/authUtils';

// =============================================================================
// Testes de Caracterizacao: authUtils (client/src/lib/authUtils.ts)
//
// Funcao usada pelo Dashboard e outros componentes para detectar erros 401
// e redirecionar para login. Documenta o comportamento ATUAL.
//
// MODO CARACTERIZACAO: Todos devem PASSAR com o codigo existente.
// =============================================================================

describe('isUnauthorizedError', () => {
  it('deve retornar true para erro com formato "401: ...Unauthorized"', () => {
    const error = new Error('401: Unauthorized');
    expect(isUnauthorizedError(error)).toBe(true);
  });

  it('deve retornar true para erro com mensagem detalhada de Unauthorized', () => {
    const error = new Error('401: Access Unauthorized - Token expired');
    expect(isUnauthorizedError(error)).toBe(true);
  });

  it('deve retornar false para erro 403 Forbidden', () => {
    const error = new Error('403: Forbidden');
    expect(isUnauthorizedError(error)).toBe(false);
  });

  it('deve retornar false para erro 500 generico', () => {
    const error = new Error('500: Internal Server Error');
    expect(isUnauthorizedError(error)).toBe(false);
  });

  it('deve retornar false para erro sem numero de status', () => {
    const error = new Error('Something went wrong');
    expect(isUnauthorizedError(error)).toBe(false);
  });

  it('deve retornar false para string vazia', () => {
    const error = new Error('');
    expect(isUnauthorizedError(error)).toBe(false);
  });

  it('deve retornar false para 401 sem formato correto (sem : )', () => {
    const error = new Error('401 Unauthorized');
    expect(isUnauthorizedError(error)).toBe(false);
  });

  it('deve usar regex para match (requer "401: " seguido de "Unauthorized")', () => {
    // O regex e /^401: .*Unauthorized/
    const error = new Error('401: Please login, Unauthorized access');
    expect(isUnauthorizedError(error)).toBe(true);
  });

  it('deve falhar quando "Unauthorized" nao esta presente apos "401: "', () => {
    const error = new Error('401: Token expired');
    expect(isUnauthorizedError(error)).toBe(false);
  });
});

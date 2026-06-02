/**
 * Sprint Estudos-WS-Fix — guard de regressao da rota catch-all de /estudos.
 *
 * Raiz do "Estudos nao funcional": wouter v3 usa regexparam. `/estudos/:rest*`
 * vira nome de chave `rest*` -> casa SO 1 segmento (/estudos/temas), e qualquer
 * sub-rota 2+ segmentos (/estudos/temas/:id, /estudos/mda/registrar,
 * /estudos/analise/:id) cai no NotFound (404). O catch-all correto e `/estudos/*`
 * -> /(.*). Este teste trava o contrato: a rota DEVE casar paths multi-segmento.
 *
 * Usa o MESMO parser do wouter (regexparam) — se o wouter trocar de parser este
 * teste acompanha a realidade do runtime.
 */

import { describe, it, expect } from 'vitest';
import { parse } from 'regexparam';

const MULTI_SEGMENT_PATHS = [
  '/estudos/temas',
  '/estudos/temas/2m9bJZ-0hHjPfvQ9gjY6r',
  '/estudos/temas/novo',
  '/estudos/mda/registrar',
  '/estudos/mda/abc123',
  '/estudos/analise/sess_1',
  '/estudos/sessao/sess_1',
];

describe('rota catch-all de /estudos', () => {
  it('`/estudos/*` casa todos os sub-paths (incl. 2+ segmentos)', () => {
    const { pattern } = parse('/estudos/*');
    for (const p of MULTI_SEGMENT_PATHS) {
      expect(pattern.test(p), `deveria casar ${p}`).toBe(true);
    }
  });

  it('`/estudos/:rest*` (padrao antigo, bugado) NAO casa 2+ segmentos', () => {
    // Documenta por que o padrao antigo quebrava — nao reintroduzir.
    const { pattern } = parse('/estudos/:rest*');
    expect(pattern.test('/estudos/temas')).toBe(true);
    expect(pattern.test('/estudos/temas/2m9bJZ-0hHjPfvQ9gjY6r')).toBe(false);
    expect(pattern.test('/estudos/mda/registrar')).toBe(false);
  });
});

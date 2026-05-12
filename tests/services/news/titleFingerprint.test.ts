/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint News-3 — RF-03: `titleFingerprint` (Layer 2 dedupe).
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-03
 * ADR : Docs/architecture/decisions/107-news-rss-x-search-refactor.md §4
 *
 * Funcao pura `titleFingerprint(title: string) => string` (sha256 hex 64 chars).
 *
 * Pipeline:
 *   1. NFD unicode normalize + strip diacritics (\p{Mn})
 *   2. lowercase
 *   3. remove pontuacao + caracteres especiais (manter [a-z0-9 ])
 *   4. tokenize por espacos
 *   5. strip stopwords PT (o, a, os, as, de, da, do, ...) + EN (the, a, an, of, ...)
 *   6. sort tokens alfabeticamente
 *   7. top 10 tokens
 *   8. concat com '|' + sha256 hex
 *   9. string vazia → sha256 de '' (deterministico)
 *
 * Status RED: modulo `server/services/news/titleFingerprint` NAO existe.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';

const SHA256_EMPTY = createHash('sha256').update('').digest('hex');

describe('titleFingerprint (RF-03)', () => {
  it('retorna string hex 64 chars (sha256)', async () => {
    // RF-03 AC: output sempre 64 chars hex
    const { titleFingerprint } = await import('../../../server/services/news/titleFingerprint');
    const out = titleFingerprint('GGPoker WSOP 2026');
    expect(typeof out).toBe('string');
    expect(out).toHaveLength(64);
    expect(out).toMatch(/^[0-9a-f]{64}$/);
  });

  it('titles equivalentes com tokens reordenados → mesmo hash', async () => {
    // RF-03 AC principal: ordem de tokens irrelevante apos sort
    const { titleFingerprint } = await import('../../../server/services/news/titleFingerprint');
    const a = titleFingerprint('PokerStars lança Hot $55');
    const b = titleFingerprint('Hot $55 lancado pela PokerStars');
    expect(a).toBe(b);
  });

  it('titles distintos → hashes distintos', async () => {
    // RF-03 AC: 'WSOP 2026' !== 'WSOP 2027'
    const { titleFingerprint } = await import('../../../server/services/news/titleFingerprint');
    const a = titleFingerprint('GGPoker WSOP 2026');
    const b = titleFingerprint('GGPoker WSOP 2027');
    expect(a).not.toBe(b);
  });

  it('diacriticos PT (ç ã á é) normalizados', async () => {
    // RF-03 AC: 'çãáé' → 'caae' apos NFD strip
    const { titleFingerprint } = await import('../../../server/services/news/titleFingerprint');
    const a = titleFingerprint('ação');
    const b = titleFingerprint('acao');
    expect(a).toBe(b);
  });

  it('case-insensitive', async () => {
    const { titleFingerprint } = await import('../../../server/services/news/titleFingerprint');
    const a = titleFingerprint('PokerStars LANÇA promo');
    const b = titleFingerprint('pokerstars lanca promo');
    expect(a).toBe(b);
  });

  it('strip pontuacao mantem apenas a-z 0-9 espaco', async () => {
    // RF-03 AC: $, !, ?, ., , removidos
    const { titleFingerprint } = await import('../../../server/services/news/titleFingerprint');
    const a = titleFingerprint('Hot $55!');
    const b = titleFingerprint('Hot 55');
    expect(a).toBe(b);
  });

  it('strip stopwords PT (o, a, os, as, de, da, do, em, no, na, para, por, com, e, ou, que, um, uma)', async () => {
    // RF-03 AC: stopwords PT removidas antes do sort
    const { titleFingerprint } = await import('../../../server/services/news/titleFingerprint');
    const a = titleFingerprint('A vitoria do brasileiro no torneio');
    // Remove stopwords: 'a', 'do', 'no' → tokens uteis: 'brasileiro', 'torneio', 'vitoria'
    const b = titleFingerprint('vitoria brasileiro torneio');
    expect(a).toBe(b);
  });

  it('strip stopwords EN (the, a, an, of, in, on, at, for, to, and, or, that)', async () => {
    // RF-03 AC: stopwords EN tambem
    const { titleFingerprint } = await import('../../../server/services/news/titleFingerprint');
    const a = titleFingerprint('The new version of GTO Wizard');
    const b = titleFingerprint('new version GTO Wizard');
    expect(a).toBe(b);
  });

  it('top 10 tokens — ignora tokens 11+', async () => {
    // RF-03 AC: top 10 truncate
    const { titleFingerprint } = await import('../../../server/services/news/titleFingerprint');
    // Pipeline ordena alfabeticamente (passo 6) e fica com top 10 (passo 7).
    // Base sorted = [alfa, beta, delta, epsilon, eta, gamma, iota, kappa, theta, zeta]
    // — o 10o (ultimo no top 10) e 'zeta'. Para o hash nao mudar, os tokens
    // extras precisam sortar DEPOIS de 'zeta' (senao empurram theta/zeta pra fora
    // do top 10). 'zoo' < 'zulu' < 'zzz' e todos > 'zeta'. (lesson #25 — a versao
    // antiga usava lambda/mu/nu, que sortam entre kappa e theta.)
    const baseTokens = ['alfa', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa'];
    const a = titleFingerprint(baseTokens.join(' '));
    const b = titleFingerprint([...baseTokens, 'zoo', 'zulu', 'zzz'].join(' '));
    expect(a).toBe(b);
  });

  it('string vazia → sha256 de "" (deterministico)', async () => {
    // RF-03 AC: input vazio retorna sha256('')
    const { titleFingerprint } = await import('../../../server/services/news/titleFingerprint');
    const out = titleFingerprint('');
    expect(out).toBe(SHA256_EMPTY);
  });

  it('apenas stopwords → sha256 de ""', async () => {
    // Edge: titulo so com stopwords resulta tokens vazios → sha256('')
    const { titleFingerprint } = await import('../../../server/services/news/titleFingerprint');
    const out = titleFingerprint('a o de da do no na em');
    expect(out).toBe(SHA256_EMPTY);
  });

  it('apenas pontuacao → sha256 de ""', async () => {
    const { titleFingerprint } = await import('../../../server/services/news/titleFingerprint');
    const out = titleFingerprint('!!! ??? ...');
    expect(out).toBe(SHA256_EMPTY);
  });

  it('numeros sao preservados como tokens', async () => {
    // '2026' deve permanecer como token, nao stopword
    const { titleFingerprint } = await import('../../../server/services/news/titleFingerprint');
    const a = titleFingerprint('WSOP 2026');
    const b = titleFingerprint('WSOP');
    expect(a).not.toBe(b);
  });

  it('ordem dos tokens nao importa apos sort (idempotencia simbolica)', async () => {
    const { titleFingerprint } = await import('../../../server/services/news/titleFingerprint');
    const a = titleFingerprint('alfa beta gamma');
    const b = titleFingerprint('gamma alfa beta');
    const c = titleFingerprint('beta gamma alfa');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('tokens duplicados sao normalizados (sort estavel)', async () => {
    // 'alfa alfa beta' apos sort: ['alfa','alfa','beta']. Deve ser deterministico.
    const { titleFingerprint } = await import('../../../server/services/news/titleFingerprint');
    const a = titleFingerprint('alfa alfa beta');
    const b = titleFingerprint('alfa beta alfa');
    expect(a).toBe(b);
  });
});

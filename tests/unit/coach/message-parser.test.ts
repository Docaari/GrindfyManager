import { describe, it, expect } from 'vitest';

// =============================================================================
// Sprint Coach-1 / RF-03 — Frontend message parser
//
// Parser: client/src/lib/coachMessageParser.ts (NAO EXISTE — Implementer criara)
//
// Funcao exportada:
//   parseCoachMessage(text: string): {
//     cleanText: string,
//     tags: Array<
//       | { type: 'confidence', level: 'baixa'|'media'|'alta', n: number, position?: number }
//       | { type: 'unknown', reason: string, position?: number }
//     >
//   }
//
// Alternativa de renderizacao (nodes) — parseConfidenceTags(text):
//   Array<{ kind: 'text', content: string } | { kind: 'badge', badge: any }>
//
// Spec: docs/specs/coach-sprint-1-fundacao-economica.md (RF-03)
// ADR:  Docs/architecture/decisions/022-coach-confidence-tags-inline-vs-structured.md
// =============================================================================

import {
  parseCoachMessage,
  parseConfidenceTags,
} from '../../../client/src/lib/coachMessageParser';

// =============================================================================
// parseCoachMessage — extrai tags e retorna cleanText
// =============================================================================

describe('parseCoachMessage', () => {
  it('extrai tag [confianca: media, N=45] e remove do cleanText', () => {
    const result = parseCoachMessage('Seu ROI e -8% [confianca: media, N=45]');
    expect(result.cleanText.trim()).toBe('Seu ROI e -8%');
    expect(result.tags).toHaveLength(1);
    expect(result.tags[0]).toMatchObject({ type: 'confidence', level: 'media', n: 45 });
  });

  it('extrai tag [nao sei: motivo] e remove do cleanText', () => {
    const result = parseCoachMessage('Nao tenho dado sobre VPIP [nao sei: dado hand-level indisponivel]');
    expect(result.cleanText.trim()).toBe('Nao tenho dado sobre VPIP');
    expect(result.tags).toHaveLength(1);
    expect(result.tags[0]).toMatchObject({ type: 'unknown', reason: 'dado hand-level indisponivel' });
  });

  it('extrai multiplas tags em ordem de aparicao', () => {
    const text = '[confianca: alta, N=200] Seu ROI e solido. [nao sei: hand data] Sem dados de VPIP. [confianca: baixa, N=5] Turbos pequena amostra.';
    const result = parseCoachMessage(text);
    expect(result.tags).toHaveLength(3);
    expect(result.tags[0]).toMatchObject({ type: 'confidence', level: 'alta', n: 200 });
    expect(result.tags[1]).toMatchObject({ type: 'unknown', reason: 'hand data' });
    expect(result.tags[2]).toMatchObject({ type: 'confidence', level: 'baixa', n: 5 });
  });

  it('tags malformadas permanecem como texto literal (graceful)', () => {
    const result = parseCoachMessage('Texto [confianca: talvez, N=abc] importante');
    expect(result.tags).toHaveLength(0);
    expect(result.cleanText).toContain('[confianca: talvez, N=abc]');
  });

  it('tag parcial (streaming incompleto) nao eh extraida', () => {
    const result = parseCoachMessage('Esperando mais chunk [confianca: m');
    expect(result.tags).toHaveLength(0);
    expect(result.cleanText).toContain('[confianca: m');
  });

  it('texto sem tags retorna cleanText igual ao input e tags vazias', () => {
    const result = parseCoachMessage('Mensagem sem nenhuma tag.');
    expect(result.cleanText).toBe('Mensagem sem nenhuma tag.');
    expect(result.tags).toEqual([]);
  });

  it('tolera whitespace extra na tag', () => {
    const result = parseCoachMessage('[confianca:   alta ,  N=150 ] etc');
    expect(result.tags).toHaveLength(1);
    expect(result.tags[0]).toMatchObject({ type: 'confidence', level: 'alta', n: 150 });
  });
});

// =============================================================================
// parseConfidenceTags — retorna array de nodes (renderizacao)
// =============================================================================

describe('parseConfidenceTags — node-based rendering', () => {
  it('retorna 3 nodes (text, badge, text) para tag no meio', () => {
    const nodes = parseConfidenceTags('Seu ROI [confianca: alta, N=450] esta +8%');
    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toMatchObject({ kind: 'text', content: 'Seu ROI ' });
    expect(nodes[1].kind).toBe('badge');
    expect((nodes[1] as any).badge).toMatchObject({ level: 'alta', n: 450 });
    expect(nodes[2]).toMatchObject({ kind: 'text', content: ' esta +8%' });
  });

  it('retorna 2 nodes quando tag eh a primeira token', () => {
    const nodes = parseConfidenceTags('[nao sei: dado hand-level indisponivel] Nao posso analisar');
    expect(nodes).toHaveLength(2);
    expect(nodes[0].kind).toBe('badge');
    expect((nodes[0] as any).badge).toMatchObject({ type: 'unknown' });
    expect(nodes[1]).toMatchObject({ kind: 'text' });
  });

  it('retorna 2 nodes quando tag eh a ultima token', () => {
    const nodes = parseConfidenceTags('Conclusao [confianca: baixa, N=5]');
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ kind: 'text' });
    expect(nodes[1].kind).toBe('badge');
  });

  it('retorna 1 node de texto quando nao ha tags', () => {
    const nodes = parseConfidenceTags('Texto puro.');
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ kind: 'text', content: 'Texto puro.' });
  });

  it('tag malformada vira texto literal (graceful)', () => {
    const nodes = parseConfidenceTags('Inicio [confianca: extrema, N=abc] fim');
    // Todos sao text (nenhum badge)
    expect(nodes.every((n: any) => n.kind === 'text')).toBe(true);
    const full = nodes.map((n: any) => n.content).join('');
    expect(full).toBe('Inicio [confianca: extrema, N=abc] fim');
  });

  it('ignora tag parcial durante streaming (texto incompleto mantido)', () => {
    const nodes = parseConfidenceTags('Ainda chegando [confianca: m');
    expect(nodes.every((n: any) => n.kind === 'text')).toBe(true);
  });
});

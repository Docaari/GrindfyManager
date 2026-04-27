import { describe, it, expect } from 'vitest';

// =============================================================================
// Sprint Coach-1 Frontend UX / RF-02 — Citation parsing
//
// Extende o parser existente (parseConfidenceTags) para tambem extrair
// citations no formato:
//   [Fonte: <origem>, N=<numero>, janela: <periodo>]
//
// N e janela sao OPCIONAIS. Apenas `origem` e obrigatorio.
//
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-02)
// Arquivo sob teste: client/src/lib/coachMessageParser.ts (sera estendido)
// =============================================================================

import { parseConfidenceTags } from '../coachMessageParser';

// O tipo CoachNode sera estendido com:
//   | { kind: 'citation'; citation: { origem: string; n?: number; janela?: string } }
// Mantendo retrocompat com {kind:'text'} e {kind:'badge'}.

describe('parseConfidenceTags — Citations (RF-02)', () => {
  describe('extracao basica', () => {
    it('extrai citation completa com origem + N + janela', () => {
      const text = 'Sua stats: [Fonte: Dashboard > Por Speed, N=145, janela: 90d]';
      const nodes = parseConfidenceTags(text);
      const citation = nodes.find((n: any) => n.kind === 'citation');
      expect(citation).toBeTruthy();
      expect((citation as any).citation.origem).toBe('Dashboard > Por Speed');
      expect((citation as any).citation.n).toBe(145);
      expect((citation as any).citation.janela).toBe('90d');
    });

    it('extrai citation sem N e sem janela (apenas origem)', () => {
      const text = 'Veja [Fonte: Dashboard > Por Site] para detalhes.';
      const nodes = parseConfidenceTags(text);
      const citation = nodes.find((n: any) => n.kind === 'citation');
      expect(citation).toBeTruthy();
      expect((citation as any).citation.origem).toBe('Dashboard > Por Site');
      expect((citation as any).citation.n).toBeUndefined();
      expect((citation as any).citation.janela).toBeUndefined();
    });

    it('extrai citation com N mas sem janela', () => {
      const text = 'Olha [Fonte: Biblioteca, N=42] agora.';
      const nodes = parseConfidenceTags(text);
      const citation = nodes.find((n: any) => n.kind === 'citation');
      expect(citation).toBeTruthy();
      expect((citation as any).citation.origem).toBe('Biblioteca');
      expect((citation as any).citation.n).toBe(42);
      expect((citation as any).citation.janela).toBeUndefined();
    });

    it('extrai citation com janela mas sem N', () => {
      const text = '[Fonte: Grind Session, janela: 7d] indica tendencia.';
      const nodes = parseConfidenceTags(text);
      const citation = nodes.find((n: any) => n.kind === 'citation');
      expect(citation).toBeTruthy();
      expect((citation as any).citation.origem).toBe('Grind Session');
      expect((citation as any).citation.n).toBeUndefined();
      expect((citation as any).citation.janela).toBe('7d');
    });
  });

  describe('multiplas citations', () => {
    it('extrai multiplas citations no mesmo texto em ordem', () => {
      const text =
        'Primeiro [Fonte: Dashboard > Por Speed, N=145, janela: 90d], depois [Fonte: Biblioteca, N=42].';
      const nodes = parseConfidenceTags(text);
      const citations = nodes.filter((n: any) => n.kind === 'citation');
      expect(citations).toHaveLength(2);
      expect((citations[0] as any).citation.origem).toBe('Dashboard > Por Speed');
      expect((citations[1] as any).citation.origem).toBe('Biblioteca');
    });

    it('preserva ordem relativa com texto entre citations', () => {
      const text = 'A [Fonte: X, N=10] B [Fonte: Y] C';
      const nodes = parseConfidenceTags(text);
      // Esperado: text("A "), citation(X), text(" B "), citation(Y), text(" C")
      expect(nodes.length).toBeGreaterThanOrEqual(5);
      const kinds = nodes.map((n: any) => n.kind);
      const firstCitationIdx = kinds.indexOf('citation');
      const lastCitationIdx = kinds.lastIndexOf('citation');
      expect(firstCitationIdx).toBeLessThan(lastCitationIdx);
      expect((nodes[firstCitationIdx] as any).citation.origem).toBe('X');
      expect((nodes[lastCitationIdx] as any).citation.origem).toBe('Y');
    });
  });

  describe('citations + confidence + texto normal juntos', () => {
    it('extrai todos os tipos de node em ordem', () => {
      const text =
        'Seu ROI [confianca: alta, N=145] com base em [Fonte: Dashboard > Por Speed, N=145, janela: 90d].';
      const nodes = parseConfidenceTags(text);
      const kinds = nodes.map((n: any) => n.kind);
      expect(kinds).toContain('text');
      expect(kinds).toContain('badge');
      expect(kinds).toContain('citation');

      const badge = nodes.find((n: any) => n.kind === 'badge');
      expect((badge as any).badge.type).toBe('confidence');
      expect((badge as any).badge.level).toBe('alta');
      expect((badge as any).badge.n).toBe(145);

      const citation = nodes.find((n: any) => n.kind === 'citation');
      expect((citation as any).citation.origem).toBe('Dashboard > Por Speed');
      expect((citation as any).citation.n).toBe(145);
      expect((citation as any).citation.janela).toBe('90d');
    });

    it('extrai citation + unknown badge', () => {
      const text = '[nao sei: sem Hand History] pero [Fonte: Grind Sessions, janela: 30d] mostra algo.';
      const nodes = parseConfidenceTags(text);
      const unknown = nodes.find((n: any) => n.kind === 'badge' && (n as any).badge.type === 'unknown');
      const citation = nodes.find((n: any) => n.kind === 'citation');
      expect(unknown).toBeTruthy();
      expect(citation).toBeTruthy();
    });
  });

  describe('streaming parcial e malformed', () => {
    it('citation parcial em streaming (tag nao fechada) NAO e extraida — fica como texto', () => {
      const text = 'Aqui vai [Fonte: Dashboard > Por Spee';
      const nodes = parseConfidenceTags(text);
      const citation = nodes.find((n: any) => n.kind === 'citation');
      expect(citation).toBeFalsy();
      // Todo o conteudo deve ficar como texto literal
      const joined = nodes
        .filter((n: any) => n.kind === 'text')
        .map((n: any) => n.content)
        .join('');
      expect(joined).toContain('[Fonte: Dashboard > Por Spee');
    });

    it('citation malformed com origem vazia → fica como texto literal', () => {
      const text = 'Olha [Fonte: , N=10] isso.';
      const nodes = parseConfidenceTags(text);
      const citation = nodes.find((n: any) => n.kind === 'citation');
      expect(citation).toBeFalsy();
      const joined = nodes
        .filter((n: any) => n.kind === 'text')
        .map((n: any) => n.content)
        .join('');
      expect(joined).toContain('[Fonte: , N=10]');
    });

    it('texto sem citation retorna apenas text nodes', () => {
      const text = 'Oi, tudo bem?';
      const nodes = parseConfidenceTags(text);
      const hasCitation = nodes.some((n: any) => n.kind === 'citation');
      expect(hasCitation).toBe(false);
    });

    it('citation com whitespace extra e tolerada', () => {
      const text = '[Fonte:  Dashboard > Por Speed ,  N = 145 , janela:  90d  ]';
      const nodes = parseConfidenceTags(text);
      const citation = nodes.find((n: any) => n.kind === 'citation');
      expect(citation).toBeTruthy();
      expect((citation as any).citation.origem).toBe('Dashboard > Por Speed');
      expect((citation as any).citation.n).toBe(145);
      expect((citation as any).citation.janela).toBe('90d');
    });
  });
});

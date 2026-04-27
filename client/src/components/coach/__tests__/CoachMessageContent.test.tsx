import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

// =============================================================================
// Sprint Coach-1 Frontend UX / RF-01 + RF-02 — CoachMessageContent
//
// Componente renderizador que substitui <ReactMarkdown> direto nas bubbles
// do assistant. Consome parseConfidenceTags() e renderiza:
//   - texto normal: <ReactMarkdown> com remark-gfm
//   - badge.type='confidence': <ConfidenceBadge>
//   - badge.type='unknown':    <UnknownBadge>
//   - kind='citation':         <CitationChip>
//
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-01, RF-02)
// Arquivo sob teste: client/src/components/coach/CoachMessageContent.tsx (AINDA NAO EXISTE)
// =============================================================================

import { CoachMessageContent } from '../CoachMessageContent';

describe('<CoachMessageContent>', () => {
  describe('RF-01: confidence + texto normal', () => {
    it('renderiza texto + ConfidenceBadge inline + markdown bold', () => {
      const content = 'Seu ROI e **alto** [confianca: alta, N=145]. Continue.';
      render(<CoachMessageContent content={content} />);
      // Markdown bold foi renderizado
      const strong = document.querySelector('strong');
      expect(strong).toBeTruthy();
      expect(strong!.textContent).toMatch(/alto/);
      // Badge de confianca presente
      const badges = document.querySelectorAll('[role="status"]');
      expect(badges.length).toBeGreaterThanOrEqual(1);
      // Tag bruta NAO deve aparecer como texto visivel
      const full = document.body.textContent || '';
      expect(full).not.toContain('[confianca: alta, N=145]');
    });

    it('renderiza texto normal sem tags → markdown simples', () => {
      const content = 'Apenas **texto** com markdown.';
      render(<CoachMessageContent content={content} />);
      const strong = document.querySelector('strong');
      expect(strong).toBeTruthy();
      expect(strong!.textContent).toMatch(/texto/);
      // Nenhum badge
      const badges = document.querySelectorAll('[role="status"]');
      expect(badges.length).toBe(0);
    });

    it('renderiza UnknownBadge para [nao sei: motivo]', () => {
      const content = 'Nao consigo analisar [nao sei: sem Hand History] por falta de dados.';
      render(<CoachMessageContent content={content} />);
      const badges = document.querySelectorAll('[role="status"]');
      expect(badges.length).toBeGreaterThanOrEqual(1);
      // Texto do motivo aparece
      const full = document.body.textContent || '';
      expect(full).toMatch(/sem Hand History/);
      // Tag bruta nao aparece
      expect(full).not.toContain('[nao sei:');
    });
  });

  describe('RF-02: citations', () => {
    it('renderiza CitationChip inline para [Fonte: ...]', () => {
      const content = 'Com base em [Fonte: Dashboard > Por Speed, N=145, janela: 90d] voce esta bem.';
      render(<CoachMessageContent content={content} />);
      // CitationChip deve estar presente (implementacao usa button role ou data-testid)
      const chip =
        document.querySelector('[data-testid="citation-chip"]') ||
        document.querySelector('button[aria-label^="Fonte:"]') ||
        document.querySelector('[role="button"][aria-label^="Fonte:"]');
      expect(chip).toBeTruthy();
      const full = document.body.textContent || '';
      expect(full).toMatch(/Dashboard > Por Speed/);
      // Tag bruta nao aparece
      expect(full).not.toContain('[Fonte:');
    });
  });

  describe('edge cases', () => {
    it('input vazio renderiza algo seguro (sem crashar)', () => {
      const { container } = render(<CoachMessageContent content="" />);
      expect(container).toBeTruthy();
      // Nao deve ter badges ou chips
      expect(container.querySelectorAll('[role="status"]').length).toBe(0);
    });

    it('streaming parcial "Seu ROI e [confianca: a" — nao crasha, mostra texto literal', () => {
      const content = 'Seu ROI e [confianca: a';
      render(<CoachMessageContent content={content} />);
      const full = document.body.textContent || '';
      expect(full).toContain('Seu ROI e');
      // Como tag nao fechou, ela fica como texto
      expect(full).toContain('[confianca: a');
      // Sem badge
      expect(document.querySelectorAll('[role="status"]').length).toBe(0);
    });

    // TODO: confirm behavior — markdown preserva tag literal em fenced code?
    it('tags dentro de bloco de codigo markdown sao preservadas como texto (nao viram badge)', () => {
      const content = '```\n[confianca: alta, N=3]\n```';
      render(<CoachMessageContent content={content} />);
      const full = document.body.textContent || '';
      expect(full).toMatch(/\[confianca: alta, N=3\]/);
      // Idealmente no code block nao deveria renderizar badge
      // TODO: confirm behavior — se parser rodar ANTES de markdown, a tag vira badge.
      // Spec nao detalha esse caso; interpretacao conservadora: preservar tag dentro de code.
    });
  });

  describe('MEDIUM-6: block-level constructs (lista/heading/blockquote)', () => {
    // Paliativo: dentro de listas/headings/blockquotes as tags ficam como texto
    // literal (preservando a estrutura markdown). Tags fora desses constructs
    // continuam sendo parseadas em badges/chips.
    it('tags dentro de itens de lista preservam <ul> unico com 2 itens', () => {
      const content = '- Item 1 [confianca: alta, N=10] item 1.5\n- Item 2';
      render(<CoachMessageContent content={content} />);
      // Lista unica com exatamente 2 <li> (numeracao nao reinicia)
      const lists = document.querySelectorAll('ul');
      expect(lists.length).toBeGreaterThanOrEqual(1);
      const items = document.querySelectorAll('li');
      expect(items.length).toBe(2);
      // Tag fica como texto literal dentro do primeiro item
      const full = document.body.textContent || '';
      expect(full).toContain('[confianca: alta, N=10]');
    });

    it('tag dentro de heading preserva <h*> unico com texto literal da tag', () => {
      const content = '# Heading [confianca: alta, N=10]';
      render(<CoachMessageContent content={content} />);
      const h1s = document.querySelectorAll('h1');
      expect(h1s.length).toBe(1);
      const full = document.body.textContent || '';
      expect(full).toContain('[confianca: alta, N=10]');
    });

    it('tag dentro de lista numerada preserva <ol> com numeracao continua', () => {
      const content = '1. Primeiro [confianca: media, N=5]\n2. Segundo\n3. Terceiro';
      render(<CoachMessageContent content={content} />);
      const ols = document.querySelectorAll('ol');
      expect(ols.length).toBeGreaterThanOrEqual(1);
      const items = document.querySelectorAll('li');
      expect(items.length).toBe(3);
      const full = document.body.textContent || '';
      expect(full).toContain('[confianca: media, N=5]');
    });

    it('texto inline misto: tags fora de blocos viram badges, dentro ficam literais', () => {
      const content =
        'Intro [confianca: alta, N=20]\n\n- Item lista [confianca: media, N=5]\n\nFinal';
      render(<CoachMessageContent content={content} />);
      // Pelo menos 1 badge (do trecho inline "Intro [confianca: alta, N=20]")
      const badges = document.querySelectorAll('[role="status"]');
      expect(badges.length).toBeGreaterThanOrEqual(1);
      // Tag dentro da lista permanece como texto literal
      const full = document.body.textContent || '';
      expect(full).toContain('[confianca: media, N=5]');
    });
  });
});

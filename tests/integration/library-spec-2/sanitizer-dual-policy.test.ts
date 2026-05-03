import { describe, it, expect } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-2 / RF-02 — Sanitizer dual-policy
//
// Spec: Docs/specs/biblioteca-spec-2.md RF-02 + D1
// ADR-093 (admin-trusted bypass parcial; user-content rigoroso)
//
// Modulo target: server/services/htmlSanitizer.ts (REFACTOR — atualmente
// signature `sanitizeArticleHtml(rawHtml)`. Spec 2 muda pra
// `sanitizeArticleHtml(rawHtml, policy)` com 2 policies:
//   - 'admin-trusted'  -> allowlist expandida (Bloco A HTML rico)
//   - 'user-content'   -> allowlist rigorosa (ADR-076 inalterada). DEFAULT.
//
// IMPORTANT (Lesson #11): default seguro = 'user-content'. Caller
// sem policy explicita preserva comportamento atual (zero regressao).
//
// IMPORTANT: tag <style> permitida em admin-trusted MAS atributo `style`
// bloqueado em AMBOS (forca CSS via classes; previne payload exotico
// background:url(javascript:...)).
// =============================================================================

import { sanitizeArticleHtml } from '../../../server/services/htmlSanitizer';

// ---------------------------------------------------------------------------
// admin-trusted: aceita tags ricas
// ---------------------------------------------------------------------------

describe('sanitizeArticleHtml — admin-trusted policy aceita HTML rico', () => {
  it('deve manter <section class="flashcard-grid">', () => {
    const result = sanitizeArticleHtml(
      '<section class="flashcard-grid">conteudo</section>',
      'admin-trusted'
    );
    expect(result.clean).toContain('<section');
    expect(result.clean).toContain('flashcard-grid');
    expect(result.clean).toContain('conteudo');
  });

  it('deve manter <button data-flashcard-toggle="card-1">', () => {
    const result = sanitizeArticleHtml(
      '<button data-flashcard-toggle="card-1">Mostrar</button>',
      'admin-trusted'
    );
    expect(result.clean).toContain('<button');
    expect(result.clean).toContain('data-flashcard-toggle');
    expect(result.clean).toContain('Mostrar');
  });

  it('deve manter <style>.foo { color: red; }</style> (tag style)', () => {
    const result = sanitizeArticleHtml(
      '<style>.foo { color: red; }</style>',
      'admin-trusted'
    );
    expect(result.clean).toContain('<style');
    expect(result.clean).toContain('color: red');
  });

  it('deve manter <details><summary>X</summary>Y</details>', () => {
    const result = sanitizeArticleHtml(
      '<details><summary>Resposta</summary>Texto</details>',
      'admin-trusted'
    );
    expect(result.clean).toContain('<details');
    expect(result.clean).toContain('<summary');
  });

  it('deve manter atributos aria-* em admin-trusted', () => {
    const result = sanitizeArticleHtml(
      '<button aria-expanded="false" aria-controls="panel-1">Toggle</button>',
      'admin-trusted'
    );
    expect(result.clean).toContain('aria-expanded');
    expect(result.clean).toContain('aria-controls');
  });

  it('deve manter id, role, tabindex em admin-trusted', () => {
    const result = sanitizeArticleHtml(
      '<div id="main" role="region" tabindex="0">x</div>',
      'admin-trusted'
    );
    expect(result.clean).toContain('id="main"');
    expect(result.clean).toContain('role="region"');
    expect(result.clean).toContain('tabindex="0"');
  });

  it('deve manter <nav>, <header>, <footer>, <article>, <aside>, <figure>', () => {
    const tags = ['nav', 'header', 'footer', 'article', 'aside', 'figure'];
    for (const t of tags) {
      const result = sanitizeArticleHtml(`<${t}>x</${t}>`, 'admin-trusted');
      expect(result.clean).toContain(`<${t}`);
    }
  });
});

// ---------------------------------------------------------------------------
// admin-trusted: BLOQUEIA mesmo em policy permissiva
// ---------------------------------------------------------------------------

describe('sanitizeArticleHtml — admin-trusted ainda bloqueia vetores XSS', () => {
  it('deve REMOVER onclick mesmo em admin-trusted', () => {
    const result = sanitizeArticleHtml(
      '<button onclick="alert(1)">click</button>',
      'admin-trusted'
    );
    expect(result.clean).not.toContain('onclick');
    expect(result.clean).not.toContain('alert(1)');
    expect(result.clean).toContain('<button');
  });

  it('deve REMOVER atributo style mesmo em admin-trusted (forca CSS via classes)', () => {
    const result = sanitizeArticleHtml(
      '<div style="color:red;background:url(javascript:alert(1))">x</div>',
      'admin-trusted'
    );
    expect(result.clean).not.toContain('style="');
    expect(result.clean).not.toContain('javascript:');
    expect(result.clean).toContain('<div');
  });

  it('deve REMOVER javascript: em href mesmo em admin-trusted', () => {
    const result = sanitizeArticleHtml(
      '<a href="javascript:alert(1)">click</a>',
      'admin-trusted'
    );
    expect(result.clean).not.toContain('javascript:');
  });

  it('deve REMOVER <script> mesmo em admin-trusted (JS so via /article-scripts.js)', () => {
    const result = sanitizeArticleHtml(
      '<p>safe</p><script>alert(1)</script>',
      'admin-trusted'
    );
    expect(result.clean).toContain('<p>safe</p>');
    expect(result.clean).not.toContain('<script');
    expect(result.clean).not.toContain('alert(1)');
  });

  it('deve REMOVER <iframe> aninhado mesmo em admin-trusted', () => {
    const result = sanitizeArticleHtml(
      '<iframe src="evil.com"></iframe>',
      'admin-trusted'
    );
    expect(result.clean).not.toContain('<iframe');
  });

  it('deve REMOVER outros event handlers (onerror, onload, onmouseover)', () => {
    const result = sanitizeArticleHtml(
      '<img onerror="x" onload="y" onmouseover="z" src="/api/library/assets/x.png" />',
      'admin-trusted'
    );
    expect(result.clean).not.toContain('onerror');
    expect(result.clean).not.toContain('onload');
    expect(result.clean).not.toContain('onmouseover');
  });
});

// ---------------------------------------------------------------------------
// user-content: allowlist rigorosa (ADR-076 inalterada)
// ---------------------------------------------------------------------------

describe('sanitizeArticleHtml — user-content policy mantem rigor ADR-076', () => {
  it('deve REMOVER <section> em user-content (rigoroso, sem section)', () => {
    const result = sanitizeArticleHtml(
      '<section class="x">conteudo</section>',
      'user-content'
    );
    // section nao esta na allowlist user-content; tag removida mas conteudo preservado
    expect(result.clean).not.toContain('<section');
    expect(result.clean).toContain('conteudo');
  });

  it('deve REMOVER <button> em user-content', () => {
    const result = sanitizeArticleHtml(
      '<button data-x="1">click</button>',
      'user-content'
    );
    expect(result.clean).not.toContain('<button');
    expect(result.clean).toContain('click');
  });

  it('deve REMOVER <style> em user-content (tag style permitida apenas em admin-trusted)', () => {
    const result = sanitizeArticleHtml('<style>.x { color:red }</style>', 'user-content');
    expect(result.clean).not.toContain('<style');
    expect(result.clean).not.toContain('color:red');
  });

  it('deve REMOVER data-* em user-content (ALLOW_DATA_ATTR=false)', () => {
    const result = sanitizeArticleHtml(
      '<a href="https://x.com" data-foo="bar">link</a>',
      'user-content'
    );
    expect(result.clean).not.toContain('data-foo');
  });

  it('deve manter tags basicas (p, h1-h6, ul, li, strong, em, a, img) em user-content', () => {
    const result = sanitizeArticleHtml(
      '<p>p</p><h1>h1</h1><ul><li>li</li></ul><strong>s</strong><em>e</em>',
      'user-content'
    );
    expect(result.clean).toContain('<p>');
    expect(result.clean).toContain('<h1>');
    expect(result.clean).toContain('<ul>');
    expect(result.clean).toContain('<li>');
    expect(result.clean).toContain('<strong>');
    expect(result.clean).toContain('<em>');
  });
});

// ---------------------------------------------------------------------------
// Default policy = user-content (safe-by-default)
// ---------------------------------------------------------------------------

describe('sanitizeArticleHtml — default policy = user-content (safe-by-default)', () => {
  it('chamada sem policy deve usar user-content (rigoroso)', () => {
    // Sem 2o argumento -> policy default user-content (lesson #7 / lesson #11)
    const result = sanitizeArticleHtml('<section>x</section>');
    expect(result.clean).not.toContain('<section');
  });

  it('chamada sem policy preserva comportamento ADR-076 (zero regressao)', () => {
    const result = sanitizeArticleHtml('<p>safe</p><script>alert(1)</script>');
    expect(result.clean).toContain('<p>safe</p>');
    expect(result.clean).not.toContain('<script');
  });
});

// ---------------------------------------------------------------------------
// SanitizeResult shape (warnings expostos)
// ---------------------------------------------------------------------------

describe('sanitizeArticleHtml — return shape', () => {
  it('deve retornar { clean, wordCount, warnings }', () => {
    const result = sanitizeArticleHtml(
      '<p>Hello world</p>',
      'admin-trusted'
    );
    expect(result).toHaveProperty('clean');
    expect(result).toHaveProperty('wordCount');
    expect(result).toHaveProperty('warnings');
    expect(typeof result.clean).toBe('string');
    expect(typeof result.wordCount).toBe('number');
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('wordCount deve contar palavras do texto strip-tagged', () => {
    const result = sanitizeArticleHtml('<p>Um <strong>dois</strong> tres</p>');
    expect(result.wordCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Bloco A real-world fixture
// ---------------------------------------------------------------------------

describe('sanitizeArticleHtml — Bloco A fixture (admin-trusted preserva fidelidade)', () => {
  it('HTML real do A.1 mantem flashcard-grid + button data-attr + section', () => {
    const html = `
      <article>
        <section class="conceito">
          <h2>Mentalidade Fixa</h2>
          <p>Carol Dweck define...</p>
        </section>
        <section class="flashcard-grid">
          <button data-flashcard-toggle="card-1" type="button" aria-expanded="false" aria-controls="card-1-panel">
            Mostrar resposta
          </button>
          <div id="card-1-panel" class="flashcard-panel" hidden>
            <strong>Resposta:</strong> Crenca de que talento e fixo.
          </div>
        </section>
        <details>
          <summary>Por que isso funciona neuralmente?</summary>
          <p>Estudos de fMRI mostram...</p>
        </details>
      </article>
    `;
    const result = sanitizeArticleHtml(html, 'admin-trusted');
    expect(result.clean).toContain('<article');
    expect(result.clean).toContain('<section');
    expect(result.clean).toContain('flashcard-grid');
    expect(result.clean).toContain('data-flashcard-toggle');
    expect(result.clean).toContain('aria-expanded');
    expect(result.clean).toContain('aria-controls');
    expect(result.clean).toContain('<details');
    expect(result.clean).toContain('<summary');
  });
});

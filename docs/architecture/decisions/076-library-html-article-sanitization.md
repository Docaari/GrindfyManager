# ADR-076 — Sanitizacao server-side de HTML de artigos via DOMPurify, allowlist rigorosa

- Status: Proposto
- Data: 2026-05-01
- Sprint: Biblioteca-1 (RF-08 + RF-11)
- Decision owner: system-architect (formaliza founder D10 da spec)
- Related: ADR-071 (media storage — img src=/api/library/assets/...), ADR-073 (entitlements)
- Spec: `Docs/specs/biblioteca-spec-1.md` D10 + RF-08 + RF-11

## Contexto

A Spec 1 entrega artigos HTML como um dos tres formatos das aulas
(D2). Conteudo bruto vem do Curso 00 ("Antes das Cartas") em
`OneDrive/.../Bloco A/A1.html` etc — HTML produzido por Docari sem
sanitizacao formal.

Frontend renderiza via `dangerouslySetInnerHTML` em
`client/src/components/Library/ArticlePanel.tsx`. Sem sanitizacao,
qualquer `<script>`, `<iframe>`, `<img onerror>`, `javascript:` href
embedado no conteudo bruto vira **XSS** que executa no navegador de
TODOS os alpha testers logados.

A questao arquitetural e:

1. **Quando sanitizar** — server-side antes de salvar (`articleHtml`
   coluna sanitizada) ou client-side antes de renderizar (sanitizacao
   per-request)?
2. **Qual lib** — DOMPurify (industria padrao), sanitize-html,
   custom regex?
3. **Allowlist** — tags + atributos permitidos.
4. **Imagens** — bloquear hotlinks externos, forcar URL pattern Grindfy.

### Forcas em jogo

- **XSS catastrofico:** founder logado clica em aula com payload
  malicioso → script roda no contexto Grindfy → roubo de JWT,
  session hijack, exfiltracao de banca.
- **Conteudo bruto nao-trustado:** mesmo Docari sendo founder, HTML
  bruto pode ter `<script>` por engano (export de Word, copy-paste de
  blog). Treat-as-untrusted.
- **Performance:** sanitizar per-request (toda visualizacao) vs
  uma-vez-no-upload — uma-vez ganha em CPU + latencia.
- **Conteudo evoluivel:** Docari pode editar artigo no futuro; Spec 1
  nao tem UI admin (founder edita via DB). Sanitizar no DB write =
  proximo update tambem sanitizado (manifesto upload re-sanitiza).
- **Lib choice:**
  - **DOMPurify:** padrao industria, mantida pela cure53, ~200kb.
    `isomorphic-dompurify` roda em Node.
  - **sanitize-html:** mais customizavel, ~150kb, menos auditada.
  - **Custom regex:** YAGNI absoluto. NUNCA roll-your-own sanitizer.
- **Allowlist rigorosa vs permissiva:**
  - Rigorosa: bloqueia tags duvidosas (`<svg>`, `<details>`,
    `<dialog>`). Conteudo Docari pode quebrar.
  - Permissiva: deixa quase tudo, bloqueia so `<script>`. Risco maior.
- **Imagens:**
  - Hotlink externo (`<img src="https://evil.com/track.gif">`) =
    tracking pixel + IP leak.
  - Self-hosted only (`<img src="/api/library/assets/...">`) = controle
    total + serve via media storage.
- **Lesson #11 (default minimo):** sanitizer nao "ajuda" inferindo
  tags vazias; remove tudo nao-listado.

## Opcoes Consideradas

### Opcao A: Server-side sanitize com DOMPurify ANTES de salvar, allowlist rigorosa, imagens self-hosted only (ESCOLHIDA)

**Quando:**
- Upload manifest (RF-11): server sanitiza HTML antes de
  `INSERT INTO library_lessons (article_html, ...)`.
- Edicao via DB direto (futuro): trigger ou job rerun sanitize? Por
  enquanto founder responsabiliza-se. Spec 5+ adiciona admin UI com
  sanitize automatico.
- Read (`GET /api/library/lessons/:id`): retorna `articleHtml` direto
  do DB, ja sanitizado.
- Frontend: `<article dangerouslySetInnerHTML={{ __html: lesson.articleHtml }} />`.
  Confia no DB.

**Lib:** `isomorphic-dompurify` (DOMPurify polyfill para Node via
jsdom).

**Allowlist:**
```ts
const ALLOWED_TAGS = [
  'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'em', 'b', 'i', 'u',
  'ul', 'ol', 'li',
  'blockquote', 'code', 'pre',
  'a', 'img',
  'span', 'div',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
];

const ALLOWED_ATTR = [
  'href', 'src', 'alt', 'title', 'class',
];
```

**Hooks DOMPurify:**
1. **`uponSanitizeElement`** — bloqueia `<script>`, `<iframe>`,
   `<object>`, `<embed>` (defesa em depth alem da allowlist).
2. **`uponSanitizeAttribute`** — para `<img>`, valida `src` comeca
   com `/api/library/assets/` ou eh URL relativa Grindfy. Externos
   bloqueados.
3. **`uponSanitizeAttribute`** — para `<a>`, valida `href` nao usa
   `javascript:` ou `data:`. Permite `http(s)://`, `mailto:`,
   `/biblioteca/...`.
4. **`uponSanitizeAttribute`** — `class` permitido mas valor filtrado
   (sem `style=` injection via class trick).

**Output:**
- HTML sanitizado salvo em `library_lessons.article_html`.
- `library_lessons.article_word_count` calculado server-side
  (text content sem tags).

**Erros nao-fatais (RF-11):**
- HTML invalido apos sanitize (vazio) → row marcada com warning,
  registrada em `errors[]` do response.
- Tag bloqueada → silently removed (DOMPurify default).

- **Pros:**
  - **Sanitize uma vez** — economia CPU em read.
  - **DOMPurify auditada** — cure53 mantem; CVE rara.
  - **Allowlist explicita** — reviewer ve exatamente o que passa.
  - **Img hotlink bloqueado** — controle de assets.
  - **`javascript:` href bloqueado** — XSS clasico nao passa.
  - **Frontend simples** — confia no DB; sem dependencia DOMPurify
    no client (-200kb bundle).
  - **Test fixture trivial** — payload XSS in, HTML clean out, assert.
  - **Padrao reutilizavel** — futuro: notas usuario (Spec 2 B7),
    bug reports.

- **Contras:**
  - **Conteudo Docari pode quebrar** se usar tag bloqueada (ex:
    `<details>`, `<svg>`). Mitigado: testar com 1 HTML real do Curso
    00 antes de batch import.
  - **Edicao manual no DB** sem sanitize re-aplicada = risco. Mitigado:
    documentar em CLAUDE.md "NAO editar `article_html` direto sem
    rodar sanitize utility".
  - **Re-sanitize no manifest rerun** — overhead trivial.
  - **`isomorphic-dompurify` carrega jsdom** em Node — peso ~5MB
    no bundle server. Aceitavel (server, nao client).

### Opcao B: Client-side sanitize per-request

Frontend importa DOMPurify, sanitiza antes de injetar.

- **Pros:**
  - DB armazena conteudo "raw" — pode sanitizar de forma diferente no
    futuro sem re-import.
  - Sanitize closer to render = confianca maxima.

- **Contras:**
  - **Bundle +200kb** no client.
  - **CPU repetido** por visualizacao.
  - **Risco DB poisoned** — script malicioso fica salvo; dia que
    sanitize quebra (CVE), TODA renderizacao perigosa.
  - **Lesson #11 violation** — defense em ultima linha; preferimos
    defense em primeira (DB clean).
  - **Rejeitada por:** custo bundle + CPU >> beneficio.

### Opcao C: Sanitize em ambos (defense in depth)

Server sanitiza antes de salvar; client re-sanitiza antes de render.

- **Pros:**
  - Defesa dupla.

- **Contras:**
  - **Custo dupla** (CPU + bundle) sem ROI claro.
  - **Drift entre allowlists** server/client = bug confuso.
  - **YAGNI** — server-side ja confiavel.
  - **Rejeitada por:** over-engineering.

### Opcao D: Markdown source-of-truth (sem HTML bruto)

Conteudo armazenado em Markdown; renderizado via marked + DOMPurify.

- **Pros:**
  - Markdown subset menor — superficie de attack menor.
  - Editavel facilmente.

- **Contras:**
  - **Conteudo bruto Docari ja em HTML** — re-write = trabalho extra.
  - **Markdown perde estrutura** rica (tables, divs).
  - **Renderizador ainda precisa sanitize.**
  - **Rejeitada por:** custo de migration > beneficio. Considerar
    Spec 5+ se admin UI entrar.

## Decisao

**Adotar Opcao A: sanitizacao server-side com `isomorphic-dompurify`,
ANTES de salvar em `article_html`. Allowlist rigorosa. Imagens
self-hosted only (`/api/library/assets/...`). HTML clean retornado
direto pelo `GET` endpoint, frontend usa `dangerouslySetInnerHTML`.**

### Detalhes-chave do design

1. **Service** em `server/services/htmlSanitizer.ts`:
   ```ts
   import DOMPurify from 'isomorphic-dompurify';

   export function sanitizeArticleHtml(rawHtml: string): {
     clean: string;
     wordCount: number;
     warnings: string[];
   } {
     const purify = DOMPurify(/* JSDOM window */);
     purify.addHook('uponSanitizeElement', (node, data) => {
       // bloqueia tags duvidosas alem da allowlist
     });
     purify.addHook('uponSanitizeAttribute', (node, data) => {
       if (node.tagName === 'IMG' && data.attrName === 'src') {
         if (!data.attrValue.startsWith('/api/library/assets/')) {
           data.keepAttr = false;
         }
       }
       if (node.tagName === 'A' && data.attrName === 'href') {
         if (data.attrValue.match(/^(javascript|data):/i)) {
           data.keepAttr = false;
         }
       }
     });
     const clean = purify.sanitize(rawHtml, {
       ALLOWED_TAGS: [...],
       ALLOWED_ATTR: [...],
       FORBID_TAGS: ['script','iframe','object','embed','form','input'],
       FORBID_ATTR: ['onerror','onclick','onload','onmouseover'],
     });
     const wordCount = countWords(clean);
     return { clean, wordCount, warnings: [] };
   }
   ```

2. **Caller principal:** `server/services/manifestImporter.ts`
   (RF-11). Para cada row de tipo `lesson` com `article_filename`,
   le HTML, sanitiza, salva.

3. **Future caller:** se Spec 5+ adicionar admin UI para editar artigo
   inline, mesmo service e chamado no PATCH endpoint.

4. **`articleWordCount`:** populated via `countWords(stripTags(clean))`.
   Permite UI mostrar "leitura ~5min" sem JS clientside complexo.

5. **Frontend `ArticlePanel.tsx`:**
   ```tsx
   <article
     className="prose prose-invert"
     dangerouslySetInnerHTML={{ __html: lesson.formats.article.html }}
   />
   ```
   `prose` (Tailwind Typography) estiliza tags allowlisted nicely.
   Sem DOMPurify no bundle client.

6. **Image serving:** `<img src="/api/library/assets/{key}" />` —
   endpoint `GET /api/library/assets/:key` (RF-05) serve via
   `mediaStorage.get()`. Cache-Control 7d.

7. **External hotlink bloqueado** — DOMPurify hook remove `src` se
   nao matches pattern.

8. **`javascript:` href bloqueado** — DOMPurify hook remove `href` se
   matches `^(javascript|data):`.

9. **Test fixtures (RF-08 acceptance):**
   - `<script>alert('xss')</script>Lorem` → `Lorem` (script removed).
   - `<img src="x" onerror="alert(1)">` → `<img src="x">` (onerror
     removed); depois img src bloqueado por hook (sem `/api/library/assets/`).
   - `<a href="javascript:alert(1)">click</a>` → `<a>click</a>` (href
     removed).
   - `<iframe src="...">...</iframe>` → removed.
   - `<svg onload="...">` → removed.

10. **Lessons #11:** Sanitizer nao "infere" tags. Tag fora da lista =
    tag removida (conteudo de texto preservado dentro).

11. **Lesson #4 (Vitest 4):** test em node project (sanitizer e Node-side).

### Tradeoffs aceitos

| Tradeoff | Aceito por que |
|---|---|
| **Conteudo Docari pode quebrar com tag fora allowlist** | Testar com 1 HTML real antes de batch. Allowlist extensivel. |
| **Edicao manual DB sem re-sanitize = risco** | Documentar em CLAUDE.md. Spec 5+ resolve com admin UI. |
| **Re-sanitize on manifest rerun** | Custo trivial vs garantia. |
| **`isomorphic-dompurify` carrega jsdom** | Server-side; ~5MB. Aceitavel. |
| **Img endpoint pattern hardcoded** | Centralizado em hook. Mudar pattern = 1 linha. |

### Quando rever esta decisao

- **Allowlist precisa expandir** (Docari quer `<details>` para FAQs):
  estender + test.
- **Markdown source-of-truth** (Spec 5+ admin UI): considerar Opcao D.
- **CVE em DOMPurify**: bump version + retest fixtures.
- **Performance sanitize por upload**: irrelevante MVP (manifest manual).

## Consequencias

### Positivas

- **XSS prevented** — script/iframe/onerror nao passam.
- **Hotlink bloqueado** — assets centralizados.
- **`javascript:` href bloqueado.**
- **Sanitize uma vez** — economia CPU em read.
- **Frontend bundle limpo** — sem DOMPurify client.
- **Test trivial** — fixture in/out.
- **Padrao reutilizavel** — notas, bug reports futuros.

### Negativas

- **Conteudo Docari pode quebrar** — mitigated por test pre-batch.
- **Edicao DB raw = risco** — documentar.
- **DOMPurify CVE futura** = bump + retest.
- **Allowlist mantenance** — estender quando legitimo.

### Neutras

- **Decisao revisitavel** — Spec 5+ admin UI pode trocar para Markdown.
- **Lesson learned a registrar:** "sanitize HTML server-side ANTES de
  salvar; allowlist rigorosa; img + href filtrados via hooks; DB clean
  garante front-end safe sem dep cliente".

## Confianca

**Alta.** DOMPurify e gold standard industria (cure53 mantem,
audited, used by GitHub, GitLab, Khan Academy). Server-side sanitize
+ DB clean e padrao OWASP. Allowlist pattern e well-understood.
Hooks pattern documented em DOMPurify docs oficial.

## Referencias

- **Spec:** `Docs/specs/biblioteca-spec-1.md` D10 + RF-08 + RF-11
- **ADR-071:** `Docs/architecture/decisions/071-media-storage-backend-generic.md`
  — endpoint `/api/library/assets/...` serve images.
- **Lessons learned:**
  - #4 (Vitest 4 test.projects) — sanitizer test em node project.
  - #11 (default minimo em componentes) — sanitizer nao infere tags.
- **Diagramas Mermaid:**
  - `Docs/architecture/diagrams/biblioteca/flow-batch-upload-manifest.mermaid`
    — passa por sanitizer no import.
- **External:** DOMPurify https://github.com/cure53/DOMPurify;
  isomorphic-dompurify https://www.npmjs.com/package/isomorphic-dompurify;
  OWASP XSS Prevention Cheat Sheet.
- **Out of scope:** Markdown source (Spec 5+ admin UI), client-side
  sanitize fallback (defesa dupla — over-engineering), notas usuario
  (Spec 2 B7 reusara service).

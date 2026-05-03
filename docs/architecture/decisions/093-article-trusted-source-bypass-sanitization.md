# ADR-093 — Admin-imported HTML (trusted source) bypass parcial do sanitizer; user-generated content continua sanitizado

- Status: Proposto
- Data: 2026-05-03
- Sprint: Biblioteca-2 (RF-02 + Sprint posterior B7 notas usuario)
- Decision owner: system-architect (revisao da diretriz Spec 2)
- Related: **ADR-076 (DEPRECATED parcialmente — sanitizer ainda em vigor mas com allowlist relaxada para fontes trusted), ADR-092 (iframe sandbox)**, ADR-094 (article bundle)
- Spec: `Docs/specs/biblioteca-spec-2.md` RF-02 + recomendacao revisada do Strategist

---

## Contexto

ADR-076 (Biblioteca-1) decidiu sanitizer **server-side com allowlist
rigorosa** para todo HTML salvo em `library_lessons.article_html`.
Decisao foi solida assumindo:

1. Conteudo **bruto nao-trustado** (mesmo Docari pode ter erros).
2. HTML renderizado direto no DOM principal (sem isolamento).
3. Allowlist rigorosa = superficie XSS minima.

Spec 2 introduz **2 mudancas materiais** que invertem o calculo:

1. **ADR-092**: HTML passa a renderizar em **iframe sandbox
   `allow-scripts` (sem `allow-same-origin`)**. Mesmo que payload XSS
   passe, vive em origin null sem acesso a cookies/storage do parent.
   Sandbox vira camada 2 de defesa.

2. **Conteudo trusted**: Bloco A vem 100% de fonte conhecida
   (Docari), com workflow controlado:
   - Founder (admin_full) roda script CLI local
     (`scripts/library-upload-bloco-a.ts`).
   - Script le HTMLs de pasta no disco do founder.
   - HTML eh validado (build process Docari) antes de upload.
   - Caminho sem entrada user-generated.

**Pergunta arquitetural:** com sandbox como camada 2, faz sentido
manter sanitizer rigoroso? Ou aceitar HTML "as-is" pra fontes
trusted?

### Forcas

- **Sanitizer rigoroso (ADR-076 atual)** destrai 80% da identidade
  visual + 100% interatividade do Bloco A:
  - `<section>`, `<button>`, `<style>`, `data-*`, `aria-*` removidos.
  - **Nada interativo funciona** (flashcards, accordion mortos).
- **Sanitizer rigoroso + iframe sandbox** = redundancia em casos
  trusted (cinto + suspensorio + cinto extra).
- **User-generated content (Spec 2 B7 notas, Spec 5+ admin UI inline
  edit)**: sanitizer rigoroso continua **necessario** porque:
  - User pode injetar XSS por engano ou maldade.
  - User pode fazer paste de blog com `<script>` no meio.
- **CVE futuro DOMPurify** = manter sanitizer como linha de defesa.
- **Lesson #11 (default minimo):** sanitizer mais permissivo
  ainda **NAO infere** tags — apenas amplia allowlist. Nao viola.
- **Performance:** sanitize uma vez no upload ainda economiza CPU.
- **Dual-mode operacional**: sistema precisa de **2 sanitize
  policies** distintas:
  - `'admin-trusted'` — allowlist relaxada (HTML rico Docari).
  - `'user-content'` — allowlist rigorosa (notas usuario, bug
    reports rich text).

## Opcoes Consideradas

### Opcao A: Bypass total do sanitizer pra admin-imported (rejeitada)

Conteudo `admin-imported` salva HTML cru direto no DB sem qualquer
sanitize. Sandbox cuida de XSS.

- **Pros:** zero overhead; fidelidade 100%.
- **Contras:**
  - **CVE iframe sandbox**: mesmo que improvavel, breakouts ja
    aconteceram historicamente (https://www.cvedetails.com/vulnerability-list.php?vendor_id=44&product_id=15031).
    Sem sanitizer = sem rede de seguranca.
  - **Re-uso em fluxos sem sandbox**: se Spec 5+ admin UI renderizar
    HTML em preview no DOM principal pra editar, payload roda no
    parent.
  - **Lesson #11**: bypass total = "nao filtra tag" — perda de
    invariante. Sanitizer deveria sempre rodar (mesmo permissivo)
    pra remover handlers obvios.
  - **Audit trail**: sem sanitizer, dificil rastrear "que tag virou
    DB raw". Opcionalmente sanitizer faz log de tags removidas.
- **Rejeitada por:** redundancia razoavel > bypass total.

### Opcao B: Sanitizer com allowlist DUAL-MODE (ESCOLHIDA)

Sanitizer ganha **2 policies**:
- `'admin-trusted'`: allowlist expandida pra suportar HTML rico
  Docari (`<section>`, `<nav>`, `<button>`, `<style>`,
  `data-*`, `aria-*`, etc).
- `'user-content'`: allowlist rigorosa atual (ADR-076, sem
  mudanca).

API publica:
```ts
// server/services/htmlSanitizer.ts
export function sanitizeArticleHtml(
  rawHtml: string,
  policy: 'admin-trusted' | 'user-content' = 'user-content'
): SanitizeArticleResult;
```

Caller signal explicito:
- `manifestImporter.ts` (RF-09) chama
  `sanitizeArticleHtml(html, 'admin-trusted')`.
- Spec 5+ admin UI inline edit chama
  `sanitizeArticleHtml(html, 'admin-trusted')`.
- Spec 2 B7 notas usuario, bug reports, comments chamam
  `sanitizeArticleHtml(html, 'user-content')` (mesmo do ADR-076).

`'admin-trusted'` ainda **bloqueia**:
- `<script>` (mesmo trusted, sem necessidade — JS vive em
  `article-scripts.js` servido por endpoint dedicado RF-03).
- Handlers inline `onclick`, `onerror`, `onload` (sandbox protege,
  mas removemos pra forcar pattern `addEventListener` via JS
  externo trusted).
- `<iframe>` aninhado (defesa em depth contra payload exotico).
- `javascript:` URLs em `href`/`src`.

`'admin-trusted'` permite:
- `<section>`, `<nav>`, `<button>`, `<article>`, `<aside>`,
  `<figure>`, `<header>`, `<footer>`, `<details>`, `<summary>`,
  `<style>` (CSS embedded — vive isolado em iframe).
- `<table>`, `<thead>`, `<tbody>`, `<tfoot>`, `<tr>`, `<td>`,
  `<th>`, `<colgroup>`, `<col>`, `<caption>`.
- Atributos `data-*`, `aria-*`, `id`, `role`, `type`, `tabindex`.
- Atributo `style` **bloqueado** mesmo em admin-trusted (forca CSS
  vir de classes + arquivo dedicado; previne payload exotico
  `style=...background:url(javascript:...)`).

- **Pros:**
  - **Fidelidade 100%** do conteudo Docari preservada.
  - **Defesa em profundidade**: sanitizer (camada 1) +
    sandbox (camada 2). Cinto + suspensorio.
  - **`<script>` ainda bloqueado** — JS so via `article-scripts.js`
    publico controlado.
  - **`onclick`** ainda removido — forca pattern
    `data-flashcard-toggle` + `addEventListener` (consistente,
    auditable).
  - **Reuso seguro de policies**: caller escolhe explicito;
    default = `user-content` (safe-by-default).
  - **Padrao OWASP**: dual-policy sanitize esta em "OWASP HTML
    Sanitization Cheat Sheet" como pattern recomendado pra
    sistemas mistos trusted/untrusted.
  - **Lesson #11**: nao infere tags — apenas amplia universo
    permitido.
  - **Audit log**: sanitizer ainda registra tags/atributos removidos
    em `warnings[]`; founder ve diff durante import.
- **Contras:**
  - **2 policies pra manter** — divergencia possivel. Mitigado:
    test fixture cobre ambas.
  - **Mudanca breaking em ADR-076** — refatorar callers existentes
    pra passar `policy` explicito. Mitigado: default
    `'user-content'` preserva comportamento atual.

### Opcao C: Sanitize so client-side via iframe (rejeitada)

Aceita HTML cru no DB, sanitiza no browser dentro do iframe sandbox
antes de inserir.

- **Contras:**
  - **DB poisoned**: payload fica salvo. Dia que sanitize quebra
    (CVE), DB ja contaminado.
  - **CPU client repetido** por visualizacao.
  - **Bundle**: DOMPurify no iframe ja vem por causa do parent (ou
    duplicado).
  - **Defesa em ultima linha**: ADR-076 ja escolheu primeira linha;
    revogar = retrocesso.
- **Rejeitada por:** anti-pattern OWASP "store dirty, sanitize on
  read".

### Opcao D: Manter ADR-076 inalterado (rejeitada)

Allowlist rigorosa pra todo HTML, fim.

- **Contras:** **Bloco A morre visualmente**, 80% identidade
  perdida. Refatorar 9 HTMLs do Docari pra subset rigoroso = 30+
  horas perdidas + perda de padrao.
- **Rejeitada por:** custo de oportunidade alto demais; sandbox
  resolve risco de XSS de outra forma.

## Decisao

**Adotar Opcao B: sanitizer dual-policy. ADR-076 fica
parcialmente DEPRECATED**:
- API publica `sanitizeArticleHtml(rawHtml, policy)` aceita
  `'admin-trusted'` ou `'user-content'` (default).
- `'admin-trusted'`: allowlist expandida pra
  `<section>`, `<nav>`, `<button>`, `<style>`, `data-*`, `aria-*`,
  etc. Mantem bloqueio de `<script>`, handlers inline, atributo
  `style`, `<iframe>`.
- `'user-content'`: allowlist rigorosa do ADR-076 inalterada.
- `manifestImporter.ts` (RF-09) usa `'admin-trusted'`. Caller
  default permanece `'user-content'`.
- Sandbox iframe (ADR-092) eh camada 2 de defesa pra fontes
  trusted; user-content ainda renderiza em iframe tambem (mesmo
  componente `ArticleIframe`).

### Detalhes-chave do design

1. **Refator `htmlSanitizer.ts`:**
   ```ts
   export type SanitizePolicy = 'admin-trusted' | 'user-content';

   const ALLOWED_TAGS_USER_CONTENT = [
     /* lista atual ADR-076: p, h1-h6, ul, ol, li, strong, em, ... */
   ];

   const ALLOWED_TAGS_ADMIN_TRUSTED = [
     ...ALLOWED_TAGS_USER_CONTENT,
     'section', 'nav', 'button', 'article', 'aside', 'figure',
     'figcaption', 'header', 'footer', 'details', 'summary',
     'mark', 'sup', 'sub', 'time', 'abbr', 'cite', 'q', 'kbd',
     'var', 'samp', 'style', 'caption', 'colgroup', 'col',
     'tfoot',
   ];

   const ALLOWED_ATTR_USER_CONTENT = [
     'href', 'src', 'alt', 'title', 'class',
   ];

   const ALLOWED_ATTR_ADMIN_TRUSTED = [
     ...ALLOWED_ATTR_USER_CONTENT,
     'id', 'role', 'type', 'tabindex',
     // data-* + aria-* via DOMPurify ALLOW_DATA_ATTR + ALLOW_ARIA_ATTR
   ];

   export function sanitizeArticleHtml(
     rawHtml: string,
     policy: SanitizePolicy = 'user-content',
   ): SanitizeArticleResult {
     const tags = policy === 'admin-trusted'
       ? ALLOWED_TAGS_ADMIN_TRUSTED : ALLOWED_TAGS_USER_CONTENT;
     const attr = policy === 'admin-trusted'
       ? ALLOWED_ATTR_ADMIN_TRUSTED : ALLOWED_ATTR_USER_CONTENT;
     const config: any = {
       ALLOWED_TAGS: tags,
       ALLOWED_ATTR: attr,
       FORBID_TAGS: ['script','iframe','object','embed','form','input','svg','math'],
       FORBID_ATTR: ['onclick','onerror','onload','onmouseover','onfocus','onblur','onchange','onsubmit','onkeydown','onkeyup','style'],
       KEEP_CONTENT: true,
       USE_PROFILES: { html: true },
     };
     if (policy === 'admin-trusted') {
       config.ALLOW_DATA_ATTR = true;
       config.ALLOW_ARIA_ATTR = true;
     }
     // Hooks ADR-076 (img/href validation) instalados condicionalmente
     // ...
   }
   ```

2. **Caller `manifestImporter.ts` (RF-09):**
   ```ts
   const { clean, wordCount, warnings } = sanitizeArticleHtml(
     rawHtml,
     'admin-trusted',
   );
   if (warnings.length > 0) {
     console.warn('[manifestImporter] sanitize warnings:', warnings);
   }
   ```

3. **Hooks DOMPurify** (de ADR-076) preservados em ambas policies:
   - `<img src>` aceita `/api/library/assets/...` mesmo em
     admin-trusted (forca padrao Grindfy storage).
   - `<a href>` bloqueia `javascript:`, `data:` em ambas.
   - **Atributo `style`** bloqueado em ambas (forca CSS via classe).
   - Tag `<style>` bloqueada em user-content; permitida em
     admin-trusted (vivendo em iframe sandbox; CSS interno seguro).

4. **Test fixtures novos** (em `tests/unit/htmlSanitizer.test.ts`):
   - admin-trusted aceita `<section class="flashcard-grid">`.
   - admin-trusted aceita `<button data-flashcard-toggle="card-1">`.
   - admin-trusted aceita `<style>.foo { color: red; }</style>`.
   - admin-trusted aceita `<details><summary>x</summary>y</details>`.
   - admin-trusted **rejeita** `<button onclick="alert(1)">` — vira
     `<button>`.
   - admin-trusted **rejeita** `<a href="javascript:alert(1)">` —
     vira `<a>`.
   - admin-trusted **rejeita** `<div style="color:red">` — vira
     `<div>`.
   - admin-trusted **rejeita** `<script>alert(1)</script>` — removed.
   - user-content **rejeita** `<section>` (default policy);
     fica `[contents]`.

5. **Migracao do existente**:
   - ADR-076 caller (`manifestImporter` Spec 1) precisa virar
     `sanitizeArticleHtml(rawHtml, 'admin-trusted')` se Bloco A
     for re-importado. Sem mudanca breaking pra HTML ja salvo
     (DB tem coluna `article_html` ja sanitizada com policy
     antiga rigorosa; perde fidelidade ate re-import).

6. **Audit `warnings[]`:**
   - Sanitizer registra tags/atributos removidos em `warnings`.
   - `manifestImporter` loga em log estruturado:
     `[manifestImporter] lesson "a1-mentalidade-fixa" sanitize warnings: removed 2 onclick attrs, 1 style attr, 0 script tags`.
   - Founder pode ver durante import o que foi limpo.

### Tradeoffs aceitos

| Tradeoff | Aceito porque |
|---|---|
| 2 policies pra manter (drift risk) | Test fixture cobre ambas; lessons #1+#2 (lessons-learned). |
| ADR-076 deprecated parcial (breaking change na API) | Default seguro `'user-content'`; signal explicit obrigatorio pra `'admin-trusted'`. |
| `<style>` permitido em admin-trusted = superficie XSS maior em teoria | Sandbox iframe contem; sem vetor real de escape. |
| `data-*` allowed em massa | Hooks de JS controlado vivem em `lesson.js.transformed` upload-time; auditable. |
| Atributo `style` ainda bloqueado mesmo em trusted | Padrao defensive — payload exotico como background:url(...) bloqueado. |
| Re-import obrigatorio pra Bloco A ganhar fidelidade | Founder roda script 1x; idempotente. |

### Quando rever esta decisao

- **CVE em DOMPurify**: bump version + retest fixtures de ambas
  policies.
- **CVE em iframe sandbox**: reavaliar bypass — voltar pra
  rigorosa em ambas policies.
- **Spec 5+ admin UI inline edit**: WYSIWYG pode requerer policy
  intermediaria.
- **Conteudo Docari ganha tag exotica** nao prevista (`<dialog>`,
  `<menu>`, custom element): expandir allowlist `'admin-trusted'`.
- **Spec B7 notas usuario** consolidar — validar que policy
  `'user-content'` cobre o uso real.

## Consequencias

### Positivas

- **Fidelidade total** Bloco A preservada.
- **Defesa em profundidade**: sanitizer + sandbox.
- **Padrao reutilizavel** — futuras integracoes embedded escolhem
  policy explicit.
- **Audit `warnings[]`** acessivel.
- **Default safe-by-default**: caller esquece de passar policy =
  rigorosa (zero regressao).
- **Lesson #11 respeitado** — nao infere; apenas amplia universo.
- **OWASP-compliant** dual-policy pattern.

### Negativas

- **Refactor `htmlSanitizer.ts`** — ~50 LOC mudados.
- **Test fixtures dobram** — admin-trusted + user-content.
- **Re-import obrigatorio** Bloco A pra ganhar fidelidade.
- **Deprecation parcial ADR-076** — caller existente
  (`manifestImporter.ts` original) precisa atualizar chamada.

### Neutras

- **Decisao revisitavel** se sandbox CVE aparecer.
- **Lesson learned a registrar:** "iframe sandbox sem same-origin
  contem XSS na pratica; sanitizer com policy dual-mode e otimo
  pra mistura trusted/untrusted; sempre safe-by-default no
  parametro".

## Confianca

**Alta-Media.** Padrao OWASP existente; DOMPurify tem suporte
nativo pra config dinamico. Risco unico = drift entre policies, que
test fixture mitiga. Re-importar Bloco A apos esta ADR validar fim-a-fim
da seguranca.

## Referencias

- **Spec:** `Docs/specs/biblioteca-spec-2.md` RF-02 + recomendacao
  Strategist (revisao iframe sandbox + bypass)
- **ADR-076** — DEPRECATED parcialmente (allowlist rigorosa vira
  `'user-content'` policy). Sanitizer continua existindo.
- **ADR-092** — Iframe sandbox como camada 2 de defesa.
- **ADR-094** — Article bundle protocol (entrega bundle ao iframe).
- **Lessons learned:**
  - #4 (Vitest 4) — testes em `node` project.
  - #11 (default minimo) — nao infere; expande explicito.
- **External:**
  - OWASP HTML Sanitization Cheat Sheet
  - DOMPurify config docs
  - MDN iframe sandbox
- **Diagramas Mermaid:**
  - `Docs/architecture/diagrams/biblioteca-spec-2-trusted-bypass-flow.mermaid`
- **Out of scope:**
  - Spec 5+ admin UI WYSIWYG.
  - Spec B7 notas usuario sanitize integration test.
  - Markdown source-of-truth alternative (Spec futura).

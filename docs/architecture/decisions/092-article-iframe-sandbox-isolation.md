# ADR-092 — Iframe sandbox `allow-scripts` (sem `allow-same-origin`) para artigos HTML ricos da Biblioteca

- Status: Proposto
- Data: 2026-05-03
- Sprint: Biblioteca-2 (RF-06 + D1 + D2)
- Decision owner: system-architect (formaliza founder D1+D2 da Spec 2)
- Related: ADR-076 (sanitizer DOMPurify), ADR-093 (trusted-source bypass), ADR-094 (article-bundle protocol)
- Spec: `Docs/specs/biblioteca-spec-2.md` D1 + D2 + RF-06

---

## Contexto

Sprint Biblioteca-1 entregou a coluna `library_lessons.article_html` com
sanitizacao DOMPurify rigorosa (ADR-076). A spec assumiu que o frontend
renderizaria o HTML via `<article dangerouslySetInnerHTML>` direto no
DOM principal do app Grindfy.

Quando o conteudo real do **Bloco A "Antes das Cartas"** entrou em
analise (2026-05-03), o quadro virou:

- **9 HTMLs** com fidelidade visual alta (flashcards, accordion,
  recall, tipografia custom Outfit + JetBrains Mono).
- Cada HTML referencia `_assets/styles.css` (~26 KB) com **tokens
  CSS proprios** (`--accent-blue`, `--surface-deep`, etc).
- Cada HTML usa **JS de interatividade** vivendo em `_assets/lesson.js`
  (~130 linhas, ~9 funcoes globais: `toggleTOC`, `openLightbox`,
  `lightboxPrev/Next`, `revealAnswers`, etc).
- Atributos `onclick` inline frequentes nos HTMLs (~19 por aula = ~170
  no Bloco A).

A allowlist do ADR-076 (rigorosa, ALLOWED_TAGS = ~25 tags basicas) **destrai**
80% da identidade visual + **toda** a interatividade:

1. `<section>`, `<nav>`, `<button>`, `<style>` removidos = layout sumido.
2. `style` (atributo) removido = estilos inline mortos.
3. `data-*` removidos = hooks de JS perdidos.
4. `onclick=` removido (correto pra XSS) mas SEM substituto = interatividade morta.
5. Mesmo se relaxar a allowlist pra aceitar `<style>`, o CSS injetado
   no DOM principal **vaza** pros tokens shadcn do Grindfy
   (`--accent-blue` colide com `--primary`).

Tres caminhos arquiteturais posiveis:

1. **Expand allowlist + servir CSS escopado**: aceita `<section>`,
   `<button>`, `<style>` no sanitizer, escapa CSS via
   `@scope` ou prefix custom. Tailwind purge nao reconhece classes
   custom (`flashcard-grid`, `tool-card`) e nao gera CSS pra elas.
2. **Iframe sandbox com `allow-scripts` apenas**: HTML roda em
   contexto isolado, sem acesso a cookies/storage do parent.
3. **Iframe `allow-scripts` + `allow-same-origin`**: HTML roda
   isolado mas pode ler cookies/storage do parent (vetor XSS aberto).

Forcas:
- **XSS:** mesmo com sanitizer, sandbox protege contra payload
  obscuro que escape DOMPurify (defesa em profundidade).
- **Fidelidade visual:** Docari investiu tempo em CSS custom; perder
  isso reduz percepcao de qualidade premium.
- **CSP:** parent ja tem `Content-Security-Policy` com `default-src 'self'`;
  iframe sandbox `allow-scripts` (sem same-origin) **nao precisa de
  CSP unsafe-inline** porque vive em origin-null.
- **Postmessage:** iframe precisa comunicar com parent pra resize +
  scroll-depth (lesson nao tem altura fixa; conteudo cresce).
- **A11y:** screen readers (NVDA/VoiceOver) entram em iframes
  automaticamente quando tem `<title>` + `aria-label`. Aceitavel MVP.
- **Watermark anti-pirataria:** parent overlay com
  `position:absolute pointer-events:none` cobre iframe
  visualmente sem precisar `allow-same-origin`.

## Opcoes Consideradas

### Opcao A: Expand allowlist do sanitizer (rejeitada)

Adicionar `<section>`, `<button>`, `<style>`, `data-*`, `aria-*` na
allowlist. CSS dos artigos injetado direto no DOM. JS via
`addEventListener` apos `DOMContentLoaded` (ja seria assim no
`lesson.js` original).

- **Pros:**
  - Sem iframe — navegacao SPA preservada, scroll natural do app.
  - Sem postMessage — resize + scroll-depth funcionam direto.
  - Bundle simples (sem componente `ArticleIframe`).
- **Contras:**
  - **CSS leak**: tokens custom (`--accent-blue`) colidem com
    `--primary` shadcn. Tailwind nao reconhece classes
    `flashcard-grid` no purge.
  - **`<style>` tag aberta**: superficie de attack maior; payload
    `<style>@import url(evil)</style>` exfiltra via CSP bypass.
  - **`onclick`** nao tem substituto sem refatorar HTML do conteudo
    bruto (Docari).
  - **CSP unsafe-inline**: precisaria liberar `style-src 'unsafe-inline'`
    no parent CSP, abrindo vetor XSS pra todo app Grindfy.
  - **Lesson #11 violation**: sanitizer "ajuda" interpretando intent
    de tag custom — perde simplicity.
  - **Rejeitada por:** custo de XSS surface area + CSS leak +
    incompatibilidade Tailwind purge.

### Opcao B: Iframe sandbox `allow-scripts` only (ESCOLHIDA)

```html
<iframe sandbox="allow-scripts" srcdoc="${html}" />
```

- HTML, CSS, JS rodam isolados em **origin null** (iframe sandbox
  sem `allow-same-origin` ganha origin null automatico).
- JS do iframe **NAO acessa** `parent.document.cookie`,
  `parent.localStorage`, `parent.fetch`, etc.
- Comunicacao bidirecional via `window.postMessage` (parent escuta
  `message` event, valida `event.source === iframeRef.current.contentWindow`).
- Watermark fica no DOM do parent como overlay
  `position:absolute pointer-events:none z-10` cobrindo o iframe.
- CSS do iframe **isolado** — `--accent-blue` do conteudo Docari
  nunca toca tokens shadcn.

- **Pros:**
  - **Fidelidade total** do conteudo Docari sem refatorar HTMLs.
  - **Defesa em profundidade**: sanitizer (camada 1) + sandbox
    (camada 2). Mesmo se DOMPurify falhar (CVE futura), payload
    XSS fica preso no iframe sandbox sem cookies/storage do
    Grindfy.
  - **CSS isolado**: zero conflito com tokens shadcn.
  - **`<style>` aceito** dentro do iframe (vivendo em origin null)
    sem afrouxar CSP do parent.
  - **`onclick`** inline ainda removido pelo sanitizer; substituido
    por `data-*` + `addEventListener` no `lesson.js.transformed`
    (RF-11). Mesmo comportamento, anatomia segura.
  - **Tailwind purge**: classes custom (`flashcard-grid`, `tool-card`)
    nao precisam ser reconhecidas pelo purge do Grindfy — vivem no
    `article-styles.css` servido por endpoint dedicado (RF-03),
    cacheado 30d no browser.
  - **Lesson #11**: sandbox isola intent — sem "ajuda" tacita.
  - **Padrao reutilizavel**: futuras integracoes embedded (Spec 5+)
    podem reusar.
- **Contras:**
  - **postMessage protocol**: ~50 linhas novas (parent + child).
    Aceitavel.
  - **Resize dinamico**: iframe altura via `iframe.style.height = px`
    setado por message do child. ResizeObserver no child reporta
    `scrollHeight` em mount + body resize. Cap 50000px (anti-DoS).
  - **A11y**: screen readers entram em iframe via `<iframe title>`
    + ARIA region. NVDA/VoiceOver precisam de smoke test no MVP
    (best-effort, formal a11y test em Sprint Polish).
  - **Print/copy**: Ctrl+P do iframe interno vs Ctrl+P do parent —
    aceitavel pra MVP.
  - **Watermark fidelity**: overlay parent cobre iframe, mas ao
    iframe crescer (postMessage resize), watermark se redistribui
    proporcionalmente (6 posicoes em `%`). Aceitavel.
  - **postMessage XSS surface**: parent valida `event.source` e
    `event.data.type` (whitelist `grindfy:library:resize`,
    `grindfy:library:scroll`). Mensagens fora desse contrato
    ignoradas.

### Opcao C: Iframe `allow-scripts` + `allow-same-origin` (rejeitada)

Iframe ganha acesso ao DOM do parent. Permite watermark **dentro** do
iframe (nao precisa overlay externo).

- **Contras (matam):**
  - **Sem isolamento real**: JS do iframe le `parent.document.cookie`,
    `parent.localStorage` (`jwt_refresh_token` !), etc.
  - **CVE no DOMPurify** = XSS catastrofico (mesma severidade do
    cenario sem sandbox).
  - **`allow-same-origin` + `allow-scripts`** = MDN explicitamente
    recomenda EVITAR essa combinacao (sandbox virtualmente
    desativado).
- **Rejeitada por:** anula o beneficio principal do sandbox.

### Opcao D: Iframe `srcDoc` + nenhum sandbox (rejeitada)

Iframe sem atributo sandbox — comporta como aba browser separada.

- **Contras:** roda navegacao top-level, popups, formularios,
  same-origin com parent (porque srcdoc herda origem). XSS
  catastrofico.
- **Rejeitada por:** inseguro.

## Decisao

**Adotar Opcao B: iframe `<iframe sandbox="allow-scripts" srcdoc>`
para renderizar HTML rico Docari, sem `allow-same-origin`. Comunicacao
parent-child via `window.postMessage` com whitelist de tipos
(`grindfy:library:resize`, `grindfy:library:scroll`). Watermark
overlay parent. Sanitizer ADR-076 vira camada 1 (defesa em
profundidade); sandbox eh camada 2 (isolamento real).**

### Detalhes-chave

1. **Iframe sandbox flags exatos:**
   - `allow-scripts` — necessario pro JS dos flashcards/accordion.
   - **NUNCA** `allow-same-origin`.
   - **NUNCA** `allow-popups`, `allow-forms`, `allow-top-navigation`.

2. **Componente `ArticleIframe.tsx`:**
   - Hook `useQuery` busca `article-bundle` (RF-04).
   - Monta `srcdoc` via helper `buildSrcdoc(bundle, userPlatformId)`.
   - Helper escapa HTML com `escapeHtml` em campos do bundle (defesa
     contra HTML entity injection no `<title>`).
   - `iframe.style.height` controlado por state local
     `iframeHeight` (default 800px), atualizado via postMessage
     `resize`.

3. **Protocolo postMessage** (formalizado em ADR-094):
   - Parent escuta `window.addEventListener('message', handler)`.
   - Handler valida `event.source === iframeRef.current.contentWindow`.
   - Handler valida `event.data.type` em whitelist:
     - `'grindfy:library:resize'` com `payload.height: number`,
       cap 50000.
     - `'grindfy:library:scroll'` com `payload.percent: number`,
       clamp 0-100.
   - Mensagens fora desse contrato sao ignoradas silenciosamente.

4. **Child-side (`lesson.js.transformed`):**
   - `ResizeObserver` em `document.body` dispara `reportHeight()`.
   - Throttle 1s em `scroll` event dispara `reportScroll()`.
   - **NAO usa** `parent.location`, `parent.localStorage`,
     `parent.cookies`. Apenas `parent.postMessage(msg, '*')`.

5. **Watermark anti-pirataria:**
   - Componente parent `<ArticleIframeWithWatermark>`.
   - Overlay `<div class="absolute inset-0 pointer-events-none z-10">`.
   - 6 instancias diagonais com `userPlatformId` (mesmo padrao
     ADR-076).
   - `pointer-events: none` essencial — wheel/click atravessam pro
     iframe interno.

6. **CSP do parent** (`server/index.ts`):
   - `frame-src 'self'` + `child-src 'self'` (permite iframe via
     srcdoc desde que origin = self).
   - Sem mudanca em `style-src` ou `script-src` do parent (iframe
     sandbox tem CSP propria que herda padrao).

7. **A11y:**
   - `<iframe title="Aula: ${lesson.title}">` (anuncia ao screen
     reader).
   - `aria-label` com nome da aula.
   - `role="region"` no container parent.
   - **Best-effort MVP**; teste formal NVDA/VoiceOver em Sprint
     Polish.

8. **Cleanup:**
   - `useEffect` cleanup remove `'message'` listener em unmount
     (lesson #1 hooks-first; previne memory leak).

### Tradeoffs aceitos

| Tradeoff | Aceito porque |
|---|---|
| postMessage protocol +50 linhas | Padrao de mercado; <100 LOC eh manageable. |
| A11y screen reader best-effort MVP | NVDA/VoiceOver entram em iframes natively com title. Sprint Polish formaliza. |
| Watermark overlay nao se ajusta perfeitamente em iframes muito longos | 6 posicoes em % proporcionais; aceitavel. |
| postMessage XSS surface | Whitelist + event.source validation = mitigado. |
| Print/copy comportamento dual | Aceitavel — usuario expert entende. |

### Quando rever esta decisao

- **Sprint Polish** entrega NVDA/VoiceOver formal test — se falhar,
  reavaliar.
- **Conteudo extremamente longo** (curso 01 com 200+KB HTML, ~5000px
  renderizado): cap 50000px ainda confortavel (10x).
- **Backport pra Spec 5+ admin UI**: usuario edita artigo inline —
  sandbox ainda valida porque content sempre gera srcdoc novo.
- **CVE `Window.postMessage`**: padrao W3C mantido, mas validar
  `event.origin` se padrao mudar (atualmente `event.source` eh
  suficiente).

## Consequencias

### Positivas

- **XSS isolado** mesmo se sanitizer falhar.
- **Fidelidade visual 100%** do conteudo Docari preservada.
- **CSS isolado** — zero conflito com tokens shadcn.
- **Padrao reutilizavel** pra Spec 5+ embedded content.
- **Watermark anti-pirataria** preservado via overlay externo.
- **Lesson #11 respeitado** — sandbox NAO infere tags faltando.
- **Performance**: HTML servido uma vez por aula (DB read), CSS+JS
  cacheados 30d.

### Negativas

- **Componente novo** `ArticleIframe.tsx` + `ArticleIframeWithWatermark.tsx`
  (~150 LOC).
- **Protocolo postMessage** precisa documentacao + testes
  (mensagens com origin null, source validation).
- **A11y best-effort MVP** ate Sprint Polish.
- **Print/copy comportamento dual** (Ctrl+P abre dialog do iframe
  interno em alguns browsers).

### Neutras

- **Decisao revisitavel** se Spec Polish trouxer feedback a11y.
- **Lesson learned a registrar:** "iframe sandbox `allow-scripts`
  sem `allow-same-origin` = isolamento real; padrao seguro pra
  embed HTML rico de fonte trusted ou nao-trusted, especialmente
  quando ja existe sanitizer como camada 1".

## Confianca

**Alta.** Padrao MDN documented (Mozilla Developer Network — "Using
the iframe element / Sandbox"). OWASP Cheat Sheet "Browser Security
Headers / sandbox" recomenda exatamente essa configuracao para
embed de conteudo isolado. GitHub gist preview, Stack Overflow code
snippets, JSFiddle, CodePen usam o mesmo padrao em producao.

postMessage com `event.source` validation eh padrao W3C estabelecido
desde 2010. Sem `allow-same-origin`, iframe nao consegue forjar
origens — protocol seguro por construcao.

## Referencias

- **Spec:** `Docs/specs/biblioteca-spec-2.md` D1 + D2 + RF-06
- **Diagramas Mermaid:**
  - `Docs/architecture/diagrams/biblioteca-spec-2-iframe-lifecycle.mermaid`
    — state machine iframe load → resize → scroll → unload.
  - `Docs/architecture/diagrams/biblioteca-spec-2-article-bundle-flow.mermaid`
    — sequence article-bundle + iframe render.
- **ADRs relacionados:**
  - **ADR-076** — Sanitizer DOMPurify (camada 1; ainda em vigor).
  - **ADR-093** — Trusted-source bypass (deprecate parcial ADR-076
    para conteudo admin-imported).
  - **ADR-094** — Article bundle protocol (resposta + cache busting).
  - **ADR-071** — Media storage (assets staticos).
- **Lessons learned:**
  - #1 hooks primeiro (cleanup `removeEventListener` em unmount).
  - #2 data-testid (`library-article-iframe`,
    `library-article-iframe-wrapper`).
  - #11 default minimo (sandbox isola, nao infere).
- **External:**
  - MDN https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#sandbox
  - OWASP Browser Security Headers Cheat Sheet
  - W3C HTML Living Standard "the iframe element"
- **Out of scope:**
  - Spec 5+ admin UI (mesmo iframe; CMS-side sanitize).
  - SEO indexing (iframe content nao indexado por bots; aceitavel
    pra LMS pago).
  - Server-side render do HTML do artigo (over-engineering pra MVP).

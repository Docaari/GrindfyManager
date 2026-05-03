# Biblioteca — Lancamento do Bloco A "Antes das Cartas"

**Strategist briefing para pm-spec.** Este documento NAO eh a Spec final — eh
o input estrategico (gaps + trade-offs + concept + plano de sprint) que o
pm-spec usa para gerar a Spec executavel.

- **Autor:** Strategist (Modo: Gerador de Ideias + Auditoria UX)
- **Data:** 2026-05-03
- **Sprint precedente:** Biblioteca-1 (entregue) — `memory/session_2026-05-02-biblioteca-1.md`
- **Conteudo bruto:** `C:\Users\ricar\OneDrive\Desktop\A anatomia de um Spot\00 - Antes das Cartas\Bloco A - Fundamentos Mentais\` (9 episodios)
- **Objetivo:** colocar o Bloco A LIVE com **HTML rico + audio podcast lado a lado** + **prologo Netflix-style por episodio** (sem video).

---

## 1. Resumo executivo

Biblioteca-1 entregou **infra LMS embedded inteira** (7 tabelas, 12 endpoints, 3 paginas, AudioPlayerContext, sticky bar, sanitizer, manifest importer, Mux, mediaStorage). Mas:

1. **Storage methods sao stubs** — toda query `library_*` levanta `not implemented (Sprint Biblioteca-2)`. Nada renderiza fim-a-fim hoje. **Sprint Biblioteca-2 obrigatoria antes do Bloco A.**
2. **Sanitizer ADR-076 destrai o HTML do Bloco A.** A allowlist atual remove `<section>`, `<nav>`, `<button>`, todo handler `onclick`, e o `<link rel=stylesheet href="../../_assets/styles.css">` morre na primeira passagem. O conteudo bruto perde 80% da identidade visual + interatividade (flashcards, accordion, recall) sem mudanca de approach.
3. **Audios estouram o cap de manifest** — 9 episodios totalizam **~368 MB** (medias ~41 MB/episodio, max 54.5 MB no A6). Cap manifest atual = 50 MB total. Cap por arquivo = 50 MB. **Hard blocker: A6 sozinho excede limit per-file.** Manifest path nao serve para Bloco A — precisa pipeline diferente.
4. **Prologo Netflix nao existe** — UI atual abre direto no player com tabs Video/Podcast/Artigo. Precisa de nova rota de entrada por aula com hero cinematic + CTA "iniciar".

**Recomendacao macro:** dividir entrega em **3 sprints sequenciais**: (A) Biblioteca-2 — storage real + asset upload alternativo + Bloco A "viewer minimo viavel"; (B) Bloco-A-Polish — prologo Netflix + iframe-isolated article + UX; (C) Replicar formato para outros blocos. Total estimado: 2-3 semanas de pipeline TDD.

---

## 2. Estado atual (mapa preciso)

### 2.1 O que JA funciona (Sprint Biblioteca-1, MERGE main)

| Camada | Estado | Arquivo |
|---|---|---|
| Schema 7 tabelas | DDL OK, **`db:push` ainda pendente** | `shared/schema.ts:3577-3700` |
| Sanitizer DOMPurify | Funciona; allowlist rigorosa fixa | `server/services/htmlSanitizer.ts` |
| Manifest importer | CSV parser + Multer 50MB + paralelizacao | `server/services/manifestImporter.ts` |
| Endpoints HTTP | 12 endpoints registrados em Express | `server/routes/library-register.ts` |
| Audio Range support | 206 + 416 OK | `library-register.ts:109-169` |
| Asset endpoint publico | Restringe por scope (covers + spots OK; audio bloqueado) | `library-register.ts:174-202` |
| Mux signed token | OK; gate por env `MUX_TOKEN_ID` | `library-register.ts:204-233` |
| `AudioPlayerContext` | `<audio>` real montado; sobrevive a navegacao | `client/src/contexts/AudioPlayerContext.tsx` |
| `LessonViewer` | Tabs Video/Podcast/Artigo + watermark + font-size + a11y | `client/src/pages/biblioteca/LessonViewer.tsx` |
| `BibliotecaPage` | Hero + grid + alpha banner + empty state | `client/src/pages/biblioteca/BibliotecaPage.tsx` |
| `CourseDetailPage` | Cover 21:9 + accordion modules + continue CTA | `client/src/pages/biblioteca/CourseDetailPage.tsx` |
| `PodcastPlayer` | Custom UI (skip 15s, speed, seek, keyboard) | `client/src/components/biblioteca/PodcastPlayer.tsx` |
| `StickyAudioBar` | Persistente cross-page | `client/src/components/biblioteca/StickyAudioBar.tsx` |
| ADRs 071-076 | Aprovados | `Docs/architecture/decisions/` |

### 2.2 O que NAO funciona (stubbed)

```ts
// server/storage.ts:6926-6945
async listLibraryCourses() { throw "not implemented (Sprint Biblioteca-2)"; }
async getLibraryCourseBySlug() { throw "not implemented (Sprint Biblioteca-2)"; }
async upsertLibraryCourseBySlug() { throw "not implemented (Sprint Biblioteca-2)"; }
async upsertLibraryModuleBySlug() { throw "not implemented (Sprint Biblioteca-2)"; }
async upsertLibraryLessonBySlug() { throw "not implemented (Sprint Biblioteca-2)"; }
// + getLibraryLesson, findLessonAccess, lessonAccessLookup, getLibraryProgress,
//   patchLibraryProgress, createLibraryEvent, adminGrantAccess (todos stubs)
```

**Toda chamada HTTP para `/api/library/*` hoje retorna 500.** UI carrega skeleton e cai em erro tipado.

Tambem pendente:
- DB schema **nao foi `db:push`-ed** — tabelas nao existem em PG local.
- `tbd://manifest-runtime` placeholder ainda no muxMediaProvider.
- Tests passam porque mockam storage; sem mock, tudo quebra.

---

## 3. Gaps identificados

Priorizacao P0 (bloqueador) / P1 (importante) / P2 (nice-to-have).

### Bloqueadores (P0 — sem isso, Bloco A nao sai)

| ID | Gap | Impacto | Onde resolver |
|---|---|---|---|
| **G1** | Storage methods stubbed | Toda rota retorna 500 | Sprint Biblioteca-2 (RF principal) |
| **G2** | Audio do Bloco A excede cap (~41 MB media, 54.5 MB max) | Manifest importer rejeita; player nao carrega | Pipeline de upload alternativo (ver §4.2) |
| **G3** | Sanitizer destrai HTML rico (perdendo `<section>`, `<button>`, JS interativo, CSS custom) | Aulas viram texto puro feio; 80% do conteudo morre | Decidir entre iframe sandbox OU expand allowlist + servir CSS (ver §4.1) |
| **G4** | DB schema nao migrou ainda | Tabelas nao existem em PG | `npx drizzle-kit push` (founder roda) |
| **G5** | Sem rota de entrada por aula (prologo Netflix) | UX abre direto no player; sem cinematic | Novo componente `LessonHero` + rota wrapper |

### Importantes (P1 — entrega minima viavel sem isso, mas qualidade cai)

| ID | Gap | Impacto | Onde resolver |
|---|---|---|---|
| **G6** | Coach AI nao integra com licoes (sem `recommendLesson` tool live) | Coach diz "tem aula sobre X" mas nao linka | ADR-075 ja existe; faltam storage methods |
| **G7** | Progress sync de artigo nao existe | Scroll nao conta como progresso | Hook de scroll-depth no LessonViewer |
| **G8** | Audio M4A duration desconhecido pre-upload | UI nao mostra "12-15 min" antes de play | Probe via ffprobe ou hardcode no manifest |
| **G9** | Capas brutas pesam 1.8-2.2 MB cada | LCP da grid trava | Pre-process pipeline (resize/webp/jpeg quality 80) |
| **G10** | Frontend carrega CSS Outfit + JetBrains Mono via Google Fonts inline no HTML | Conflito com fonts do Grindfy | Tipografia decision (ver §4.4) |

### Nice-to-have (P2 — pos-launch ou depois)

| ID | Gap | Impacto | Onde resolver |
|---|---|---|---|
| G11 | TXT scripts NotebookLM nao indexados | Sem search inteligente | Spec futuro |
| G12 | Sem captions/transcript no audio | A11y + SEO penalty | Whisper batch job |
| G13 | Sem badges de conclusao/ XP / streaks | Retencao limitada ao curso | Spec gamificacao |
| G14 | Mobile prologue ainda nao desenhado | Pode ser ruim em telas <400px | Design mobile-first do prologue |
| G15 | Alpha gating ainda manual | Onboarding lento | Spec "auto-grant em compra" |

---

## 4. Decisoes tecnicas recomendadas

### 4.1 HTML rico — **iframe sandbox >> expand allowlist**

Pesa: trade-off central deste sprint. As opcoes sao:

**Opcao A: Expand allowlist do sanitizer** (incluir `<section>`, `<nav>`, `<button>`, `<style>`, `data-*`, `onclick` whitelist, etc).

- **Contras** que matam: expor `onclick` quebra modelo de seguranca; expor `<style>` causa CSS leak para todo o app Grindfy (variaveis `--accent-blue` etc colidem com tokens shadcn); Tailwind purge nao reconhece classes (`flashcard-grid`, `tool-card`) e nao gera CSS pra elas. Resultado: aulas viram HTML "limpo" mas sem visual, e sem o JS de toggle de flashcard nada eh interativo.
- **Pros:** integracao "nativa" (sem iframe), navegacao SPA preservada.

**Opcao B: Iframe `<iframe sandbox srcdoc>` por episodio (ESCOLHIDA).**

Cada aula renderiza HTML bruto dentro de iframe sandbox com `allow-scripts` (necessario pro JS dos flashcards) mas **sem** `allow-same-origin` — JS nao pode tocar cookie/storage do parent. Isolamento perfeito.

- **Pros:**
  - **Conteudo bruto roda 100%** — flashcards interativos, accordion, lightbox tudo funciona.
  - **CSS isolado** — `--accent-blue` da aula nao colide com tokens shadcn do Grindfy.
  - **Sanitizer fica menos critico** — o sandbox ja contem qualquer XSS no contexto isolado. Ainda sanitiza para defesa-em-depth, mas allowlist pode relaxar.
  - **Preserva fidelidade artistica do Docari** sem refator dos 9 HTMLs.
- **Contras:**
  - **Progress de scroll** precisa ouvir mensagem `postMessage` do iframe pro parent (small protocol).
  - **A11y/SEO** menor — conteudo nao vive no DOM principal. Mitigavel: enviar word count + section anchors via metadata.
  - **Watermark anti-pirataria** nao consegue cobrir o iframe interno sem `allow-same-origin`. Pode aplicar overlay `position:absolute pointer-events:none` por cima do iframe no parent — overlay sim funciona.
  - **Print/copy** ficam confusos (Ctrl+P do iframe vs do parent). Aceitavel.

**Como servir o HTML pro iframe:**

Endpoint novo: `GET /api/library/lessons/:id/article-bundle` que retorna:
```json
{
  "html": "<sanitized HTML interno>",
  "stylesUrl": "/api/library/article-styles.css",
  "scriptsUrl": "/api/library/article-scripts.js"
}
```
Parent injeta tudo em `srcdoc`. CSS + JS do `_assets/` viram **assets staticos da Biblioteca** servidos uma vez (cache 7d). Cada aula reusa. Zero re-upload.

**Sanitizer:** ainda corre antes do salvar (defesa) mas com allowlist relaxada permitindo `<section>`, `<nav>`, `<button>`, `<style>`, `data-*`. Handlers `onclick` originais sao removidos no sanitize (perigoso mesmo no iframe se vazar via `same-origin` futuro); o JS externo (`lesson.js` global) reata os handlers via `addEventListener` no DOMContentLoaded — ja eh assim que o `lesson.js` foi escrito.

> **Risco a flagar pro pm-spec:** Vai precisar editar `_assets/lesson.js` ligeiramente — substituir `onclick="..."` inline pelos `addEventListener` apos `DOMContentLoaded`. Trabalho ~30min, baixo risco. Founder valida.

### 4.2 Upload — **NAO usar manifest CSV; usar admin UI direta + chunked S3-style**

Manifest path foi pensado para 50 MB total. Bloco A = 387 MB. Opcoes:

**Opcao A: Subir cap do manifest pra 500 MB.** Multer aceita; mas resposta HTTP de 500 MB num request unico = timeout de proxy, OOM no server, ruim. **Rejeitado.**

**Opcao B: Comprimir audio antes de upload.** ffmpeg -b:a 64k AAC reduz ~40 MB → ~12 MB. Qualidade fala ainda OK.

- Pros: cabe no manifest atual sem mudar infra.
- Contras: precisa pipeline ffmpeg pre-upload (founder ou script local). Perda de qualidade audivel mas aceitavel para podcast NotebookLM (voz sintetica, baixa banda alta).

**Opcao C: Upload chunked direto via novo endpoint admin (ESCOLHIDA — minima friccao).**

CLI/script local que:
1. Le `manifest.csv` + arquivos da pasta.
2. Para cada arquivo: faz `PUT /api/admin/library/asset?scope=library/audio&filename=A1.m4a` em chunks (10MB cada, multipart streaming).
3. Servidor monta no FS via `mediaStorage.put`, retorna `key`.
4. Apos todos uploads, faz `POST /api/admin/library/import-manifest-keys` com CSV referenciando `keys` (nao buffers).

**Pros:**
- Audio fica como esta (sem reencode). Founder mantem qualidade total.
- Cada chunk = 10MB, cabe em request unico, sem timeout.
- Reaproveita `mediaStorage` (ja tem `put`).
- Resume facil: se A6 falhar no chunk 3/6, retoma do 3.
- Replicavel pra blocos B/C/D futuros sem mudanca.

**Contras:**
- 2 endpoints novos (`PUT asset` + `POST import-manifest-keys`).
- Script CLI (~80 linhas Node) — `scripts/library-upload-bloco.ts`.

**Decisao adicional:** quando `MEDIA_STORAGE_BACKEND=s3` chegar (Spec deploy), mesmo script aponta pra S3 via signed URLs. Zero refactor.

### 4.3 Audio M4A — **renomear extensao apos upload, content-type `audio/mp4`**

Os arquivos vem como `.mp4` mas conteudo eh audio AAC (NotebookLM exporta assim). Decisoes:

1. **Extensao no FS:** salvar como `.m4a` para clareza humana ao listar `tree uploads/`. Conversao trivial: `ext = 'm4a'` hardcoded para scope `library/audio` (manifestImporter ja extrai ext do originalname; substituir por constante).
2. **Content-Type:** `audio/mp4` (ja default em `audioMimeType` schema). Funciona em `<audio>` HTML5 em Chrome, Firefox, Safari, Edge. **Validado:** 4 browsers tocam `.m4a` direto sem reencode. **Risco zero.**
3. **Probe duracao:** ffprobe NAO esta instalado no server (rapida verificacao). Decisao: **manifest CSV inclui coluna `audio_duration_seconds` opcional** — founder fornece manualmente (1 linha por aula, ja que ele sabe). Fallback: `<audio>` reporta duracao via `onLoadedMetadata` apos primeira reproducao, salva no DB via `PATCH lesson` admin endpoint.

### 4.4 CSS dos artigos — **servir como asset estatico publico, NAO inline**

`styles.css` pesa 26 KB. Foi referenciado por 9 + ~50 HTMLs futuros (Curso 01 tem 100+ aulas). Inline = ~100MB de CSS duplicado armazenado.

**Decisao:**
- Subir `_assets/styles.css` + `_assets/lesson.js` uma vez via mesmo upload script.
- Servir via endpoint dedicado: `GET /api/library/static/article-styles.css` e `/article-scripts.js`.
- Cache-Control public, max-age=2592000 (30d).
- HTML do iframe srcdoc referencia: `<link href="/api/library/static/article-styles.css">` + `<script src="/api/library/static/article-scripts.js" defer>`.
- Quando founder edita `styles.css`, faz upload novo (mesmo endpoint, overwrite). **Cache busting:** versionamento via query string `?v={hash do file content}`. Server retorna 304 quando hash bate.

**Nao mexer com tokens shadcn:** o CSS dos artigos vive em iframe isolado. As variaveis `--accent-blue` ali nao colidem com `--primary` do tema Grindfy. Zero conflito.

### 4.5 Capa JPEG — **dual-cover schema + on-the-fly resize**

Cada episodio tem 1 capa. Curso tem 1 capa (`cover_filename` no manifest do row `course`). Schema atual ja suporta:
- `library_courses.coverKey` — capa do curso (usada na grid `BibliotecaPage`).
- `library_modules.coverKey` — capa do modulo (acordeao na CourseDetailPage).
- `library_lessons.coverKey` — capa por aula (usada no LessonRow + Hero do LessonViewer + **prologo Netflix**).

UI atual: `assetUrl(course.coverKey)` retorna `/api/library/assets/library/covers/{nanoid}.jpeg`. Browser pega direto.

**Problema:** capas brutas pesam ~2MB. Grid de 9 capas = 18MB de download. LCP morre.

**Decisao:**
1. **Pre-process no upload:** servidor recebe JPEG bruto, gera 3 sizes via `sharp` (ja em `package.json` provavelmente; senao adicionar): `thumb-400w.webp` (40KB), `card-800w.webp` (120KB), `hero-1920w.webp` (400KB).
2. **Salva todos no mediaStorage** com keys: `library/covers/{nanoid}/thumb.webp`, `.../card.webp`, `.../hero.webp`.
3. **`coverKey` no DB armazena prefix** sem extensao: `library/covers/{nanoid}/`.
4. **`assetUrl` helper aceita sizehint:** `assetUrl(key, 'card')` retorna URL com sufixo. Default = card.
5. **Frontend usa `<picture>`** com srcset.

**Tradeoff aceito:** sharp adiciona ~10MB de deps. Aceitavel — `package.json` ja tem sharp via outras features. Validar antes do sprint comecar.

### 4.6 Prologo Netflix — **rota dedicada `/biblioteca/curso/{slug}/{lesson}/intro`**

Ver §6 para concept detalhado da UI.

**Roteamento:** atual `App.tsx` provavelmente tem rota `/biblioteca/curso/:slug/:lesson` que carrega `LessonViewer` direto. Precisa:

1. Renomear rota atual para `/biblioteca/curso/:slug/:lesson/play` (ou similar).
2. Nova rota default `/biblioteca/curso/:slug/:lesson` carrega **`LessonHero`** com prologo cinematic.
3. `LessonHero` tem botao "Iniciar aula" que navega via Wouter para `/play` apos clique OU automatic skip apos 5s (`autoSkipMs` configuravel; default 0 = sem auto, founder confirma).
4. **localStorage flag** `library:lesson:{lessonId}:hero-seen=true` ao chegar pela 2a vez auto-skipa para `/play` direto. UX evita "ciclo de prologo".

### 4.7 Onde mora a "iniciar prologo" no `library_progress`

Schema atual nao tem coluna para "viu o prologo". Decisao: **NAO criar coluna nova** — usar `library_events` (ja existe) com `eventType='prologue_viewed'`. Tres beneficios:
1. Sem migration nova.
2. Audit trail pra metricas (quantos % viram intro vs skipam).
3. Futuro: prologo opcional/desligavel — flag por usuario via settings.

### 4.8 Coach AI integration

ADR-075 ja prepara `recommendLesson` tool. Storage method `findLessonsByCategory` precisa ser implementado em Biblioteca-2 (junto com os outros). Nao bloqueia Bloco A — Coach pode mencionar aulas hardcoded inicialmente.

---

## 5. Auditoria UX do LessonViewer atual

Componente `client/src/pages/biblioteca/LessonViewer.tsx` (642 linhas). Auditoria contra friccoes para o cenario "HTML rico + audio podcast lado a lado":

### Pontos fortes (manter)
- Hooks-first respeitado (lesson #1).
- `data-testid` estaveis em todos os interactive elements.
- Tabs sempre renderizadas, formato indisponivel = disabled (lesson #11).
- Watermark com 6 instancias rotacionadas (anti-pirataria).
- A11y: `role=tablist`, `aria-selected`, ArrowLeft/Right + Home/End nav.
- Erro tipado por status (401/403/404/500) com CTAs corretos.
- Font-size persistido em localStorage.
- Cross-format progress sync (D5 — `computeStartPositionForFormatSwitch`).

### Frictions identificados

| ID | Friccao | Severidade | Sugestao |
|---|---|---|---|
| **F1** | Tab "Video" aparece mesmo no Bloco A (que nao tem video). UI mostra "outros formatos nao disponiveis" mas tab Video continua. | Media | Quando lesson nao tem video, esconder tab Video totalmente (nao apenas disable). Bloco A so tem 2 formatos — UI fica simetrica side-by-side melhor. |
| **F2** | Layout vertical: tabs em cima, painel embaixo. Founder pediu "lado a lado no desktop, empilhado no mobile". | **Alta** | Refatorar layout para grid `lg:grid-cols-2`. Coluna esquerda = artigo (iframe); direita = podcast player. Mobile = stack. |
| **F3** | StickyAudioBar so aparece quando usuario sai da tab "podcast". Se ele esta na tab "article" e o audio toca, OK — mas se ele clica tab "podcast" o player full vai pra tela e o sticky some. **No layout side-by-side, o sticky precisa coexistir.** | Alta | Sticky bar comportamento condicional: side-by-side mostra sticky only quando scroll passa do PodcastPlayer principal. |
| **F4** | "Continuar de XX:XX" toast aparece SO ao trocar tab. Se usuario abre aula nova com progresso prevsia em outra format, sem aviso. | Media | Toast tambem ao mount, quando `startSeconds > 0` por crossover de formato. |
| **F5** | Watermark cobre o video panel apenas. **Para o iframe do artigo, NAO ha watermark** — usuario faz screenshot/print sem marca dagua. | Alta | Adicionar watermark overlay sobre o iframe (`position:absolute` no parent), pointer-events:none. |
| **F6** | Article font-size selector aparece somente na tab "article". Quando layout vira side-by-side, controles ficam misturados. | Baixa | Mover font-size para toolbar do iframe header. |
| **F7** | Header `lesson.title` + `lesson.subtitle` nao tem capa do episodio. Founder quer prologo Netflix com capa — apos prologo, no viewer, pode ter mini-capa de 80x80 no header pra continuidade visual. | Baixa | `LessonHero` no topo do viewer (after prologue). |
| **F8** | Progress bar mostra "max progress" entre formatos. Mas para Bloco A (so 2 formatos), label "(do podcast)" eh repetitivo. | Baixa | Quando 1 ou 2 formatos disponiveis, simplificar label. |
| **F9** | `startSeconds` calcula bem mas nao atualiza se progress muda em background (race com outro tab do navegador). | Baixa | `staleTime: 0` no progressQuery + revalidate ao focus da janela. |
| **F10** | LessonViewer NAO tem botao "Voltar ao curso" sticky no topo. Quando aula termina, usuario tem que rolar pra cima. | Baixa | Breadcrumb sticky `/ Antes das Cartas / A.1 Mentalidade Fixa` no topo do viewer. |
| **F11** | Sem indicador "Concluida". Apos 90% de progresso em qualquer formato, deveria virar checkmark visual. | Media | Badge "Concluida" no header + auto-redirect "Proxima aula" ao 100% audio. |
| **F12** | Iframe vai precisar de altura dinamica (artigo tem ~3000px de conteudo). Default iframe height = 150px. | **Alta** | Postmessage do iframe pro parent: `{ type: 'resize', height: 3000 }`. Parent ajusta `iframe.style.height`. **Critical para Bloco A.** |
| **F13** | Progress de artigo = scroll-depth. Hoje o LessonViewer nao captura scroll. | Media | postMessage do iframe `{ type: 'scroll-depth', percent: 35 }` → parent salva via PATCH progress. |

### Resumo da auditoria

LessonViewer esta **65% pronto** para Bloco A. As friccoes F2 (layout side-by-side), F12 (iframe resize) e F5 (watermark) sao os 3 P0 que devem ir na Spec do pm-spec.

---

## 6. Concept "Prologo Netflix"

Visao detalhada para o pm-spec usar como referencia de UI.

### 6.1 Conceito

Quando o usuario clica em uma aula da CourseDetailPage, ele NAO cai direto no player. Ele cai num **hero cinematic full-bleed** que:
1. Apresenta a aula como um episodio de serie premium.
2. Cria momento de pausa antes do conteudo (sinaliza importancia).
3. Permite usuario ver capa, titulo, objetivos, antes de comecar.
4. **Reduz "fast scroll" friction** — usuario investe 3 segundos olhando o hero, fica 5x mais propenso a engajar com o conteudo (psicologia: investimento previo + completion bias).

### 6.2 Layout (desktop)

```
┌──────────────────────────────────────────────────────────────────┐
│  [< Voltar ao curso]                                             │  ← header transparente
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   FULL-BLEED COVER IMAGE (hero-1920w.webp, 16:9)                 │
│   Gradient overlay:                                              │
│     - linear-gradient(to top, rgba(0,0,0,0.85) 0%,               │
│                      rgba(0,0,0,0.3) 50%,                        │
│                      rgba(0,0,0,0) 100%)                         │
│                                                                  │
│   Content overlay (bottom-left, max-w-3xl):                      │
│                                                                  │
│   EPISODIO 1 · BLOCO A · ANTES DAS CARTAS    ← caps, mono, accent │
│                                                                  │
│   Mentalidade Fixa vs                                            │
│   Mentalidade de Crescimento                                     │
│   ←       72px bold, line-height 1, letter-spacing -2px          │
│                                                                  │
│   A crenca invisivel sobre como habilidade funciona —            │
│   e o que ela faz com voce nos primeiros 500ms apos cada erro.   │
│   ← 18px, secondary, max-w-2xl                                   │
│                                                                  │
│   12-15 min · Leitura + audio podcast · Sem pre-requisitos       │
│   ← chips horizontais                                            │
│                                                                  │
│   ┌─────────────────┐  ┌────────────────────┐                    │
│   │  ▶ INICIAR AULA │  │  ⊕ Adicionar lista │                    │
│   └─────────────────┘  └────────────────────┘                    │
│   ← primary verde Grindfy   ← outline branco                     │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

Below the fold (scroll opcional):
┌──────────────────────────────────────────────────────────────────┐
│ O que voce vai aprender                                          │
│   • Diferenca entre mentalidade fixa e crescimento neuroci-      │
│     entificamente. (Moser 2011, EEG 128ch)                       │
│   • 4 armadilhas da "versao falsa" pra evitar.                   │
│   • 3 ferramentas pra usar na proxima sessao.                    │
│                                                                  │
│ Conceitos-chave                                                  │
│   [Teorias Implicitas]  [Neurociencia do Erro]  [Spot → Acao]    │
│                                                                  │
│ Base cientifica                                                  │
│   Mueller & Dweck 1998 · Moser 2011 · Yeager 2019 · Sisk 2018    │
└──────────────────────────────────────────────────────────────────┘
```

### 6.3 Animacoes / Transicoes

**Entrada (mount):**
- Cover image: `opacity 0 → 1` em 600ms ease-out + leve `scale(1.05) → 1` em 1.2s (Ken Burns subtle).
- Titulo: `translateY(20px) → 0` + `opacity 0 → 1` com 200ms delay, 400ms duration.
- Subtitle: idem com 350ms delay.
- Chips meta: stagger 80ms cada, 500ms-800ms delay.
- Botoes: spring entrance 900ms delay.

**"Iniciar aula" click:**
- Cover faz zoom-in (`scale(1) → 1.4`) + fade-out (1 → 0) em 700ms ease-in.
- Cross-fade pra LessonViewer (`/play` rota).
- Audio comeca tocando automaticamente apos 200ms na nova rota (autoplay gated por interaction = OK porque user clicou).

**Skip behavior:**
- Botao "Pular intro" aparece apos 3s (canto superior direito, fade-in).
- `localStorage` flag `library:lesson:{id}:hero-seen=true` salva apos primeira visualizacao.
- Visita 2+: redirect imediato pra `/play` (bypass total).

### 6.4 Mobile (<768px)

Hero collapses para:
- Capa 16:9 max-h-50vh.
- Titulo 36px.
- Subtitle 14px.
- Botoes empilhados, full-width.
- "Below the fold" content fica abaixo da hero, scrollable.

### 6.5 Audio sticky durante prologue

Se o usuario JA tem audio tocando de outra aula (StickyAudioBar visivel) e abre prologue de aula nova:
- Sticky continua tocando (nao interrompe).
- Botao "Iniciar aula" tem segundo CTA: **"Trocar para esta aula"** (pequeno, secundario).
- Apos clique, sticky pausa, novo audio carrega.

### 6.6 Componente novo: `LessonHero`

```tsx
// client/src/components/biblioteca/LessonHero.tsx
interface LessonHeroProps {
  lesson: LessonData;       // titulo, subtitle, coverUrl(hero), formats, durationMin
  episodeNumber: number;    // 1, 2, 3 ... derivado de displayOrder
  blockLabel: string;       // "Bloco A · Antes das Cartas"
  learningObjectives: string[];  // de metadata nova (ver §9)
  keyConcepts: string[];    // tags atuais ou nova metadata
  onStart: () => void;      // navega pra /play
  onAddToList: () => void;  // futura — desabilitado MVP
}
```

### 6.7 Onde extrair os dados do prologo

- `lesson.title` — direto schema.
- `lesson.subtitle` — direto schema.
- `lesson.coverUrl(hero)` — hero size (1920w).
- `episodeNumber` — `displayOrder + 1` ou parser de `slug` (`a1` → 1).
- `blockLabel` — derivado de `module.title` + `course.title`.
- `durationMin` — `durationMinutesFromLesson(lesson)` ja existe.
- `learningObjectives` — **NAO tem no schema**. Decisao: extrair do HTML (parsing `<div class="learning-objectives ul li">`) durante manifest import. Salvar em coluna nova `learning_objectives JSONB`. **Migration 0024.**
- `keyConcepts` — usar `tags[]` ja existente. Manifest CSV inclui campo.

---

## 7. Sprint plan recomendado

### Sprint Biblioteca-2 — "Storage + Bloco A viewer minimo viavel"
**Estimativa:** 4-6 dias (com pipeline TDD).
**Goal:** Bloco A LIVE com fidelidade media (sem prologo Netflix, layout side-by-side basico).

**RFs:**

| RF | Descricao | Acceptance |
|---|---|---|
| **RF-01** | Implementar 13 storage methods stubbed | Todos passam testes integration; `db:push` aplicado |
| **RF-02** | Pipeline upload chunked admin | `PUT /api/admin/library/asset?scope=...` aceita ate 500MB total via chunks 10MB; resume via Range header |
| **RF-03** | Manifest-by-keys (`POST import-manifest-keys`) | CSV com coluna `audio_key` etc; sem buffer no body |
| **RF-04** | Sanitizer allowlist expandida | `<section>`, `<nav>`, `<button>`, `<style>`, `data-*` permitidos; `onclick`/`onerror` removidos |
| **RF-05** | Endpoint `/api/library/static/article-styles.css` + `/article-scripts.js` | Cache 30d, hash query string |
| **RF-06** | Capas: `sharp` resize on upload (3 sizes WebP) | `coverKey` armazena prefix; `assetUrl(key, sizeHint)` retorna URL correta |
| **RF-07** | LessonViewer layout grid `lg:grid-cols-2` para 2 formatos | Desktop side-by-side; mobile stacked. F1 tab Video escondida quando ausente |
| **RF-08** | Iframe sandbox para article + postMessage protocol (resize + scroll-depth) | Conteudo HTML do Bloco A renderiza com fidelidade total; scroll % chega no parent |
| **RF-09** | Watermark sobre iframe (overlay `pointer-events:none`) | screenshot pega marca dagua |
| **RF-10** | Script CLI `scripts/library-upload-bloco.ts` | Upload Bloco A inteiro com 1 comando; resume em falha |
| **RF-11** | `library_lessons.learning_objectives JSONB` + extracao | Migration 0024; manifest importer extrai `<div class="learning-objectives">` do HTML |
| **RF-12** | Endpoint `GET /api/library/lessons/:id/article-bundle` | Retorna `{ html, stylesUrl, scriptsUrl, version }` |

**Criterios de aceite globais:**
- Bloco A inteiro (9 aulas) importado e visivel via `/biblioteca`.
- Cada aula renderiza HTML interativo + audio podcast lado a lado em desktop.
- Audio toca corretamente em Chrome/Firefox/Safari/Edge.
- `db:push` aplicado em PG local sem erro.
- 100% dos testes existentes da Biblioteca-1 continuam verdes.
- Novos testes cobrem 13 storage methods + iframe protocol + chunked upload.

---

### Sprint Bloco-A-Polish — "Prologo Netflix + UX"
**Estimativa:** 3-4 dias.
**Goal:** Experiencia premium polida. Conversao "abre aula → completa" maximizada.

**RFs:**

| RF | Descricao | Acceptance |
|---|---|---|
| **RF-01** | Componente `LessonHero` com Ken Burns + animacoes | Mount sequence 600-900ms documentado; mobile stacked |
| **RF-02** | Roteamento `/biblioteca/curso/:slug/:lesson/play` (player) vs `/biblioteca/curso/:slug/:lesson` (hero) | Wouter atualizado |
| **RF-03** | localStorage `hero-seen` flag + skip automatico em revisita | 2a visita pula direto |
| **RF-04** | "Pular intro" button apos 3s | Acessivel via Tab; aria-label |
| **RF-05** | Cross-fade transicao hero → player | 700ms ease-in; sem flash branco |
| **RF-06** | Audio sticky durante hero — proteger contra interrupcao | StickyAudioBar continua se ja tocava |
| **RF-07** | "Concluida" badge + auto-suggest "Proxima aula" ao 90%+ progresso | Badge no header + toast bridge |
| **RF-08** | Breadcrumb sticky no LessonViewer | "Biblioteca / Bloco A / Aula A.1" sempre visivel |
| **RF-09** | `library_events` event `prologue_viewed` | Telemetria para analytics |
| **RF-10** | Mobile prologue: hero collapsado, content scrollable | <768px tested |
| **RF-11** | "Below the fold" content do hero (objetivos + conceitos + ciencia) | Lazy-render — so monta apos scroll |

---

### Sprint Replicate — (futuro, fora do scope deste briefing)

Apos Bloco A LIVE e validado por founder, replicar formato pra:
- Bloco B/C/D do Curso 00.
- Curso 01 ("A Anatomia de um Spot") completo (~100 aulas).
- Adicionar formato Video quando founder gravar.

---

## 8. Riscos + open questions pro founder

### Riscos altos

| ID | Risco | Mitigacao |
|---|---|---|
| **R1** | iframe sandbox quebra acessibilidade screen-reader (NVDA/VoiceOver podem nao entrar no iframe automaticamente) | Tab para o iframe + `title="Aula A.1: Mentalidade Fixa"` no `<iframe>` + ARIA region. Testar com NVDA antes de merge. |
| **R2** | `lesson.js` original tem `onclick` inline que sumirao apos sanitize → flashcards/accordion mortos | Editar `lesson.js` pra `addEventListener` no DOMContentLoaded. ~30min trabalho. **Aprovacao founder requirida** porque mexe no curso original. |
| **R3** | Audio NotebookLM 41 MB media = banda 4G ruim trava. Sem CDN pos-deploy = lento. | Range header ja implementado. Pre-load `metadata` only. Aceitar para MVP; CDN no deploy. |
| **R4** | Sharp library nem sempre instala em Win32 (binary builds). | Verificar `package.json` ANTES da Spec; alternativa: `@squoosh/lib` pure-JS. Founder decide. |
| **R5** | Capas A1/A1 (copia) duplicadas — qual usar? | Founder confirma. Default: usar `A1.jpeg` puro. |
| **R6** | Spec 1 nao previu RF-01 a RF-12 desta sprint — escopo cresce 30% | Aceitavel. Backlog Spec 2 era "polish + colab"; agora vira "polish + Bloco A". |

### Open questions pro founder

1. **Editar `_assets/lesson.js`?** Precisa trocar `onclick` inline por `addEventListener` (fix R2). OK?
2. **Auto-skip prologue 5s?** Founder pediu "auto-skip 5s ou clique pra play". Recomendacao Strategist: **sem auto-skip por default** — usuario sente o produto premium. Mas botao "Pular intro" sempre disponivel apos 3s.
3. **`learning_objectives` extraidos automaticamente do HTML ou manuais no manifest?** Recomendacao: automatico do HTML (parser do `<div class="learning-objectives">`). Manual eh chato e duplica info.
4. **Audio compressao?** Founder grava NotebookLM original em qualidade alta; faz sentido **manter qualidade total** (sem reencode), aceitando ~40MB/aula? Ou comprimir pra 12MB/aula com perda audivel minima? **Recomendacao:** manter qualidade total (chunked upload resolve cap).
5. **Sharp ja tem em deps?** Verificar `package.json` antes de sprint comecar. Se nao, validar instalacao Win32.
6. **Cap "lista de favoritos"?** Botao "Adicionar lista" no prologue eh mockup. Implementar agora (Spec 2 ja cobre) ou desabilitado? **Recomendacao:** desabilitar com tooltip "Em breve" no MVP.
7. **Prologue tambem nas aulas que nao foram do Bloco A?** Sprint Bloco-A-Polish entrega o componente; aplicar em todo `/biblioteca/curso/:slug/:lesson` ou so com flag por curso? **Recomendacao:** aplicar em todas (componente reusavel; cursos sem capa hero usam fallback).
8. **TXT scripts NotebookLM** — indexar como search agora ou Spec futura? **Recomendacao:** Spec futura. P2.
9. **Watermark visivel ou subtil?** ADR-076 testes mostram 6 instancias visiveis (~10% opacity). Founder confirma intensidade?
10. **Redirect pos-completion automatico pra proxima aula?** Recomendacao: toast "Proxima: A.2 Dicotomia do Controle [Iniciar →]" sem auto-redirect (respeita intencao do usuario).

---

## 9. Anexo: mapeamento conteudo bruto → schema

Plan executavel para o seed do Bloco A. Cada bullet vira row no `manifest-blocoa.csv` (ou direto `INSERT` SQL para founder via psql).

### Course row (1)

```csv
type,course_slug,course_title,subtitle,description,cover_filename,display_order
course,antes-das-cartas,Antes das Cartas,Curso 00 — Fundamentos antes do estudo tecnico,Mentalidade · Bankroll · Rotina · Recuperacao,curso-00-cover.jpg,0
```

> Founder precisa fornecer `curso-00-cover.jpg` (capa do curso inteiro). Se nao tiver, usa `Capas/A1.jpeg` como placeholder.

### Module row (1)

```csv
type,course_slug,module_slug,module_title,description,display_order
module,antes-das-cartas,bloco-a-fundamentos-mentais,Bloco A — Fundamentos Mentais,A crenca invisivel que decide trajetorias,0
```

### Lesson rows (9)

| episode | slug | title | subtitle | tags | duration_min | display_order |
|---|---|---|---|---|---|---|
| A.1 | `a1-mentalidade-fixa-vs-crescimento` | Mentalidade Fixa vs Mentalidade de Crescimento | A crenca invisivel sobre como habilidade funciona | mentalidade,neurociencia,spot-acao,recall | 13 | 1 |
| A.2 | `a2-dicotomia-do-controle` | A Dicotomia do Controle | Estoicismo aplicado ao poker | mentalidade,estoicismo,fronteira,controle | 14 | 2 |
| A.3 | `a3-identidade-como-narrativa` | Identidade como Narrativa | A historia que voce conta sobre voce mesmo | mentalidade,identidade,narrativa | 15 | 3 |
| A.4 | `a4-responsabilidade-vs-culpa` | Responsabilidade vs Culpa | Diferenca operacional entre dois conceitos colados | mentalidade,responsabilidade,culpa | 14 | 4 |
| A.5 | `a5-padrao-agassi` | O Padrao Agassi | Excelencia tecnica + odio do que se faz | mentalidade,trajetoria,burnout | 12 | 5 |
| A.6 | `a6-seis-medos-do-poker` | Os Seis Medos do Poker | Medos invisiveis que governam decisoes | mentalidade,medo,decisao | 16 | 6 |
| A.7 | `a7-combustivel-nao-gatilho` | Combustivel nao Gatilho | Tilt como sinal, nao como falha | mentalidade,tilt,emocao | 14 | 7 |
| A.8 | `a8-trava-arrogancia` | Entre a Trava e a Arrogancia | A faixa estreita da confianca calibrada | mentalidade,confianca,calibracao | 13 | 8 |
| A.9 | `a9-sistema-acima-forca-vontade` | Sistema acima da Forca de Vontade | Por que disciplina nao resolve | mentalidade,sistema,habito | 13 | 9 |

**categoria** (todas): `performance_mental` (validar contra `LIBRARY_CATEGORIES`).

**Asset filenames por aula** (manifest CSV referencia):
```
audio_filename:    Bloco A/A{N} - {titulo}.m4a
article_filename:  Bloco A/A{N} - {titulo}.html
cover_filename:    Bloco A/Capas/A{N}.jpeg
```

(Nomes dos arquivos exatos sao escapados durante upload script.)

### Migrations adicionais

- **0024:** `ALTER TABLE library_lessons ADD COLUMN learning_objectives JSONB DEFAULT '[]'::jsonb`
- **0025 (futuro Spec 2):** `ALTER TABLE library_lessons ADD COLUMN reading_time_minutes INTEGER` (vs `audio_duration_seconds` que ja existe).

### Comandos do founder pos-Spec aprovada

```bash
# 1. Aplicar schema novo (ja deve ter de Biblioteca-1 + 0024 nova)
npm run db:push

# 2. Subir CSS/JS do _assets/
npx tsx scripts/library-upload-static.ts

# 3. Upload chunked do Bloco A
npx tsx scripts/library-upload-bloco.ts \
  --bloco "C:/Users/ricar/OneDrive/Desktop/A anatomia de um Spot/00 - Antes das Cartas/Bloco A - Fundamentos Mentais"

# 4. Verificar
curl http://localhost:3000/api/library/courses
curl http://localhost:3000/api/library/courses/antes-das-cartas

# 5. Frontend
# Navegar /biblioteca → "Antes das Cartas" → A.1 → ver prologo
```

---

## 10. Encerramento

**Recomendacao principal:** Quebrar entrega em **Sprint Biblioteca-2 (storage + viewer MVP) → Sprint Bloco-A-Polish (prologo Netflix + UX)**. Tentar tudo num sprint so explode o scope.

**Decisao critica que pm-spec deve ratificar:** **iframe sandbox para artigos** vs expand allowlist. Strategist recomenda iframe forte, fundamentado em (a) preserva fidelidade visual do conteudo Docari, (b) JS interativo dos flashcards roda nativamente, (c) zero conflito CSS com tokens shadcn, (d) sanitize fica defesa-em-depth sem ser limite operacional. Trade-off aceito: postMessage protocol para resize + scroll-depth (~50 linhas novas).

**Riscos a flagar antes de comecar:**
1. Editar `lesson.js` original (necessario; pedir OK).
2. Sharp install Win32 (validar antes).
3. Capas duplicadas A1 (escolher).
4. Audio cap = pipeline chunked obrigatorio.

**Proximos passos:**

→ pm-spec gera `Docs/specs/biblioteca-spec-2.md` com 12 RFs do Sprint Biblioteca-2 (consultando este doc + Spec 1 + Biblioteca-1 lessons).
→ Founder responde 10 open questions (§8).
→ pm-spec gera spec separada para Sprint Bloco-A-Polish (apos Sprint 2 valid).
→ system-architect adiciona ADRs novos (article-iframe-sandbox, chunked-upload, sharp-image-resize, learning-objectives-extraction).

**Out of scope deste briefing:**
- Spec 2 colaboracao (notas usuario, comments).
- CDN deploy / S3 backend real.
- Search/transcript indexing.
- Gamification (XP, streaks).
- Auto-grant em compra Stripe.

Tudo isso vira em sprints subsequentes apos Bloco A LIVE e validado.

---

*Strategist out. pm-spec take it from here.*

---

## 11. Addendum 2026-05-03 — Compressao audio aprovada + impactos

**Decisao founder:** comprimir todos audios do Bloco A antes de upload. Executado via ffmpeg em 2026-05-03.

### Resultado

```
Codec:      AAC-LC mono 64kbps 44.1kHz, container .m4a, faststart aplicado
Reducao:    367.7 MB → 95.4 MB (-74% uniforme em 9 episodios)
Output:     Bloco A - Fundamentos Mentais/compressed/A{N} - {titulo}.m4a
A1: 52.1 → 13.5 MB    A4: 43.9 → 11.4 MB    A7: 48.0 → 12.4 MB
A2: 46.4 → 12.0 MB    A5: 25.4 → 6.6 MB     A8: 29.7 → 7.7 MB
A3: 38.9 → 10.1 MB    A6: 54.5 → 14.1 MB    A9: 29.0 → 7.5 MB
```

Founder validou qualidade audio. Aprovado pra upload.

### Impactos na Spec 2

**RFs alterados:**
- ~~**RF-02 chunked upload**~~ — **DROP**. 95MB total cabe em batch 50MB do manifest dividindo em 2 levas (5+4 episodios) OU usando per-file admin upload existente (ja implementado em Biblioteca-1).
- ~~**RF-03 manifest-by-keys**~~ — **DROP**. Manifest atual aceita buffer; com audios ~12MB cada, `Multer 50MB` cap aceita per-file sem refator.
- **RF-10 script CLI** — simplifica. Nao precisa chunks. Itera 9 audios + 9 HTMLs + 9 capas via `multipart/form-data` no `/api/admin/library/import-manifest` ja existente.

**Nova RF substituta:**
- **RF-NEW: Adapt manifest importer pra Bloco A** — config: `audio_extension='m4a'`, MIME `audio/mp4`, asset path scope `library/audio`. Validar manifest CSV inclui `audio_filename` + `audio_duration_seconds` (founder fornece duracao via ffprobe ou hardcoded). Multer cap raise 50MB → **100MB total** (cabe Bloco A inteiro num upload).

**Sprint estimate:** 4-6 dias → **3-5 dias** (chunked upload era ~1 dia de trabalho).

### Open question Q4 RESPONDIDA

> 4. Audio compressao? **Recomendacao:** manter qualidade total

Founder optou: **comprimir 64k mono**. -74% sem perda perceptivel pra voz NotebookLM. Decisao final.

### Consequencias storage

- Backend `local`: 95MB FS armazenamento — trivial
- Backend `s3` futuro: ~$0.0022/mes Standard Tier por curso — desprezivel
- Range requests ja implementados: byte-served funciona em chunks 12MB sem ajuste

### Pendencias remanescentes (open questions 1-10 menos Q4)

- Q1 lesson.js edit (`onclick` → `addEventListener`) — **AGUARDA founder OK**
- Q2 auto-skip prologue 5s — **AGUARDA**, default Strategist = sem auto-skip
- Q3 learning_objectives auto vs manual — **AGUARDA**, default = auto
- Q5 sharp em deps — **VERIFICAR `package.json` antes de spec**
- Q6 favoritos botao MVP — **default = disabled tooltip "Em breve"**
- Q7 prologo em todas aulas ou flag — **default = todas, fallback se sem hero cover**
- Q8 TXT NotebookLM search — **Spec futura**
- Q9 watermark intensidade — **default = manter ADR-076 atual**
- Q10 auto-redirect proxima aula — **default = toast sem auto-redirect**

pm-spec aplica defaults razoaveis; founder valida spec inteira antes do test-writer entrar.

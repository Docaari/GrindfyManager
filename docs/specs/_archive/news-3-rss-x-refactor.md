# Spec: News-3 — RSS/HTML Scrapers + xAI Live Search Refactor

## Status
Proposta

## Resumo Executivo

Substituir o provider Grok-LLM (`server/services/grokNewsProvider.ts`) por **scrapers reais** organizados em duas estrategias complementares: (1) **BlogScraperProvider** que consome RSS/Atom feeds com fallback de HTML scrape, e (2) **XSearchProvider** que usa xAI **Live Search API** com filtro `sources[].type = "x"` + `x_handles` para retornar tweets reais com URLs validas. Um **OrchestratorService** itera as 15 sources locked (`Docs/audits/news-x-handles.md`), aciona o provider apropriado conforme `scrape_strategy`, e aplica um **pipeline de dedupe em 3 camadas** (URL canonicalization → title fingerprint → URL-in-tweet) antes do insert idempotente. Cron migra para `0 15 * * 1` UTC (Segunda 12:00 America/Sao_Paulo). Schema reusa `news_items` + `news_sources` adicionando apenas `rss_url` + `scrape_strategy` + rename `live_search_handle` → `x_handle`. Wipe completo de `news_items` no flip (todos fake do audit 2026-05-04). Feature flag `NEWS_FEED_ENABLED=true` re-habilita o feed apos QA.

## Contexto

Audit em `Docs/audits/news-audit-2026-05-04.md` confirmou que o provider atual (`grokNewsProvider.ts`) hallucina conteudo: 73.6% das URLs estao mortas (404/403/timeout), 100% dos items tem `published_at` em outubro 2024 (cutoff visivel do modelo Grok-3), e IDs de tweets terminam em `0000000000` (sintetizados). Founder ja desligou flag `NEWS_FEED_ENABLED=false` em 2026-05-04. Esta sprint resolve a raiz do problema substituindo geracao LLM por **fetch de fontes reais**: blogs canonicos (RSS preferencial, HTML fallback) e tweets reais via xAI Live Search.

ADR-106 atual (Grok-LLM) sera **superseded** por novo ADR criado pelo system-architect na proxima etapa do pipeline. CLAUDE.md secao 6.1 (regra fonte historico tournaments) **NAO se aplica** — `news_items` eh tabela completamente separada.

## Usuarios

- **Jogador autenticado:** consome `/api/news` no NewsSlot da Home + pagina dedicada de feed (componentes ja existentes — frontend nao muda nesta sprint).
- **Admin (founder):** dispara refresh manual via `/api/admin/news/refresh`, observa metricas de cron run via logs estruturados.
- **Cron job:** roda 1x/semana, agnostic ao usuario (cache compartilhado entre todos).

## Sources Lock (15 entries)

Fonte de verdade: `Docs/audits/news-x-handles.md`. Resumo da matriz:

| ID | Categoria | Estrategia | Blog URL | X handle |
|----|-----------|------------|----------|----------|
| mundopoker | gossip | `html` | https://mundopoker.com.br | — |
| superpoker | gossip | `html` | https://superpoker.com.br | — |
| 888poker | sites | `x_only` | — | 888poker |
| bodog | sites | `x_only` | — | IgnitionCasino |
| coinpoker | sites | `x_only` | — | CoinPoker_OFF |
| ggpoker | sites | `html_and_x` | https://ggpoker.com/pt-br/blog/ | GGPoker |
| partypoker | sites | `x_only` | — | partypoker |
| pokerstars | sites | `html_and_x` | https://www.pokerstars.com/pt-BR/poker/learn/news/?&no_redirect=1 | PokerStars |
| wpn-acr | sites | `x_only` | — | ACR_POKER |
| gto-wizard-studies | studies | `rss_or_html` | https://blog.gtowizard.com/articles/ | — |
| gto-wizard | tools | `rss_or_html` | https://blog.gtowizard.com/whats-new-in-gto-wizard/ | — |
| hand2note | tools | `html_and_x` | https://hand2note.com/Blog | hand2note |
| hrc | tools | `html` | https://www.holdemresources.net/blog | — |
| jurojin | tools | `html` | https://jurojinpoker.com/pt/blog | — |
| sharkscope | tools | `x_only` | — | sharkscope |

**Drops (DELETE CASCADE):** cravadas-br, chico, ipoker, intuitive-table, holdem-manager, pokertracker.

## Requisitos Funcionais

### RF-01: Schema migration `news_sources` + wipe `news_items` [S]
**Descricao:** Adicionar colunas necessarias e limpar dados fake.
**Regras de negocio:**
- ALTER TABLE `news_sources` ADD COLUMN `rss_url TEXT NULL`.
- ALTER TABLE `news_sources` ADD COLUMN `scrape_strategy VARCHAR(32) NOT NULL DEFAULT 'html'` com CHECK constraint para os valores `('rss','html','x_only','rss_and_x','html_and_x','rss_or_html')`.
- RENAME COLUMN `live_search_handle` → `x_handle` (preservar valores existentes).
- DELETE FROM `news_sources` WHERE id IN ('cravadas-br','chico','ipoker','intuitive-table','holdem-manager','pokertracker') (CASCADE deleta `news_items` orfaos).
- DELETE FROM `news_items` (wipe total — todos os items existentes sao fake).
- UPSERT (insert OR update) das 15 sources finais com valores corretos de `rss_url`, `scrape_strategy`, `x_handle`, `homepage_url`.

**Criterio de aceitacao:**
- [ ] Migration aplicada via `drizzle-kit push` sem erros.
- [ ] `SELECT COUNT(*) FROM news_sources WHERE enabled = true` retorna exatamente 15.
- [ ] `SELECT COUNT(*) FROM news_items` retorna 0 imediatamente apos migration.
- [ ] Schema TypeScript em `shared/schema.ts` reflete novas colunas + rename + CHECK constraint.
- [ ] Tipo `ScrapeStrategy` exportado como union literal: `'rss' | 'html' | 'x_only' | 'rss_and_x' | 'html_and_x' | 'rss_or_html'`.

### RF-02: Modulo `urlCanonicalize` (Layer 1 dedupe) [S]
**Descricao:** Funcao pura que normaliza URLs para comparacao exata.
**Regras de negocio:**
- Lowercase do hostname (path mantem case original — alguns CMS sao case-sensitive em slugs).
- Strip query params: `utm_*`, `fbclid`, `gclid`, `mc_cid`, `mc_eid`, `ref`, `source`, `share`, `si`, `feature`, `igshid`.
- Manter outros query params, mas ordenar alfabeticamente por key.
- Normalizar `twitter.com` → `x.com` (host).
- Strip trailing slash do path (exceto path `/` raiz).
- Strip fragment (`#...`).
- Decodificar percent-encoding redundante (`%2F` → `/` quando seguro).
- Se URL invalido (parse falha), retornar string original sem throw.

**Criterio de aceitacao:**
- [ ] `canonicalizeUrl('https://X.com/PokerStars/status/123?utm_source=tw&ref=share')` === `canonicalizeUrl('https://twitter.com/PokerStars/status/123/')`.
- [ ] `canonicalizeUrl('https://example.com/post/?b=2&a=1')` === `canonicalizeUrl('https://example.com/post?a=1&b=2')`.
- [ ] Path `/PokerStars/...` preservado (case do path nao mudou).
- [ ] URL malformado retorna input intocado.

### RF-03: Modulo `titleFingerprint` (Layer 2 dedupe) [S]
**Descricao:** Hash sha256 que identifica titulos semanticamente equivalentes.
**Regras de negocio:**
- NFD unicode normalize + strip diacritics (regex `\p{Mn}` ou equivalente).
- Lowercase.
- Remover pontuacao + caracteres especiais (manter apenas `[a-z0-9 ]`).
- Tokenizar por espacos.
- Remover stopwords PT (`o, a, os, as, de, da, do, das, dos, em, no, na, para, por, com, e, ou, que, um, uma, no, na`) + EN (`the, a, an, of, in, on, at, for, to, and, or, that, is, was, were, be, with`).
- Sort tokens alfabeticamente (ordem do titulo nao importa).
- Top 10 tokens (truncar a lista).
- Concatenar com `|` separator + sha256 → hex.
- String vazia apos normalize retorna sha256 de `''` (deterministico).

**Criterio de aceitacao:**
- [ ] `titleFingerprint('PokerStars lança Hot $55')` === `titleFingerprint('Hot $55 lancado pela PokerStars')` (ordem de tokens irrelevante).
- [ ] `titleFingerprint('GGPoker WSOP 2026')` !== `titleFingerprint('GGPoker WSOP 2027')` (tokens distintos).
- [ ] Diacriticos PT (`çãáé`) normalizados para `caae`.
- [ ] Output sempre 64 chars hex.

### RF-04: Modulo `extractTweetUrls` (Layer 3 dedupe) [S]
**Descricao:** Extrai URLs externas mencionadas no summary de um item X.
**Regras de negocio:**
- Regex `/https?:\/\/[^\s<>"']+/gi` aplicada ao summary.
- Filtrar URLs do proprio X (`x.com`, `twitter.com`, `t.co`) — interessam apenas links externos para blogs.
- Aplicar `canonicalizeUrl` em cada match.
- Retornar array unico (Set dedupe interno).

**Criterio de aceitacao:**
- [ ] Summary `"Confira https://blog.gtowizard.com/post-x e https://t.co/abc"` retorna apenas `[canonical('https://blog.gtowizard.com/post-x')]`.
- [ ] Summary sem URLs retorna `[]`.
- [ ] URLs duplicadas no mesmo summary aparecem uma vez no output.

### RF-05: `BlogScraperProvider` — RSS first, HTML fallback [L]
**Descricao:** Provider que fetch um blog source e retorna `NewsItem[]`.
**Regras de negocio:**
- Input: `NewsSource` (id, rss_url, homepage_url, scrape_strategy, category, platform).
- Se `scrape_strategy` ∈ `['rss', 'rss_or_html', 'rss_and_x']` AND `rss_url` presente:
  - Fetch RSS/Atom com timeout 60s + User-Agent `GrindfyNewsBot/1.0 (+https://grindfy.com)`.
  - Parsear via lib RSS (sugestao: `rss-parser` ou equivalente — escolha do implementer).
  - Extrair: `title`, `link` (→ `url`), `pubDate` (→ `publishedAt`), `contentSnippet` ou `content` (→ `summary`, truncar a 500 chars).
  - Limit top 10 items por feed.
  - Se RSS falhar com erro de parse OR retorna 0 items AND strategy === `'rss_or_html'`, fallback para HTML.
- Se `scrape_strategy` ∈ `['html', 'html_and_x', 'rss_or_html'(fallback)]`:
  - Fetch HTML do `homepage_url` ou `rss_url` (quando aponta para pagina HTML).
  - **Decisao founder 2026-05-04 (escopo 1B):** TODOS os adapters HTML necessarios sao implementados nesta sprint. Sem stubs. Cada source com strategy HTML tem adapter dedicado (RF-05.1).
- Output: `NewsItem[]` com campos `{ title, summary, url, publishedAt, category, platform, sourceId }` — `contentHash` e `expiresAt` calculados depois pelo Orchestrator.
- Tratamento de erro: timeout/network/parse error → log `console.error('[news/scraper] ${sourceId} failed', err)` + retornar `[]` (NUNCA throw — uma source down nao para batch).

**Criterio de aceitacao:**
- [ ] Fetch RSS valido retorna array de items com fields obrigatorios.
- [ ] Fetch RSS com 0 entries em strategy `'rss_or_html'` aciona fallback HTML.
- [ ] Fetch RSS com 0 entries em strategy `'rss'` puro retorna `[]` (sem fallback).
- [ ] HTTP 5xx/timeout/network error retorna `[]` + log estruturado, sem throw.
- [ ] User-Agent `GrindfyNewsBot/1.0` enviado em todas requests.
- [ ] Items com `pubDate` invalido sao dropados (nao incluidos no output).
- [ ] Top 10 enforcement (input com 50 items retorna 10).

### RF-05.1: Adapters HTML para 9 sources [XL]
**Descricao:** Implementacao concreta de scrapers HTML para todas as sources com strategy `html`, `html_and_x`, ou `rss_or_html` (fallback).

**Lista de adapters obrigatorios (9):**

| Adapter | Source ID | URL inicial |
|---------|-----------|-------------|
| `scrapeMundoPoker` | mundopoker | https://mundopoker.com.br |
| `scrapeSuperPoker` | superpoker | https://superpoker.com.br |
| `scrapeGgPoker` | ggpoker | https://ggpoker.com/pt-br/blog/ |
| `scrapePokerStars` | pokerstars | https://www.pokerstars.com/pt-BR/poker/learn/news/?&no_redirect=1 |
| `scrapeHand2Note` | hand2note | https://hand2note.com/Blog |
| `scrapeHrc` | hrc | https://www.holdemresources.net/blog |
| `scrapeJurojin` | jurojin | https://jurojinpoker.com/pt/blog |
| `scrapeGtoWizardArticles` | gto-wizard-studies | https://blog.gtowizard.com/articles/ |
| `scrapeGtoWizardWhatsNew` | gto-wizard | https://blog.gtowizard.com/whats-new-in-gto-wizard/ |

**Regras de negocio (todos adapters):**
- Parser HTML via `cheerio` ou `linkedom` (escolha do implementer — manter consistencia entre adapters).
- Cada adapter eh funcao isolada exportada com signature `(html: string, baseUrl: string) => NewsItem[]` — facilita teste unitario com fixture HTML.
- Selecionar elementos de artigo via CSS selector estavel — investigar pagina real durante implementacao + capturar fixture HTML por adapter.
- Extrair `title` (texto limpo, trim), `url` (link absoluto — resolver relative URLs com `baseUrl`), `publishedAt` (parse multi-formato: `Month Day, Year`, `DD/MM/YYYY`, `YYYY-MM-DD`, ISO 8601, etc — usar `date-fns` ou similar), `summary` (primeira sentenca, meta description ou primeiro paragrafo, truncar 500 chars).
- Items invalidos (sem title OU sem URL OR data invalida) sao dropados silenciosamente (log debug nivel info).
- Top 10 items por adapter (mais recentes primeiro).
- Anti-pattern: NAO falhar se site mudar layout — adapter retorna `[]` + log warn `[news/html] adapter ${name} returned 0 items, layout may have changed`.

**Criterio de aceitacao (por adapter):**
- [ ] 9 adapters implementados como funcoes isoladas exportadas em `server/services/news/htmlAdapters/`.
- [ ] 9 fixtures HTML capturadas (uma snapshot real por site) commitadas em `tests/fixtures/news-html/`.
- [ ] Cada adapter tem teste unitario que carrega fixture + valida >= 3 items extraidos com fields completos.
- [ ] Datas em formatos heterogeneos parseadas com sucesso para `Date` JS valido.
- [ ] URLs relativas resolvidas para absolutas via `URL` constructor com `baseUrl`.
- [ ] Items invalidos sao dropados (nao incluidos no output).
- [ ] Layout-change defense: fixture sintetica com markup quebrado retorna `[]` + log warn.

**Estimativa:** XL (9 adapters × ~3-4h = ~27-36h dev). Maior bloco da sprint.

### RF-06: `XSearchProvider` — wrapper xAI Live Search [M]
**Descricao:** Provider que consulta xAI Live Search API e retorna tweets reais.
**Regras de negocio:**
- Input: `NewsSource` (x_handle obrigatorio, category, platform).
- Endpoint: `POST https://api.x.ai/v1/chat/completions` (ou equivalent) com payload:
  ```json
  {
    "model": "grok-3-latest",
    "messages": [{ "role": "user", "content": "Resuma os ultimos posts de @{x_handle} relevantes para jogadores de poker MTT." }],
    "search_parameters": {
      "mode": "on",
      "return_citations": true,
      "sources": [{ "type": "x", "x_handles": ["{x_handle}"] }],
      "from_date": "{ISO yyyy-mm-dd, 7 dias atras}",
      "to_date": "{ISO yyyy-mm-dd, hoje}",
      "max_search_results": 10
    }
  }
  ```
- Parsear `citations[]` da resposta — cada citation tem `url` (formato `https://x.com/{handle}/status/{id}`), `title`, `snippet`, `published_at`.
- Validar `url` matches regex `^https://x\.com/[^/]+/status/\d{15,20}$` (rejeitar URLs malformados ou com trailing zeros suspeitos como `0000000000`).
- Mapear para `NewsItem`: title, summary (snippet truncado a 500), url, publishedAt, category, platform.
- Timeout 60s, User-Agent default do SDK xAI.
- Failure handling: idem RF-05 (log + return `[]`).
- Variavel env `XAI_API_KEY` obrigatoria — se ausente, retornar `[]` + log warning.
- Variavel env `XAI_MODEL` opcional (default `grok-3-latest`).

**Criterio de aceitacao:**
- [ ] Resposta valida com 5 citations retorna 5 NewsItems.
- [ ] Citation com URL contendo trailing 10 zeros eh dropada + log `[news/xsearch] suspicious tweet id dropped`.
- [ ] HTTP 4xx/5xx/timeout retorna `[]` + log estruturado.
- [ ] `from_date` calculado como `now - 7 days` em UTC (ISO `yyyy-mm-dd`).
- [ ] `to_date` === `now` em UTC.
- [ ] XAI_API_KEY ausente skipa silenciosamente com log warn.

### RF-07: `OrchestratorService` — coordena providers + dedupe + insert [L]
**Descricao:** Servico principal que substitui logica do `runNewsRefresh` antigo.
**Regras de negocio:**
- Funcao `runOrchestration()` retorna `{ runId, sources, fetched, inserted, skipped: { layer1, layer2, layer3 }, errors: [{sourceId, error}] }`.
- Iterar `news_sources` WHERE `enabled = true`.
- Concurrency: max 3 sources em paralelo (semaforo). Sources X-only + blog-only nao competem por recurso, mas politeness rate limit em xAI vale.
- Per source, baseado em `scrape_strategy`:
  - `rss` ou `html` ou `rss_or_html` → chamar `BlogScraperProvider` apenas.
  - `x_only` → chamar `XSearchProvider` apenas.
  - `rss_and_x` ou `html_and_x` → chamar AMBOS providers em paralelo, concat resultados.
- Para cada `NewsItem` retornado, executar pipeline dedupe (RF-08, ordem fixa Layer 1 → 2 → 3).
- Items sobreviventes: calcular `contentHash = sha256(canonicalUrl + '\n' + titleFingerprint)`, `expiresAt = publishedAt + 30 dias`, e fazer `INSERT INTO news_items` com `ON CONFLICT (content_hash) DO NOTHING`.
- Logar summary final: `[news/orchestrator] run completed { runId, sources: 15, fetched: 87, inserted: 42, skipped: { layer1: 12, layer2: 25, layer3: 8 }, errors: 1 }`.
- Manter assinatura compativel: exportar `runNewsRefresh()` como alias para `runOrchestration()` (zero-impact em `routes/news.ts` admin handler).

**Criterio de aceitacao:**
- [ ] 1 source com 5 items, todos novos → `inserted: 5, skipped: 0`.
- [ ] 1 source com 5 items duplicados (URL canonical match) → `inserted: 0, skipped.layer1: 5`.
- [ ] 3 sources processadas em paralelo (medir wall-clock vs sequencial).
- [ ] 1 source falha com throw interno → outras sources concluem + erro registrado em `errors[]`.
- [ ] `runId` eh `nanoid()` unico por run (telemetria/log correlation).
- [ ] Insert eh idempotente (rerun mesma janela → 0 novos).

### RF-08: Pipeline `applyDedupe` (3 layers ordenados) [M]
**Descricao:** Funcao que recebe `NewsItem[]` candidatos e retorna `NewsItem[]` sobreviventes + dropped count por layer.
**Regras de negocio:**
- **Layer 1 (URL canonical, janela 30 dias):** para cada candidato, `canonicalizeUrl(item.url)` + query `SELECT 1 FROM news_items WHERE url_canonical = ? AND fetched_at >= now() - interval '30 days' LIMIT 1`. Se hit, drop + incrementar `skipped.layer1`. (Nota: precisa coluna `url_canonical` indexada — RF-08.1.)
- **Layer 2 (title fingerprint, janela 30 dias):** para sobreviventes Layer 1, `titleFingerprint(item.title)` + query `SELECT 1 FROM news_items WHERE title_fingerprint = ? AND fetched_at >= now() - interval '30 days' LIMIT 1`. Se hit, drop + `skipped.layer2`. (Precisa coluna `title_fingerprint` indexada — RF-08.1.)
- **Layer 3 (URL-in-tweet, janela 7 dias):** apenas para items cujo `url` contem `x.com` ou `twitter.com`. Aplicar `extractTweetUrls(item.summary)` → para cada URL externa extraida, query `SELECT 1 FROM news_items WHERE url_canonical = ? AND fetched_at >= now() - interval '7 days' LIMIT 1`. Se ALGUM hit, drop tweet + `skipped.layer3`.
- Cross-source NAO eh dedupe — perspectivas distintas valem (founder decision). Layers 1+2 podem matchar items da mesma source OR de outras sources; isso eh OK e desejado.
- Log estruturado por drop: `console.info('[news/dedupe] drop', { layer, sourceId, url, reason })`.

**Criterio de aceitacao:**
- [ ] Layer 1 hit dropa item + log com `layer: 1`.
- [ ] Layer 2 hit (URLs diferentes mas titles equivalentes) dropa + log `layer: 2`.
- [ ] Layer 3 ignora items nao-X (blog) — passa direto.
- [ ] Layer 3 hit (tweet citando blog ja indexado) dropa.
- [ ] Janelas temporais respeitadas (item fora da janela nao causa drop).
- [ ] Ordem fixa: Layer 1 sempre antes de 2 sempre antes de 3.

### RF-08.1: Schema migration adicional — colunas `url_canonical` + `title_fingerprint` [S]
**Descricao:** Layers 1 e 2 dependem de queries indexadas em campos derivados.
**Regras de negocio:**
- ALTER TABLE `news_items` ADD COLUMN `url_canonical TEXT NOT NULL DEFAULT ''`.
- ALTER TABLE `news_items` ADD COLUMN `title_fingerprint VARCHAR(64) NOT NULL DEFAULT ''`.
- CREATE INDEX `idx_news_items_url_canonical_fetched` ON `news_items` (`url_canonical`, `fetched_at` DESC).
- CREATE INDEX `idx_news_items_title_fingerprint_fetched` ON `news_items` (`title_fingerprint`, `fetched_at` DESC).
- Como wipe foi total em RF-01, defaults vazios nao afetam linhas (tabela vazia post-flip).
- Schema TS: campos como `text("url_canonical").notNull().default('')` + `varchar("title_fingerprint", { length: 64 }).notNull().default('')`.

**Criterio de aceitacao:**
- [ ] Migration aplica sem erros.
- [ ] Indices criados (`\d news_items` mostra ambos).
- [ ] Insert com canonical+fingerprint preenchidos funciona.

### RF-09: Cron schedule alterado [S]
**Descricao:** Mudar cron de `0 12 * * 1` (timezone-aware Sao Paulo) para `0 15 * * 1` UTC, e apontar handler para `runOrchestration`.
**Regras de negocio:**
- Editar `server/jobs/refreshNews.ts`:
  - `CRON_EXPR = '0 15 * * 1'` (UTC, equivale a 12:00 SP sem DST — Brasil aboliu DST em 2019).
  - Remover param `timezone: 'America/Sao_Paulo'` do `cron.schedule` (now UTC).
  - Substituir `fetchGrokNews` import por `runOrchestration` import.
  - Substituir loop interno de sources pelo single call `await runOrchestration()`.
- Manter check `isEnabled()` com flag `NEWS_FEED_ENABLED` + presence de `XAI_API_KEY`. **Decisao founder 2026-05-04:** key ausente OR invalida → cron skipa cron INTEIRO + log error estruturado `[news/cron] XAI_API_KEY missing or invalid — cron skipped`. Sem fallback blog-only. Founder resolve manualmente (renew/check key).
- Manter handler admin manual `/api/admin/news/refresh` invocando mesma `runOrchestration()` (nao chama cron diretamente).

**Criterio de aceitacao:**
- [ ] `node-cron` registra `0 15 * * 1` UTC.
- [ ] Cron chama `runOrchestration` no fire.
- [ ] Flag off → log skip + nao executa.
- [ ] `XAI_API_KEY` ausente → log skip + nao executa (mesmo se blog-only sources existem; founder prefere all-or-nothing pra simplificar).

### RF-10: Frontend zero-impact verification [S]
**Descricao:** Confirmar que componentes consumidores `/api/news` continuam funcionando sem alteracao.
**Regras de negocio:**
- Endpoint `/api/news` retorna mesma shape de response (ja documentada).
- Componentes consumidores: `client/src/components/NewsSlot.tsx` + paginas que importam (verificar via grep).
- Nenhum codigo frontend deve mudar nesta sprint. Se schema response mudar acidentalmente, eh bug.

**Criterio de aceitacao:**
- [ ] `client/src/components/NewsSlot.tsx` renderiza items corretamente apos cron run real.
- [ ] Snapshot de response `/api/news` (1 item) tem mesmas keys de Sprint News-1.
- [ ] Nenhum diff em arquivos `client/**` neste PR.

### RF-11: Observability — metric estruturada por run [S]
**Descricao:** Log machine-readable que founder pode parsear pra dashboard.
**Regras de negocio:**
- Ao final de `runOrchestration`, emitir log JSON-stringified `[news/metric] {"runId":"...","sources":15,"fetched":87,"inserted":42,"skippedLayer1":12,"skippedLayer2":25,"skippedLayer3":8,"errors":1,"durationMs":12345,"startedAt":"...","completedAt":"..."}`.
- Por source individual, log `[news/source] {"runId":"...","sourceId":"mundopoker","strategy":"html","fetched":5,"inserted":3,"errored":false}`.
- Por dedupe drop, log ja definido em RF-08.

**Criterio de aceitacao:**
- [ ] Metric line eh JSON valido (parseavel via `JSON.parse` apos remover prefix).
- [ ] `runId` eh consistente entre orchestrator + per-source logs do mesmo run.
- [ ] `durationMs` reflete tempo real (medir via `Date.now()`).

### RF-12: Cleanup `grokNewsProvider.ts` legacy [S]
**Descricao:** Apagar provider antigo para evitar confusao + reduzir surface de bugs.
**Regras de negocio:**
- DELETE `server/services/grokNewsProvider.ts`.
- Buscar imports remanescentes (`grep -r "grokNewsProvider"`) — devem ser zero apos RF-09.
- Se algum teste em `tests/` referencia o arquivo, reescrever ou deletar conforme aplicabilidade.

**Criterio de aceitacao:**
- [ ] `find server/ -name 'grokNewsProvider*'` retorna 0 arquivos.
- [ ] `grep -r "grokNewsProvider" server/ tests/ client/` retorna 0 matches.
- [ ] `npm run check` passa (sem unresolved imports).

## Requisitos Nao-Funcionais

- **Performance:** cron run completo com 15 sources nao deve exceder 5 min wall-clock (3 sources em paralelo, 60s timeout per source no pior caso = 5×60s = 300s).
- **Resiliencia:** uma source down (timeout/4xx/5xx/parse error) NAO deve bloquear demais sources. Cron sempre conclui retornando metrics parciais.
- **Idempotencia:** rerun da mesma janela temporal (manual trigger 2x seguidas) nao deve criar duplicatas (`ON CONFLICT (content_hash) DO NOTHING` + dedupe layers).
- **Observabilidade:** todos eventos relevantes (fetch start/end, dedupe drop, insert success, source error) logados com prefix `[news/<modulo>]` para grep facil.
- **Custo xAI:** 9 sources X × 1x/semana ≈ 36 calls/mes × ~$0.025/call ≈ $0.90/mes (cap orcamentario implicito; alarme se exceder $5/mes via dashboard xAI).
- **Politeness:** User-Agent identificavel (`GrindfyNewsBot/1.0 (+https://grindfy.com)`) em todas requests HTTP. Nao paralelizar fetch dentro da mesma source. Respeitar `robots.txt` quando publicado pelo site (best-effort — nao bloqueante).
- **Seguranca:** zero PII em logs. URLs publicas OK. Sem secrets logados.

## Endpoints Previstos

Nenhum endpoint novo. Endpoints existentes preservados:

| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| GET | /api/news | Lista items do feed (frontend consumer) | JWT |
| POST | /api/admin/news/refresh | Trigger manual do cron | JWT + admin |
| GET | /api/news/preferences | Preferencias por usuario | JWT |
| PUT | /api/news/preferences | Update preferencias | JWT |

Resposta de `/api/news` mantem shape Sprint News-1.

## Modelos de Dados Afetados

### `news_sources` (alteracao)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| rss_url | text | NULL | URL feed RSS/Atom |
| scrape_strategy | varchar(32) | NOT NULL DEFAULT 'html' + CHECK | Enum literal |
| x_handle | varchar(64) | NULL | RENAMED de `live_search_handle` |

### `news_items` (alteracao)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| url_canonical | text | NOT NULL DEFAULT '' | Indexado para Layer 1 dedupe |
| title_fingerprint | varchar(64) | NOT NULL DEFAULT '' | Indexado para Layer 2 dedupe |

Indices novos:
- `idx_news_items_url_canonical_fetched` (url_canonical, fetched_at DESC)
- `idx_news_items_title_fingerprint_fetched` (title_fingerprint, fetched_at DESC)

Wipe: `DELETE FROM news_items` (zero rows preservadas — todos fake).

## Integracoes Externas

| Servico | Proposito | Quando | Custo |
|---|---|---|---|
| xAI Live Search API | Tweets reais via `sources[].type='x'` | 9 sources X-only/X-and-blog, 1x/semana | ~$0.90/mes |
| RSS endpoints | Feeds dos blogs (GTO Wizard etc) | 2 sources `rss_or_html`, 1x/semana | $0 |
| HTTP scrape (HTML) | Sources sem RSS confiavel | 9 adapters implementados Sprint News-3 (escopo 1B founder) | $0 |

## Cenarios de Teste Derivados

### Happy Path
- [ ] `runOrchestration` com 15 sources mockadas retorna `inserted >= 1` e zero `errors`.
- [ ] Insert idempotente (rerun → `inserted: 0`).
- [ ] Cron registrado em `0 15 * * 1` UTC dispara `runOrchestration` no fire.

### Provider — BlogScraperProvider
- [ ] RSS valido com 5 items retorna 5 NewsItems com fields completos.
- [ ] RSS retorna 0 items + strategy `'rss_or_html'` aciona HTML fallback.
- [ ] RSS retorna 0 items + strategy `'rss'` puro retorna `[]`.
- [ ] HTTP timeout retorna `[]` + log error, sem throw.
- [ ] HTTP 5xx retorna `[]` + log error.
- [ ] `pubDate` invalido faz item ser dropado.
- [ ] Top 10 enforcement: input com 50 items → output 10.
- [ ] User-Agent enviado em request.
- [ ] Cada um dos 9 adapters HTML (fixture real) retorna >= 3 items extraidos com fields completos.
- [ ] Layout-change defense: fixture sintetica com markup quebrado retorna `[]` + log warn.

### Provider — XSearchProvider
- [ ] xAI response valida com 5 citations → 5 NewsItems.
- [ ] Tweet ID com 10 trailing zeros → drop + log warn.
- [ ] HTTP 4xx → `[]` + log.
- [ ] `XAI_API_KEY` ausente → `[]` + log warn (sem throw).
- [ ] `from_date` === now-7d UTC, `to_date` === now UTC.
- [ ] Citation sem URL valido → drop.

### Dedupe — Layer 1 URL canonical
- [ ] `canonicalizeUrl` casa URLs com utm_source diferentes.
- [ ] `canonicalizeUrl` normaliza `twitter.com` → `x.com`.
- [ ] `canonicalizeUrl` ordena query params alfabeticamente.
- [ ] Trailing slash strip.
- [ ] Layer 1 hit dropa item + incrementa `skipped.layer1`.
- [ ] Janela 30 dias respeitada (item de 31d atras nao causa drop).

### Dedupe — Layer 2 title fingerprint
- [ ] Titles equivalentes com tokens reordenados → mesmo hash.
- [ ] Diacriticos PT removidos (`çãáé` → `caae`).
- [ ] Stopwords PT+EN strippadas.
- [ ] Top 10 tokens enforcement.
- [ ] Hash sempre 64 chars.
- [ ] Layer 2 hit dropa + log.

### Dedupe — Layer 3 URL-in-tweet
- [ ] Item nao-X passa direto sem checagem.
- [ ] Tweet citando URL ja em DB (canonical match, janela 7d) eh dropado.
- [ ] Tweet sem URLs externas no summary passa.
- [ ] URLs `t.co`/`x.com` no summary nao contam (apenas externos).

### Orchestrator
- [ ] Concurrency 3 sources em paralelo (medir wall-clock).
- [ ] 1 source throw interno → outras concluem + `errors[]` registra.
- [ ] Strategy `rss_and_x` chama AMBOS providers + concat.
- [ ] Strategy `x_only` chama apenas XSearch.
- [ ] `runId` unico por run (correlation log).

### Schema migration
- [ ] Migration aplica sem erros.
- [ ] 6 sources legacy deletadas (CASCADE limpa `news_items`).
- [ ] 15 sources finais inseridas com `scrape_strategy` correta.
- [ ] Rename `live_search_handle` → `x_handle` preserva valores.
- [ ] Indices `url_canonical` + `title_fingerprint` criados.
- [ ] CHECK constraint rejeita strategy invalida (`'foo'` → erro).

### Edge cases
- [ ] String vazia em `titleFingerprint` retorna sha256 deterministico.
- [ ] URL malformado em `canonicalizeUrl` retorna input intocado.
- [ ] Source com `scrape_strategy = 'html'` mas adapter nao implementado → log "pending" + retorna `[]` (nao quebra batch).
- [ ] `enabled = false` source eh skipada totalmente.
- [ ] Cron rerun simultaneo (2 invocacoes em race) → ON CONFLICT garante zero duplicatas (idempotencia DB-level).

### Frontend zero-impact
- [ ] Snapshot response `/api/news` tem keys identicas a Sprint News-1.
- [ ] `NewsSlot.tsx` renderiza items reais sem erros console.
- [ ] Zero arquivos modificados em `client/**`.

## Pre-requisitos / Dependencias

- **DB:** PostgreSQL 16 (local) ou Neon (prod). Capacidade de aplicar migrations via `db:push` ou `drizzle-kit`.
- **Env vars obrigatorias:** `XAI_API_KEY` (existente — Sprint News-1 ja exige), `NEWS_FEED_ENABLED` (default `false`, manter desligado ate QA).
- **Env vars opcionais:** `XAI_MODEL` (default `grok-3-latest`).
- **Dependencias npm a avaliar:** `rss-parser` (RSS feeds), `cheerio` ou `linkedom` (HTML scrape adapters). Implementer escolhe + adiciona ao `package.json` se necessario.
- **Pipeline:** spec aprovada → system-architect cria ADR superseding ADR-106 + diagrama Mermaid → test-writer red phase → implementer green → reviewer.

## Riscos + Mitigacoes

| Risco | Probabilidade | Impacto | Mitigacao |
|---|---|---|---|
| RSS feed do blog quebra layout (mudanca silenciosa do CMS) | Media | Medio | Log estruturado per source: founder ve `inserted: 0` e investiga. Adicionar metric "consecutive runs with 0 inserts" em Sprint News-3.1 se vira problema. |
| xAI Live Search retorna citations com URLs hallucinated mesmo assim | Baixa | Alto | Regex validation rigorosa (RF-06: tweet ID 15-20 digitos, sem trailing zeros excessivos). Se persistir, abrir issue na xAI. |
| Custo xAI explode (>$5/mes) | Baixa | Baixo | Cron 1x/semana + 9 sources fixas = teto ~$1/mes. Alarme manual via dashboard xAI. |
| Adapter HTML quebra quando site muda layout (CMS update silencioso) | Media | Medio | Per-adapter retorna `[]` + log warn `layout may have changed`. Founder ve metric `inserted: 0 consecutive` e dispara update do adapter. Fixtures HTML versionadas em `tests/fixtures/news-html/` permitem reproduzir bug rapido. |
| Dedupe Layer 2 colide titulos legitimos diferentes | Baixa | Baixo | Top 10 tokens + sort + sha256 minimiza. Se slip > 5%, Sprint News-3.1 adiciona Layer 4 embeddings. Logs estruturados de drops permitem auditar. |
| Migration `RENAME COLUMN` falha em DB com triggers/views | Baixa | Alto | Verificar `\d news_sources` antes — DB atual nao tem dependencias. Backup via `pg_dump` antes de migration em prod. |
| `node-cron` UTC cron interpreta diferente em dev (Windows) | Baixa | Baixo | Test integration roda mock cron com fake time + valida fire. Em prod (Linux/Neon), UTC eh garantido. |
| Wipe `news_items` causa stale cache em frontend | Baixa | Baixo | TanStack Query refetcha em mount; usuario nao reclama (DB volta a popular em ate 7 dias). |

## Plano de Rollout

**Fase 0 — pre-flip (atual):**
- `NEWS_FEED_ENABLED=false` (founder ja killou 2026-05-04).
- Sprint pipeline: spec → architect → test-writer → implementer → reviewer.

**Fase 1 — flip dev (local):**
1. `db:push` migration (RF-01 + RF-08.1).
2. Verificar `news_items` count = 0, `news_sources` count = 15.
3. `NEWS_FEED_ENABLED=true` em `.env` local.
4. Trigger manual `POST /api/admin/news/refresh`.
5. Inspecionar logs `[news/metric]` + `[news/source]`. Esperar `inserted >= 5` (pelo menos GTO Wizard + alguns X).
6. Render `/feed-de-noticias` no frontend — confirmar items aparecem com URLs validas.

**Fase 2 — QA founder (manual):**
- Abrir 10 items random, clicar URL, validar 200 OK + conteudo bate.
- Confirmar `published_at` em janela 2026-04-28..2026-05-04 (nao mais Oct/2024).
- Validar mistura de blog + X items por categoria.

**Fase 3 — flip prod (apenas pos-aprovacao founder):**
- Deploy via pipeline normal (founder controla).
- `NEWS_FEED_ENABLED=true` em prod env.
- Aguardar primeiro cron run automatico (proxima Segunda 12:00 SP).
- Monitor logs `[news/metric]` durante 4 semanas.

**Fase 4 — observacao 4 semanas:**
- Metric chave: `slip_rate = duplicates_visible_to_user / total_inserted`.
- Se `slip_rate > 5%` → abrir Sprint News-3.1 (Layer 4 embeddings).
- Se sources HTML continuam `inserted: 0` consistente → priorizar adapters em Sprint News-3.2.

## Fora de Escopo (Deferred)

Itens explicitamente **NAO** cobertos nesta sprint:

- **Layer 4 dedupe (embeddings cosine similarity):** condicional a `slip_rate > 5%` em prod. Sprint News-3.1.
- ~~HTML scrape adapters per-source: apenas GTO Wizard~~ — **REVOGADO 2026-05-04 (escopo 1B founder).** Todos 9 adapters HTML implementados nesta sprint via RF-05.1. Sprint News-3.2 nao mais necessaria.
- **UI changes (newsfeed redesign):** zero alteracao em `client/**`. NewsSlot continua como esta.
- **Per-source rate limit metrics dashboard:** logs estruturados sao suficientes para fase 4. Dashboard visual fica em backlog separado.
- **Robots.txt enforcement automatico:** User-Agent identificavel + politeness manual. Crawler compliance formal eh backlog.
- **Multi-language support nos blogs (i18n no scrape):** apenas PT-BR e EN nativos das fontes atuais — sem traducao automatica.
- **Push notification para items breaking news:** feed eh pull-based via UI consumer.
- **Per-user customizacao de fontes:** preferencias `user_news_preferences` continuam category-level (Sprint News-1 design).

## Notas de Implementacao (sugestoes nao-vinculantes)

- **Lib RSS:** `rss-parser` eh bem mantido + simples. Alternativa `feedparser` mais low-level. Implementer decide.
- **Lib HTML:** `cheerio` (jQuery-like server-side) ou `linkedom` (DOM standard). Ambos OK.
- **Mock xAI em testes:** usar `nock` ou `vi.spyOn(global, 'fetch')`. Capturar 1 fixture real do Live Search e reusar em testes.
- **Fixture HTML GTO Wizard:** baixar 1 snapshot via `curl` + commitar em `tests/fixtures/news/gto-wizard-articles.html`. Adapter teste roda contra fixture, nao internet.
- **Concurrency primitive:** `Promise.allSettled` + chunk de 3 (simples) ou `p-limit` (lib externa, mais elegante).
- **`runId`:** `nanoid()` 10 chars suficiente — correlation em log local, nao precisa ser globalmente unico.
- **TZ note:** Brasil aboliu DST em 2019 (Decreto 9.772/2019). Sao Paulo === UTC-3 ano todo. `0 15 * * 1` UTC === `0 12 * * 1` SP sempre.

---

## Checklist Pre-Apresentacao

- [x] Cada RF tem criterios de aceitacao verificaveis.
- [x] Cenarios de teste cobrem happy path, providers individuais, dedupe per layer, orchestrator, schema, edge cases.
- [x] Secao "Fora de Escopo" lista 8 itens diferidos.
- [x] Sem ambiguidade — cada regra tem interpretacao unica.
- [x] Spec independente — test-writer pode gerar testes sem perguntas adicionais.
- [x] Endpoints listados (zero novos, 4 existentes preservados).
- [x] Modelos de dados documentados com campos + constraints + indices.
- [x] Estimativas de tamanho por RF (S/M/L/XL) — total 12 RFs (5×S + 4×M + 2×L + 1×XL). **Estimativa revisada pos-decisao founder (escopo 1B):** ~1.5-2 semanas dev (RF-05.1 expandiu de M para XL com 9 adapters HTML).
- [x] Riscos + mitigacoes mapeados (8 riscos).
- [x] Plano de rollout 4 fases.
- [x] Pre-requisitos + dependencias claros.

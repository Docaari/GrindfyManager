# ADR-107: Refatorar provider de news para RSS/HTML scrapers + xAI Live Search

## Status

**Accepted** — supersedes [ADR-106](106-news-grok-llm-provider.md).

## Data

2026-05-04

## Contexto

A primeira versao do news feed (Sprint News-1, ADR-106) usava o provider `grokNewsProvider.ts` que invocava o modelo Grok-3 da xAI como **gerador de conteudo** — pedia para o LLM "listar as ultimas noticias relevantes para jogadores de poker MTT" e parseava texto livre para extrair titulos/URLs/datas. A premissa era que o modelo tinha conhecimento atualizado e citaria fontes reais.

Auditoria executada em 2026-05-04 (`Docs/audits/news-audit-2026-05-04.md`) mostrou falha estrutural:

- **73.6% das URLs estao mortas** (HTTP 404/403 ou timeout). LLM hallucinou enderecos plausiveis mas inexistentes.
- **100% dos `published_at` ficam em outubro de 2024** — cutoff visivel do treinamento Grok-3. Nao ha como o feed entregar noticias atuais.
- **IDs de tweets terminam em `0000000000`** — sintese tipica de LLM que nao tem acesso a conteudo real do X. Nenhum tweet apresentado existe.
- **Slip rate de duplicidades sub-detectado** — sem dedupe estruturado, items "novos" frequentemente eram parafraseamentos do mesmo evento.

Founder desligou `NEWS_FEED_ENABLED=false` em 2026-05-04 e abriu spec `Docs/specs/news-3-rss-x-refactor.md` para o redesenho. O problema raiz e claro: **LLM-como-gerador nao e adequado para feeds factuais**. A solucao precisa fetchar fontes reais (RSS, HTML, X via Live Search com `sources[].type='x'`) e usar LLM apenas (no maximo) como **busca/resumo** de conteudo que ja existe.

Restricoes de negocio:
- Feed eh consumido por jogadores autenticados em `NewsSlot` da Home + pagina dedicada. Frontend nao deve mudar nesta sprint (zero-impact).
- Custo operacional precisa caber em pacote pequeno (<= $5/mes) — feed nao monetiza diretamente.
- Manutencao baixa — arquiteto/dev unico (founder) nao consegue manter pipeline complexo.
- Cron 1x/semana e suficiente (poker MTT noticias nao sao tempo-real). 9 sources X via xAI 1x/semana ≈ $0.90/mes.

Restricoes tecnicas:
- 15 sources locked em `Docs/audits/news-x-handles.md`. Drops: cravadas-br, chico, ipoker, intuitive-table, holdem-manager, pokertracker.
- Schema atual `news_sources` + `news_items` reusavel — apenas ALTER COLUMN minimo.
- xAI Live Search API ja disponivel (env `XAI_API_KEY` existente da Sprint News-1).
- WPN, GG, Stars, etc nao expoem RSS de news estavel — HTML scrape eh inevitavel para parte das sources.

## Decisao

Substituir o provider monolitico Grok-LLM por uma arquitetura **provider-orchestrator-dedupe** com 5 componentes principais:

### 1. `BlogScraperProvider`
Provider que fetch um source de blog. Estrategia interna:
- Se `scrape_strategy ∈ {'rss','rss_or_html','rss_and_x'}` AND `rss_url` presente → fetch + parse RSS/Atom (lib `rss-parser`).
- Se `scrape_strategy ∈ {'html','html_and_x','rss_or_html'(fallback)}` → fetch HTML + adapter dedicado por source (cheerio/linkedom).
- Fallback automatico RSS → HTML se strategy === `'rss_or_html'` AND RSS retornar 0 items ou parse error.

**9 adapters HTML implementados nesta sprint (escopo 1B locked pelo founder):** mundopoker, superpoker, ggpoker, pokerstars, hand2note, hrc, jurojin, gtowizard-articles, gtowizard-whatsnew. Cada adapter eh funcao isolada `(html, baseUrl) => NewsItem[]` testada contra fixture HTML real commitada em `tests/fixtures/news-html/`.

### 2. `XSearchProvider`
Wrapper sobre xAI Live Search API. Difere do ADR-106 fundamentalmente: usa `search_parameters.sources[].type='x'` + `x_handles[handle]` para retornar **citations reais** (tweets que existem), nao texto LLM gerado. Output sao URLs canonicas `https://x.com/{handle}/status/{numericId}` validadas por regex (`^https://x\.com/[^/]+/status/\d{15,20}$`) e drop heuristico para ID com 10+ trailing zeros (anti-hallucination guard, decisao 2A). Janela default `from_date = now - 7d`, `to_date = now` em UTC.

### 3. `OrchestratorService`
Servico central que substitui o `runNewsRefresh` antigo. Itera 15 sources `WHERE enabled=true`, dispatcha para provider apropriado conforme `scrape_strategy`:
- `rss` / `html` / `rss_or_html` → BlogScraperProvider apenas.
- `x_only` → XSearchProvider apenas.
- `rss_and_x` / `html_and_x` → ambos providers em paralelo, concat.

Concurrency: max 3 sources em paralelo (`p-limit` ou chunk de `Promise.allSettled`). Erro em uma source NAO bloqueia batch (resilience principal). Output: `{ runId, sources, fetched, inserted, skipped: { layer1, layer2, layer3 }, errors }`.

### 4. `DedupeService` — pipeline 3-layer ordenado
Aplicado para cada `NewsItem` candidato antes do insert:
- **Layer 1 (URL canonical, janela 30 dias):** `canonicalizeUrl` (lowercase host, strip utm/fbclid/etc, `twitter.com → x.com`, ordenar query, strip trailing slash) → query indexada `WHERE url_canonical = ? AND fetched_at >= now() - interval '30 days'`. Hit → drop.
- **Layer 2 (title fingerprint, janela 30 dias):** `titleFingerprint` (NFD strip diacritics, lowercase, strip punct, tokenize, strip stopwords PT+EN, sort, top 10, sha256) → query indexada equivalente. Hit → drop.
- **Layer 3 (URL-in-tweet, janela 7 dias):** apenas para items cujo `url` contem `x.com`. `extractTweetUrls(item.summary)` → para cada URL externa, check se ja indexada nos ultimos 7d. Hit → drop tweet (assume que o blog ja foi capturado e o tweet eh redundante).

Cross-source NAO eh deduplicado — perspectivas de fontes distintas valem. Layers 1+2 podem matchar entre sources (mesmo URL canonical de 2 sources diferentes drops a segunda).

**Layer 4 (embeddings cosine similarity) deferred** (decisao 3A). Ativacao condicional: slip rate medido em prod > 5% durante 4 semanas pos-flip → abrir Sprint News-3.1.

### 5. Schema delta (minimo)

`news_sources`:
- `+ rss_url TEXT NULL`
- `+ scrape_strategy VARCHAR(32) NOT NULL DEFAULT 'html'` + CHECK constraint para enum `('rss','html','x_only','rss_and_x','html_and_x','rss_or_html')`.
- `RENAME live_search_handle → x_handle` (preserva valores).
- DELETE 6 sources legacy (CASCADE limpa orfaos).
- UPSERT 15 sources finais.

`news_items`:
- `+ url_canonical TEXT NOT NULL DEFAULT ''`
- `+ title_fingerprint VARCHAR(64) NOT NULL DEFAULT ''`
- INDEX `idx_news_items_url_canonical_fetched (url_canonical, fetched_at DESC)`
- INDEX `idx_news_items_title_fingerprint_fetched (title_fingerprint, fetched_at DESC)`
- DELETE FROM news_items (wipe total — todos atuais sao fake).

### 6. Cron + activation

- `0 15 * * 1` UTC (Segunda 12:00 SP — Brasil aboliu DST em 2019, equivalencia eh estavel).
- Master kill-switch `NEWS_FEED_ENABLED` mantido (default false ate QA).
- `XAI_API_KEY` ausente OU invalida → cron skip **inteiro** (decisao all-or-nothing 4): log error estruturado `[news/cron] XAI_API_KEY missing or invalid — cron skipped` + zero work. Sem fallback blog-only. Founder resolve manual (renew key, re-enable). Justificativa: feed sem componente X-only fica enviesado para blogs (8/15 sources sao X-only ou X-and-blog), preferivel zero ao parcial enganoso.

## Opcoes Consideradas

### Opcao A — Manter LLM gerador, melhorar prompt
**Pros:**
- Zero codigo novo, apenas tunar prompt do Grok.
- Custo continua minimo.

**Contras:**
- **Hallucination eh fundamental ao paradigma** — LLM gerador sempre pode inventar URL/data plausiveis. Audit ja provou.
- Cutoff temporal nao se resolve com prompt — modelo precisa de re-treino para conhecer eventos pos-Out/2024.
- Tweet IDs sintetizados sao sintoma de modelo que nao tem acesso real ao X.
- **Rejeitada:** o problema esta na arquitetura, nao na execucao do prompt.

### Opcao B — Anthropic Claude com tool use `web_search`
**Pros:**
- Claude API tem `web_search_20250605` tool nativa que retorna URLs reais.
- Founder ja tem `ANTHROPIC_API_KEY` configurado (Coach AI).
- Familiar — mesmo SDK do Coach.

**Contras:**
- **Custo per-call alto** — Claude Sonnet com web_search ~$0.10/run × 15 sources × 4 runs/mes ≈ $6/mes. xAI Live Search direto ≈ $1/mes (10x mais caro).
- **Ainda LLM no loop** para o componente X — mesmo com web_search, Claude consome resultado e re-gera prosa. Risco de drift permanece.
- web_search retorna mix Google de qualquer site — sem filtro `type='x'` para garantir tweets reais. Para X feed, mais ruidoso que xAI Live Search nativo.
- xAI Live Search tem `sources[].type='x'` + `x_handles[]` que eh exatamente o que precisamos para citations reais sem hallucination.
- **Rejeitada para X**, mantida como possivel para component "summarizer" futuro se necessario.

### Opcao C — Full HTML scrape sem LLM (apenas blogs + X via web crawl direto)
**Pros:**
- Zero custo LLM ($0/mes).
- Total controle — sem dependencia externa LLM.
- Determinista, 100% replicavel.

**Contras:**
- **X (Twitter) eh hostil a scraping** — blocklist de IP, rate limit agressivo, login wall. Tentar scrape direto vai quebrar em semanas.
- Requer captcha solver, proxies rotacionais, CAPTCHA bypass — anti-pattern moral E custoso ($50+/mes em proxies + ferramentas).
- Founder solo nao tem capacidade de manter scraper hostil + ToS violation + risco de banimento de domain.
- **Rejeitada:** custo de manutencao + risco legal/etico inviabiliza.

### Opcao D — NewsAPI.org / GNews / terceiros
**Pros:**
- Plug-and-play, zero scraper code.
- SLA garantido pelo provedor.

**Contras:**
- Custo $50-450/mes para tiers que cobrem queries por keyword/source.
- Cobertura poker eh **nicho ruim** — APIs generalistas indexam CNN, Reuters, NYT. Nao indexam blog GTO Wizard, blog Hand2Note, twitter handles tecnicos.
- Founder testou GNews em prototipo Sprint News-0 — < 5 items por mes relevantes.
- **Rejeitada:** custo alto + cobertura ruim para nicho.

### Opcao E — Scrape RSS+HTML proprio + xAI Live Search hibrido (escolhida)
Acima descrita. **Aceita** porque combina:
- Determinismo de RSS/HTML (zero hallucination em blogs).
- Acesso oficial ao X via xAI Live Search (citations reais, ToS-compliant, custo previsivel).
- Manutenibilidade — adapters por source isolados, fixtures HTML versionadas, layout-change defense in adapter (`return [] + log warn`).
- Custo total ~$1/mes (apenas xAI), 10x menor que Opcao B.

## Consequences

### Positivas
- **URLs sao reais.** Slip de URL morta cai para residual (apenas casos de blog que removeu o post pos-fetch). Reduz frustracao do usuario que clica e pega 404.
- **Datas atuais.** RSS/HTML reflete `pubDate` real do blog; xAI Live Search retorna `published_at` real do tweet. Audit metric "100% datas em Out/2024" cai para zero.
- **Tweet IDs reais.** Live Search retorna `https://x.com/{handle}/status/{realId}` validado por regex — embeddable, clickavel, viavel para preview futuro.
- **Custo previsivel + baixo.** ~$0.90/mes xAI fixo. Sem surpresa de bill.
- **Observabilidade.** Logs estruturados `[news/metric]`, `[news/source]`, `[news/dedupe]` com `runId` permitem dashboard futuro + debugging rapido.
- **Dedupe robusto.** 3 layers ordenados pegam: URLs identicas com utm diferentes (L1), titles parafraseados (L2), tweets que apenas re-citam blog (L3). Slip rate esperado < 5% (alvo Sprint News-3.1).
- **Resilience.** Source down NAO bloqueia batch — outras 14 sources concluem normalmente.
- **Frontend zero-impact.** Shape `/api/news` preservada — `NewsSlot.tsx` nao muda.

### Negativas
- **Manutencao de adapters HTML.** 9 adapters dependem de selectors CSS estaveis dos sites externos. CMS update silencioso pode quebrar adapter. Mitigation: cada adapter retorna `[]` + log warn `layout may have changed`; fixtures HTML em `tests/fixtures/news-html/` permitem repro rapido + fix em 1-2h por adapter. Custo esperado: ~1 quebra por adapter por ano = ~9 ajustes/ano = baixo.
- **Custo dev inicial alto.** RF-05.1 (9 adapters) eh XL (~27-36h dev). Sprint inteiro foi reestimado de M para 1.5-2 semanas dev por causa disso. Aceito porque alternativas (Opcao C/D) tem custo perpetuo > 1 sprint/ano em manutencao + bills externas.
- **Wipe `news_items`** — todos os items existentes sao deletados no flip. Aceito porque audit confirmou 100% sao fake; nada de valor a preservar.
- **xAI dependency hard.** `XAI_API_KEY` ausente → cron skip total. Founder precisa monitorar status da key + renovar se expirar. Mitigation: `[news/cron]` log error eh chamativo + `NEWS_FEED_ENABLED=false` flag continua disponivel para desligar manual sem deploy.
- **Layer 4 embeddings deferred** — risco de slip > 5% em prod nos primeiros meses. Mitigation: telemetria `skipped.layer1/2/3` permite medir; abertura Sprint News-3.1 condicional.
- **Heuristica de tweet trailing-zeros** pode dar falso-positivo em algum tweet legitimo cujo ID por acaso termine em `0000000000`. Probabilidade ≈ 1/10^10. Aceito.

### Neutras
- **Schema migration `RENAME COLUMN`** — DB atual nao tem triggers/views dependentes. Migration `0XXX_news_3_refactor.sql` aplica sem rollback complexo. Backup `pg_dump` antes.
- **Cron horario** — passa de `0 12 * * 1 America/Sao_Paulo` para `0 15 * * 1` UTC. Equivalente em prod (Brasil sem DST), mas convencao UTC eh padrao operacional + portavel.
- **9 fixtures HTML adicionadas** ao repo (~1MB total). Versionavel + necessario para testes de adapter.

## Mitigation de Riscos Especificos

| Risco | Probabilidade | Impacto | Mitigation |
|---|---|---|---|
| Layout change em CMS quebra adapter | Media | Medio | Per-adapter `return []` + log warn. Fixture HTML versionada. Founder vê metric `inserted: 0 consecutive` e dispara update. |
| xAI Live Search retorna URL hallucinated mesmo com `type='x'` | Baixa | Alto | Regex validation + drop trailing-zeros (decisao 2A). Se persistir, abrir issue na xAI. |
| Custo xAI explode > $5/mes | Baixa | Baixo | Cron 1x/semana × 9 X-sources = teto ~$1/mes. Alarme manual via dashboard xAI. |
| Layer 2 colide titles legitimos diferentes | Baixa | Baixo | Top 10 tokens + sort + sha256 minimiza. Slip > 5% em 4 semanas → Layer 4 embeddings. |
| Migration `RENAME` falha em DB com triggers | Baixa | Alto | `\d news_sources` confirma sem dependencias. `pg_dump` backup. |
| Wipe `news_items` causa stale cache | Baixa | Baixo | TanStack Query refetcha em mount. Repopula em 1 cron run. |
| `node-cron` UTC interpreta diferente em dev Windows | Baixa | Baixo | Test integration com fake time. Em prod (Linux/Neon), UTC garantido. |

## Plano de Rollout

**Fase 0 — pre-flip (atual):**
- `NEWS_FEED_ENABLED=false`. Sprint pipeline rodando.

**Fase 1 — flip dev:**
1. `db:push` migration.
2. Verify `news_items` count = 0, `news_sources` count = 15.
3. `NEWS_FEED_ENABLED=true` em `.env` local.
4. `POST /api/admin/news/refresh` manual.
5. Inspecionar `[news/metric]` + `[news/source]`. Esperar `inserted >= 5`.
6. QA visual em `/feed-de-noticias`.

**Fase 2 — QA founder manual:**
- Abrir 10 items random. Validar 200 OK + conteudo.
- Validar `published_at` em janela 2026-04-28..2026-05-04.
- Validar mistura blog + X.

**Fase 3 — flip prod:**
- Deploy normal.
- `NEWS_FEED_ENABLED=true` em prod.
- Aguardar primeiro cron auto (proxima Segunda 12:00 SP).
- Monitor 4 semanas.

**Fase 4 — observacao 4 semanas:**
- Metric chave: `slip_rate = duplicates_visible_to_user / total_inserted`.
- `slip_rate > 5%` → Sprint News-3.1 (Layer 4 embeddings).
- Adapter HTML com `inserted: 0` consistente → fix targetado.

## Confianca

**Alta** — decisao tem dados (audit 2026-05-04), restricoes claras (custo, manutenibilidade), e arquitetura desacoplada que permite substituir partes (provider, dedupe layer) sem rewrite total.

## Referencias

- Spec: `Docs/specs/news-3-rss-x-refactor.md`
- Audit: `Docs/audits/news-audit-2026-05-04.md`
- Sources lock: `Docs/audits/news-x-handles.md`
- ADR predecessor (superseded): `Docs/architecture/decisions/106-news-grok-llm-provider.md`
- Diagramas: `Docs/architecture/news-3-components.mermaid`, `news-3-sequence.mermaid`, `news-3-dedupe-flow.mermaid`
- xAI Live Search docs: https://docs.x.ai/docs/guides/live-search

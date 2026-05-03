# ADR-100 — News Feed: Estrutura Preparada Onda 1, Integracao xAI Grok Onda 3 (F4 fofocas vetada)

- Status: Proposto
- Data: 2026-05-03
- Sprint: home-reform-1 (Onda 1 da reforma da Home)
- Decision owner: system-architect (formaliza founder D-FOUNDER-3)
- Related: ADR-099 (cockpit pattern), ADR-101 (sidebar IA), ADR-102 (overview cache strategy)
- Spec: `Docs/specs/home-reform-1.md` §3 D-FOUNDER-3, §5.13 S15, §10.2, RF-02 a RF-05

---

## 1. Contexto

### 1.1. Diagnostico

Doc de pesquisa `Docs/strategy/home-reform-research-and-plan.md` v1.1 listou 2 propostas de news feed:

- **F4 — Fofocas/cravadas/resultados de torneios** (live tracking de resultados de outros pros, gossip da cena MTT, "X just won the Sunday Million for $X").
- **S15 — News feed reservado** (informacoes uteis: changelog de poker software, atualizacoes de plataformas, mudancas regulatorias, tournament announcements relevantes).

Founder vetou F4 permanentemente (D-FOUNDER-3 §49 da spec): "fofocas/cravadas/resultados torneios VETADA permanentemente — nao abrir hook futuro". Razao implicita: distracao, ruido, FOMO induzida, off-topic do produto-core (gestao + analise de performance pessoal).

S15 aprovado em principio, com integracao real adiada para Onda 3 via xAI Grok (custo estimado <$2/user/mes com cache 1-3h). Onda 1 entrega **estrutura preparada**: feature flag, contrato TS, endpoint stub, componente que renderiza null.

### 1.2. Forcas

- **Custo zero em Onda 1**: sem chamada a API externa, sem secret key (apenas env flag `NEWS_FEED_ENABLED=false`).
- **Contrato congelado em Onda 1**: tipo `NewsItem` em `shared/types/news.ts` deve ser estavel o suficiente para suportar ate 3 providers diferentes (xAI Grok, NewsAPI, scraper custom) sem breaking change — Onda 3 troca apenas implementacao do handler.
- **Componente sem espaco visivel em Onda 1**: D17 — `<NewsSlot enabled={false}>` retorna `null` (NAO `min-height` placeholder). Layout shift quando flag flipa em Onda 3 e aceito (R10 §15 da spec).
- **F4 hook fechado**: nenhum campo no `NewsItem` permite `result` de torneio, `winner`, `prize`, `gossip`, `playerName`. Tipo desenha-se ao redor de "informacao util do produto", nao "cobertura editorial".
- **Pendencia residual deixada pelo PM-Spec**: `server/routes/news.ts` standalone vs inline em `server/routes/home.ts`?

### 1.3. Pendencia residual deixada pelo PM-Spec (modulo standalone vs inline)

PM-Spec (§10.2) disse: "modulo `news.ts` (system-architect decide) — se inflar `home.ts` >300 linhas, separar".

Argumentos pro standalone:
- Onda 3 vai ter logica nao-trivial (chamada xAI Grok, cache 1-3h por source, validacao de payload, sanitizacao de URLs externos, possivel dedup por hash). Em modulo proprio, fica isolado e testavel.
- `home.ts` ja vai ter ~250 linhas em Onda 1 (orquestracao 9 subqueries + cache 30s + logging + auth). Adicionar `/api/news` inflaria para >300 e violaria padrao do projeto.
- 2 endpoints nao relacionados em 1 modulo dificulta `git blame` e ownership.

Argumentos pro inline:
- Onda 1 e stub trivial (~30 linhas). Standalone parece overengineered para esse momento.
- 1 modulo a menos para registrar em `server/routes/index.ts`.

---

## 2. Decisao

A. **Onda 1 entrega estrutura preparada para news feed sem custo de API externa**, em 4 artefatos:

1. **Feature flag `NEWS_FEED_ENABLED`** lida em ponto centralizado (preferencia: `server/config.ts` ou diretamente no handler `news.ts`). Default `false`. Truthy somente `'true'` ou `'1'` (defensivo).
2. **Tipo `NewsItem` + `NewsResponse`** em `B:\grindfy\shared\types\news.ts`:
   ```ts
   export interface NewsItem {
     id: string;
     source: 'poker-software' | 'reserved-future';
     title: string;
     summary: string;       // <= 280 chars (validacao runtime em Onda 3)
     url: string;
     publishedAt: string;   // ISO 8601
     fetchedAt: string;     // ISO 8601 — quando o backend buscou o item
     tags?: string[];
   }
   export interface NewsResponse {
     items: NewsItem[];
     enabled: boolean;
     cachedAt?: string;
     nextRefreshAt?: string;
   }
   ```
3. **Endpoint stub `GET /api/news`** com auth JWT, retornando `{ enabled: false, items: [] }` em Onda 1. Aceita `?source=poker-software&limit=5` (validados, ignorados em stub).
4. **Componente `<NewsSlot>`** em `B:\grindfy\client\src\components\home\NewsSlot.tsx`. Recebe `{ enabled: boolean; items: NewsItem[] }`. Em Onda 1 (`enabled === false`) retorna `null` (sem DOM, sem espaco reservado). Em Onda 3 com `enabled === true && items.length > 0` renderiza lista.

B. **F4 (fofocas/cravadas/resultados) vetada permanentemente.** Tipo `NewsItem` desenhado para vetar:
- `source` enum fechado ao membro `'poker-software' | 'reserved-future'`. Nao adicionar `'tournament-results'`, `'player-news'`, `'gossip'`. Reviewer reprova qualquer PR que estenda o enum nesta direcao.
- `summary` ate 280 chars desencoraja hot takes editoriais (forca brevidade tecnica).
- Sem campos `winner`, `prize`, `playerName`, `result`. Nao adicionar.

### 2.1. Resolucao da pendencia residual: `server/routes/news.ts` standalone

**Decisao do architect: standalone em `server/routes/news.ts`.**

Justificativa:
- `home.ts` ja tem responsabilidade clara de orquestracao composta (`/api/home/overview`). Adicionar `/api/news` mistura propositos.
- Onda 3 vai expandir `news.ts` com integracao real xAI Grok (~150 linhas estimadas: chamada, cache 1-3h, validacao payload, sanitizacao URL externa, dedup por hash). Isolar agora evita refactor depois.
- Padrao do projeto: `server/routes/` ja tem 17 modulos por dominio. `news` e um dominio proprio (mesmo que stub em Onda 1).
- Custo do standalone agora: ~30 linhas + 1 import em `server/routes/index.ts`. Trivial.

### 2.2. Pontos de extensao para Onda 3 (3 caminhos pre-mapeados)

`server/routes/news.ts` deve ser desenhado com 3 pontos de extensao explicitos para troca de provider (test-writer escreve testes que validam o contrato; implementer Onda 1 deixa stubs):

1. **`fetchNewsItems(source: NewsItem['source'], limit: number): Promise<NewsItem[]>`** — funcao isolada que Onda 3 substitui por chamada xAI Grok / NewsAPI / scraper. Onda 1: retorna `[]`.
2. **`getCacheKey(userId: string | null, source: string): string`** — chave de cache (Onda 1: nao usa; Onda 3: cache 1-3h por source, possivelmente shared entre users).
3. **`sanitizeNewsItem(raw: unknown): NewsItem | null`** — Zod parse + URL allowlist (Onda 3) — Onda 1: pass-through identidade ja que items sao `[]`.

Esses 3 pontos sao **contrato de Onda 1** — se implementer Onda 1 inlineiar tudo no handler sem separar, Onda 3 paga refactor desnecessario.

### 2.3. Arquivos tocados/criados (binding contract)

- `B:\grindfy\shared\types\news.ts` (NOVO — RF-03)
- `B:\grindfy\server\routes\news.ts` (NOVO — RF-02)
- `B:\grindfy\server\routes\index.ts` (registrar `news.ts`)
- `B:\grindfy\client\src\components\home\NewsSlot.tsx` (NOVO — RF-05)
- `B:\grindfy\CLAUDE.md` secao 4 (documentar env var `NEWS_FEED_ENABLED`)

`/api/home/overview` consome o resultado de `/api/news` **internamente via storage layer** (NAO via HTTP loopback — coerente com ADR-102 D5). O architect recomenda que `home.ts` importe a funcao `fetchNewsItems` diretamente de `server/routes/news.ts` (export dela) para evitar HTTP round-trip.

---

## 3. Opcoes Consideradas

### Opcao A — Inline `/api/news` em `home.ts` + sem `<NewsSlot>` em Onda 1

**Pros:**
- Menor footprint de codigo Onda 1.
- 1 modulo a menos.

**Contras:**
- Onda 3 paga refactor obrigatorio (separar handler, criar componente).
- `home.ts` cresce >300 linhas — viola padrao do projeto.
- Sem `<NewsSlot>` em Onda 1, Onda 3 introduz componente novo + integracao real ao mesmo tempo (acoplamento de risco).

### Opcao B — Standalone `news.ts` + `<NewsSlot>` em Onda 1 retornando null + 3 pontos de extensao (ESCOLHIDA)

**Pros:**
- Onda 3 troca **apenas** `fetchNewsItems` (e `getCacheKey`, `sanitizeNewsItem`). Sem refactor de modulo, sem novo componente, sem novo schema.
- Test-writer escreve testes Onda 1 que ja validam contrato (`enabled: false → null`, `enabled: true && items: [] → null`, `enabled: true && items: [...] → render`).
- Custo Onda 1: <100 linhas total (tipo + handler stub + componente que retorna null).
- F4 vetada via enum fechado.

**Contras:**
- 1 modulo a mais para registrar em Onda 1.
- `<NewsSlot>` em Onda 1 e DOM-invisivel — pode parecer "codigo morto" para reviewer destreinado. Mitigado por testes de unit que validam os 3 estados.

### Opcao C — Implementar xAI Grok em Onda 1 com flag off

**Pros:**
- Onda 3 nao tem trabalho de integracao.

**Contras:**
- Requer secret key da xAI agora.
- Custo de testes (mocks de API externa, retry, fallback).
- Onda 1 vira sprint de "news integration" no meio da reforma da Home — quebra escopo.
- Founder explicitamente disse "Onda 3" (D-FOUNDER-3).

---

## 4. Consequencias

### 4.1. Positivas

- **Custo zero de API externa em Onda 1** — apenas env var + ~100 linhas TS.
- **Contrato congelado** — `NewsItem` valido para xAI Grok, NewsAPI, scraper custom (3 providers possiveis sem breaking change).
- **F4 vetado via enum** — reviewer reprova qualquer PR que estenda `source` para `'tournament-results'` etc.
- **3 pontos de extensao explicitos** (`fetchNewsItems`, `getCacheKey`, `sanitizeNewsItem`) — Onda 3 troca implementacao sem refactor de modulo.
- **`/api/home/overview` consome via import direto** — sem HTTP loopback, performance preservada (ADR-102 D5).
- **Layout-wise invisivel em Onda 1** — usuario nao ve "vazio decorativo". Layout shift quando flag flipa em Onda 3 aceito.

### 4.2. Negativas

- **`<NewsSlot>` em Onda 1 e DOM-invisivel** — pode parecer codigo morto. Mitigado por testes unit.
- **Onda 3 paga layout shift** quando flag flipa de `false` para `true` e items aparecem (R10 §15 da spec). Aceito explicitamente.
- **Cache strategy Onda 3 nao decidido aqui** — ADR Onda 3 vai resolver (1-3h por source, possivelmente shared entre users vs per-user).

### 4.3. Neutras

- **`NEWS_FEED_ENABLED` em CLAUDE.md secao 4** vira variavel opcional de producao — documentada.
- **Onda 3 pode trocar provider sem ADR novo** — a decisao de "qual provider" e tatica, nao arquitetural. ADR Onda 3 pode ser apenas sobre cache strategy se mantiver os 3 pontos de extensao.

---

## 5. Confianca

**Alta.** Decisao alinhada com D-FOUNDER-3 (Onda 1 estrutura, Onda 3 integracao real, F4 vetada). Padrao "feature flag + contrato + stub + componente null" ja foi usado em Sprint Biblioteca (ADR-072 Mux integration deferida). 3 pontos de extensao mapeados antes de Onda 3 evita refactor.

---

## 6. Notas de Implementacao

- `summary` documentado como `<= 280 chars` em JSDoc no tipo `NewsItem`. Validacao runtime via Zod **fica para Onda 3** (ja que items: [] em Onda 1).
- `cachedAt` e `nextRefreshAt` opcionais em `NewsResponse` — Onda 1 nao popula; Onda 3 popula para frontend exibir "atualizado ha X min".
- Reviewer reprova qualquer PR de Onda 1 que adicione UI visivel ao `<NewsSlot>` (ate `<div className="hidden">` e overkill — retornar `null` literal).
- `<NewsSlot>` em Onda 1 nao precisa `data-testid` visivel ja que renderiza null. Teste DOM-query usa `queryByTestId('home-news-slot')` que retorna null (RF-19).

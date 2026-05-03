# ADR-106 — News Feed: Integracao xAI Grok + revogacao do veto F4 + opt-in granular

- Status: Aceito
- Data: 2026-05-03
- Sprint: news-1 (Onda 3 do plano de news feed)
- Decision owner: founder (revoga veto previo D-FOUNDER-3) + system-architect
- Related: ADR-100 (estrutura preparada Onda 1), ADR-099 (cockpit), ADR-101 (sidebar IA)
- Spec: `Docs/specs/news-1.md` (a criar)

---

## 1. Contexto

### 1.1. Mudanca de premissa

ADR-100 §2.B vetou permanentemente F4 (fofocas/cravadas/resultados de torneios) com base em D-FOUNDER-3. Founder reverteu a decisao em 2026-05-03 com nova premissa:

> Pode retirar o veto, mas tambem e opcional ao usuario receber ou nao essas noticias. Tudo deve ser configuravel via engrenagem na sessao onde ele pode habilitar/desabilitar plataformas determinadas e tipos de noticias (Fofocas, cravadas etc).

Premissa atualizada:
- F4 destravada SOB CONDICOES estritas de opt-in granular.
- Distracao/FOMO mitigada por: default off, gear icon visivel, toggles per-platform AND per-category.
- Plataforma vira plataforma de informacao customizavel, nao feed editorial empurrado.

### 1.2. Forcas

- **xAI Grok como provider unico Onda 3** (D-FOUNDER-3 ADR-100 §2). Grok tem Live Search no X que cobre fofocas BR (handles de pros, casas de poker, sites editoriais). Custo estimado <$2/user/mes com cache 1-3h.
- **3 categorias de noticias**:
  - `market` — lancamentos de redes (PokerStars/GG/WPN/etc), atualizacoes de software (PT4/HM3/Hand2Note/Jurojin/Intuitive Table/GTO Wizard).
  - `gossip` — pautas hypadas dos veiculos BR (CardPlayer BR, PokerNews BR, posts de pros no X).
  - `tournament-results` — cravadas, ITM grandes (futuro proximo, mesmo enum desde Onda 3 pra evitar migration).
- **Granularidade per-platform** — usuario liga/desliga noticias da Hand2Note independente das do PokerStars.
- **Sites do user detectados via CSV** — `tournaments.platform DISTINCT WHERE userId = X` alimenta lista pre-marcada como "interesse implicito" no modal de preferencias.
- **Catalogo gerenciavel admin** — `news_sources` table permite founder/admin adicionar fontes novas sem deploy.
- **Compatibilidade ADR-100** — campos novos sao opcionais; tipo `NewsItem` evolui sem breaking change pros 2 testes existentes (news-stub.test, news-types.test).

### 1.3. Pendencias resolvidas neste ADR

- Enum `source` expandido pra `'market' | 'gossip' | 'tournament-results' | 'reserved-future'`.
- Campo `platform` adicionado (string FK logica pra `news_sources.id`).
- Campos opcionais `thumbnailUrl`, `engagement` (likes/views) pra fofocas com prova social.

---

## 2. Decisao

### 2.1. Revogar veto F4 (ADR-100 §2.B)

`source` enum expandido pra:
```ts
type NewsSource = 'market' | 'gossip' | 'tournament-results' | 'reserved-future';
```

Anti-padroes ADR-100 §2.B (proibicao de campos `winner`, `prize`, `playerName`, `result`) **revogados**. Esses campos vivem em `engagement` ou `meta` opcional.

### 2.2. Opt-in obrigatorio com 4 niveis de controle

1. **Master flag por categoria** (default OFF):
   - `userPrefs.market.enabled = false`
   - `userPrefs.gossip.enabled = false`
   - `userPrefs.tournamentResults.enabled = false`
2. **Per-platform** (default OFF mesmo se categoria ON):
   - `userPrefs.market.platforms = { 'hand2note': true, 'pokertracker': false, ... }`
3. **Detect via CSV** — plataformas presentes em `tournaments.platform` aparecem no topo da lista marcadas como "Voce joga aqui" mas ainda OFF por default.
4. **Master kill-switch global** — env `NEWS_FEED_ENABLED=false` desliga tudo independente de pref user (para incidente / debug).

### 2.3. UI: gear icon per-section

Cada secao de noticias em Home (MarketNewsSection, GossipNewsSection) renderiza gear icon no header. Click abre `<NewsPreferencesDialog>` com 3 abas (Mercado / Fofocas / Resultados). Cada aba lista plataformas/veiculos com Switch + descricao curta. Botao "Salvar" persiste via `PATCH /api/news/preferences`.

### 2.4. Provider unico xAI Grok

`server/services/grokNewsProvider.ts` chama xAI API (compativel com OpenAI SDK). Modelo default `grok-3-latest` (override via `XAI_MODEL`). Live Search habilitado pra `gossip` (busca posts no X de handles configurados em `news_sources`).

Fallback graceful: se `XAI_API_KEY` ausente, provider retorna `[]` + log warn. Cron skipa refresh. Frontend renderiza placeholder "Configurando provider".

### 2.5. Schema DB (3 tabelas novas)

- **`news_sources`** — catalogo gerenciavel:
  - `id` (slug: 'hand2note', 'pokerstars', 'cardplayer-br', 'x-handle-akitabaa')
  - `category` ('market' | 'gossip' | 'tournament-results')
  - `name`, `description`, `icon_url`, `enabled` (admin pode desativar fonte globalmente)
  - `query_template` (string com placeholder {{period}} pra prompt do Grok)
  - `live_search_handle` (nullable — handle do X pra fofocas)
- **`news_items`** — cache compartilhada (sem userId — todas as noticias sao publicas):
  - `id` (nanoid), `source_id` FK news_sources, `category`, `platform`
  - `title`, `summary` (<=280), `url`, `thumbnail_url`, `published_at`, `fetched_at`
  - `engagement_likes`, `engagement_views` (nullable)
  - `content_hash` UNIQUE (sha256 url+title) pra dedup cron
  - `expires_at` (TTL 7d, cron purga)
- **`user_news_preferences`** — toggles per user:
  - `user_id` FK users
  - `category` enum
  - `enabled` boolean (master da categoria)
  - `platform_toggles` jsonb (`{ "hand2note": true, "pokertracker": false }`)
  - `updated_at`
  - PK composto (user_id, category)

### 2.6. Endpoints

- `GET /api/news?type=market|gossip|tournament-results&limit=N` — retorna items filtrados por user prefs + cache.
- `GET /api/news/preferences` — retorna prefs completas + lista de plataformas detectadas via CSV.
- `PATCH /api/news/preferences` — atualiza prefs (validacao Zod).
- `GET /api/news/sources?category=X` — catalogo publico (auth required).
- `POST /api/admin/news/sources` + `PATCH/:id` + `DELETE/:id` — admin only.

### 2.7. Cron refresh — WEEKLY + TOP 5 (decisao founder 2026-05-03)

`server/jobs/refreshNews.ts` rodando node-cron com cadencia UNICA:
- `0 12 * * 1` America/Sao_Paulo (toda segunda 12:00 BRT) — refresh de TODAS as categorias.
- Limite duro: `top 5` items por categoria por refresh (provider chamado com `limit=5`).
- Idempotente via `content_hash` UNIQUE.
- Skipa se `NEWS_FEED_ENABLED !== 'true'`.

Custo: 1 chamada xAI por source ativa por semana × 5 items. Estimativa <<$1/mes total.

UI deve exibir badge "Atualizado semanalmente · Top 5" em cada secao pra setar expectativa do usuario (sem feed infinito, sem refresh real-time).

### 2.8. Onde exibir Onda 3

- Home (NewsSlot expandido): MarketNewsSection compacta (3 items) + GossipNewsSection compacta (3 items). Cada uma com gear + "Ver tudo".
- Pagina dedicada `/noticias` (futuro Onda 3.5) — lista paginada por categoria.

### 2.9. Veiculos iniciais (seed news_sources)

**Market — software (todos default OFF, user opt-in):**
- hand2note, pokertracker, holdem-manager, jurojin, intuitive-table, gto-wizard, sharkscope

**Market — redes (auto-detect via CSV + manual):**
- pokerstars, ggpoker, wpn-acr, partypoker, 888poker, coinpoker, bodog, chico, ipoker

**Gossip BR (seed inicial — admin pode estender):**
- cardplayer-br, pokernews-br, suprema-poker (handles X a definir com founder)

---

## 3. Opcoes Consideradas

### Opcao A — Fofocas como subset de market sem categoria propria

**Pros:** schema mais simples (1 enum value).
**Contras:** opt-in granular nao funciona (user nao consegue ligar so market e desligar gossip).

### Opcao B — 3 categorias separadas + opt-in granular (ESCOLHIDA)

**Pros:** alinha exatamente com pedido do founder. Per-platform + per-category. F4 destravada mas controlavel.
**Contras:** schema mais complexo (3 tabelas, 2 enums).

### Opcao C — Provider multi (Grok + NewsAPI + scraper)

**Pros:** redundancia.
**Contras:** out-of-scope Onda 3. Founder pediu Grok especifico.

---

## 4. Consequencias

### 4.1. Positivas

- Founder ganha controle total via UI gear (sem precisar editar code/env).
- F4 destravada mas mitigada (default off + opt-in granular).
- Catalogo gerenciavel admin permite adicionar fontes BR sem deploy.
- ADR-100 fica historico — nada removido, apenas §2.B revogado por este ADR.

### 4.2. Negativas

- Schema cresceu — 3 tabelas + 2 enums + 1 jsonb.
- Cron depende de XAI_API_KEY ativa em prod.
- Custo xAI API real (estimado <$2/user/mes mas depende de adoption).

### 4.3. Neutras

- Tipo `NewsItem` evolui com campos opcionais — testes existentes ADR-100 continuam passando (back-compat).
- ADR-100 §2.A (3 pontos de extensao) preservado — `fetchNewsItems`/`getCacheKey`/`sanitizeNewsItem` viram implementacao real Onda 3.

---

## 5. Confianca

**Alta.** Decisao alinhada com revogacao explicita do founder. Padrao "opt-in granular + admin-managed catalog" ja foi usado em Sprint Bankroll-2 (per-wallet preferences). xAI Grok SDK e OpenAI-compativel — risco de integracao baixo.

---

## 6. Notas de Implementacao

- `XAI_API_KEY` documentado em CLAUDE.md secao 4 como obrigatorio se `NEWS_FEED_ENABLED=true`.
- Gear icon usa `lucide-react` `Settings` icon. Dialog usa Radix Dialog primitive (consistente com NewsPreferences pattern existente).
- Reviewer reprova qualquer PR que: (1) marque categoria como ON por default, (2) puxe noticias sem chamar `userNewsPreferences.enabled`, (3) faca chamada Grok sem cache check.
- Conteudo `gossip` deve preservar URL original de saida (link out pra X/CardPlayer/etc) — Grindfy nao reposta texto integral, so summary <=280 chars + link. Reduz risco copyright.
- LGPD: usuario consente explicitamente via opt-in. Sem dados pessoais no fluxo (so user_id pra preferencia).

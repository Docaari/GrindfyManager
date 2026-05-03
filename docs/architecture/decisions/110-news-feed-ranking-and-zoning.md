# ADR-110 — News Feed Ranking + Home Zoning (Onda 3)

- Status: Aceito
- Data: 2026-05-03
- Sprint: home-reform-3
- Decision owner: founder + system-architect
- Related: ADR-099 (cockpit), ADR-100 (news deferred), ADR-101 (sidebar IA), ADR-106 (Grok provider)
- Spec: `Docs/specs/home-reform-3.md`

---

## 1. Contexto

A Home `/` cresceu para ~14 cards empilhados em layout flat misturando cronologia, topico e fonte externa. NewsSlot renderiza 5 `<NewsSection>` separadas (cada uma com seu badge de refresh, 3 items max) totalizando 15 itens visiveis e 5 chamadas redundantes de cron metadata. Founder reportou:

- "Densidade nao bate com realidade — tenho 14 cards e ainda preciso scrollar pra ver banca."
- "Listinhas separadas de news fazem parecer 5 RSS feeds. Eu queria ver o que e relevante hoje, nao por categoria."
- "StatusStrip some quando scrollo — perde o sentido de cockpit."

ADR-100 ja preparou estrutura news + ADR-106 entregou provider Grok ranqueado por engagement no batch. Onda 3 capitaliza esse trabalho: consolida UI sem mexer em provider/jobs/schema.

---

## 2. Decisao

### 2.1. Endpoint `/api/news/feed` unificado com ranking server-side

Substitui 5 GETs `/api/news?type={market|gossip|...}` por 1 endpoint que retorna top 10 globais ja ranqueados.

```
score = engagement_norm * 0.6 + recency_norm * 0.4
```

- `engagement_norm = log1p(views + likes*5 + comments*10) / log1p(maxBatch)` — log1p suaviza outliers virais; normalizacao por max do batch evita escala absoluta.
- `recency_norm = 1 - clamp((now - publishedAt) / 7d, 0, 1)` — items >7d zeram componente recencia mas ainda podem rankear se engagement_norm alto.
- Tiebreak: `NEWS_CATEGORY_PRIORITY.indexOf(item.source)` ASC (`tools > sites > studies > tournament-results > gossip`).
- Cache server in-memory por userId, 5min TTL (alinhado com cron semanal).
- Endpoints atuais `/api/news?type=X` MANTIDOS para back-compat de `/noticias` (Onda 3.5).

**Por que 0.6/0.4 e nao 0.5/0.5:** sprints anteriores mostraram que recencia pura privilegiava posts do dia com 5 likes sobre cravadas da semana com 500 likes — engagement domina mas recencia ainda quebra empates dentro da mesma categoria.

### 2.2. 4 zonas semanticas substituindo flat layout

Home reorganizada em 4 `<section data-testid="home-zone-N">` com `<h2 className="text-xs uppercase tracking-wide text-muted-foreground">` sutil:

1. **Hoje** — DailyInsight, TodayCard, NextTournamentCountdown
2. **Acao Imediata** — PendingHandsList, LibraryResume, TournamentRecommendations, HeuristicsCard
3. **Performance** — PerformanceMini, StatsTopDeltas+VarianceCard, LifetimeStats, RecentSessionsList
4. **Sinal Externo** — NewsFeed (zona inteira)

Headings dao orientacao topica (jogador ve "estou na zona Performance" sem ler labels individuais). Banners (Cooldown/Flight) e StatusStrip ficam ACIMA das zonas — alertas globais nao competem com topico.

### 2.3. NewsFeed unificado (hero + compact)

Substitui 5 NewsSection por 1 `<NewsFeed>`:

- Item #1 = hero (`aspect-video w-full`, titulo h3, summary 2 linhas, badge categoria).
- Items #2-10 = compactos (linha horizontal `[#N] [thumbnail 48x48] [titulo+summary]`).
- Filter chips client-side: `Todas | Tools | Sites | Studies | Resultados | Fofocas`.
- 1 RefreshBadge unico (vs 5 atuais).

Server faz ranking + truncate; client filtra in-memory pelo top 10 (custo zero, evita N requests por filtro).

### 2.4. Read-state via localStorage `news.read.{id}`

Items lidos persistem entre visitas com `opacity-60` + checkmark.

**Trade-off considerado:** server-side (`user_news_read` table) vs localStorage.
- Server-side: cross-device, audit, mas exige migration + endpoint + invalidacao cache + custo write per click.
- localStorage: zero backend, instantaneo, escala 0, MAS perde-se ao trocar device/browser.

Founder usa 1 device primario (desktop). Cross-device read-state nao paga sua complexidade neste momento. Hook `useNewsReadState()` encapsula API; migracao server-side futura troca implementacao sem mexer em call-sites. Limpeza automatica >90 dias OU >200 entries evita bloat.

### 2.5. StatusStrip sticky (`position: sticky; top: 0; z-30`)

Strip fixo no topo com `backdrop-blur-sm bg-background/85`. KPIs Banca/ROI/Sessoes Hoje/Streak ficam sempre acessiveis sem scroll-to-top. Border bottom sutil aparece apenas quando `scrollY > 0` (CSS shadow ou listener leve). Z-index 30 fica abaixo de dialogs (z-50 padrao Radix) mas acima de cards regulares.

---

## 3. Consequencias

### Positivas
- 1 endpoint vs 5 = -80% requests news em mount.
- Ranking global revela "o que importa hoje" cross-categoria; top 10 ranqueado >> 5 listinhas truncadas.
- 4 zonas dao mapa mental claro; densidade aumenta sem virar wall-of-text.
- StatusStrip sticky transforma Home em cockpit operacional real.
- Read-state local sem custo backend.
- Frontend-pesado, zero migration: rollback = `git revert`.

### Negativas
- Ranking 0.6/0.4 pode privilegiar gossip viral sobre tools updates relevantes — mitigado por tiebreak de prioridade categoria.
- Read-state nao cross-device — aceito explicitamente; migracao futura possivel sem breaking change.
- Cache 5min server in-memory: instancia restart limpa cache (aceitavel — proxima request reconstroi do DB em <50ms).

### Neutras
- `/api/news?type=X` legacy mantidos enquanto `/noticias` (Onda 3.5) os usar. Deprecation futura quando `/noticias` migrar para `/api/news/feed`.
- NewsSlot legacy preservado exportado (testes Onda 1 dependem) mas nao usado em Home.

---

## 4. Confianca

**Alta** — decisoes incrementais sobre ADRs 100/106 ja em producao, escopo frontend-pesado com 1 endpoint isolado, rollback trivial.

# Spec: Tournament Selector Inteligente

## Status
Proposta

## Resumo
Sistema de scoring que cruza o ROI historico do jogador (em multiplas dimensoes — site, buy-in, categoria, velocidade, dia da semana, horario, field size) com a oferta de torneios disponiveis hoje (Suprema via API + torneios da biblioteca pessoal) e ranqueia cada torneio por edge esperado, exibindo um score 0-100 + grade S/A/B/C/D + rationale curto. O jogador escolhe a grade com base em dados proprios em vez de "intuicao" ou "lista do SharkScope".

## Contexto
**Posicao no roadmap:** Sprint 1 do roadmap aprovado em 2026-04-23 (`docs/strategy/2026-04-23-product-roadmap.md`), maior ICE do catalogo (8.0).

**Por que agora:**
1. Mata o argumento "uso SharkScope porque ele me diz onde tenho edge" — replicamos a feature mais elogiada do concorrente com o diferencial de usar o ROI proprio do jogador (nao media de mercado).
2. Ataca Lobbyze pelo flanco da inteligencia — em vez de tentar competir com 10+ redes, oferecemos selecao mais inteligente onde estamos (Suprema + redes que o jogador trackeia via CSV).
3. Fecha o loop "uso o Grindfy ANTES de grindar" — hoje o jogador usa o Grindfy depois (analise) ou durante (grind live). Selecao pre-grind e o ultimo elo faltante.
4. **Custo de oportunidade baixo** — todos os dados ja existem:
   - Endpoints `/api/analytics/by-*` retornam ROI por dimensao (analytics.ts:55-148)
   - `/api/suprema/tournaments?date=YYYY-MM-DD` retorna torneios do dia com campos enriquecidos (lateRegMinutes, startingStack, maxPlayers, gameType, blindLevelMinutes)
   - Tournament Library v2 tem catalogo pessoal de torneios manuais
   - Grade Planner consome `planned_tournaments` e tem botao "Importar Suprema"

**Premissa:** A feature e read-only sobre dados existentes. Nao requer novas tabelas (apenas, opcionalmente, um cache em memoria + log de scores para evolucao do algoritmo).

## Usuarios

- **Jogador (user) — caso principal:** Antes de comecar a grindar, abre o Selector, ve a lista do dia ranqueada por edge esperado, clica "Adicionar a grade" nos torneios top-rated, comeca a sessao com grade otimizada.
- **Jogador novo (cold start):** Tem <50 torneios no historico. O sistema reconhece, exibe banner "Importe mais historico para personalizar" e mostra ranking generico (baseado em metricas universais: nao-Hyper, fields medios, horario nobre) + recomendacao de upload.
- **AI Coach (consumidor secundario):** A persona "Tournament Selection" do AI Coach (ja existente) pode chamar o endpoint `/api/tournament-selector` como ferramenta para responder perguntas como "qual torneio voce me sugere agora?".

## Requisitos Funcionais

### RF-01: Endpoint de scoring `/api/tournament-selector`

**Descricao:** Endpoint backend que recebe uma data, busca os torneios disponiveis (Suprema + biblioteca pessoal do usuario para o dia da semana correspondente), busca o historico analitico do jogador, calcula o score de cada torneio e retorna a lista ranqueada.

**Endpoint:** `GET /api/tournament-selector?date=YYYY-MM-DD`

**Query params:**

| Param | Tipo | Default | Descricao |
|---|---|---|---|
| `date` | string (YYYY-MM-DD) | hoje | Data alvo do scoring |
| `sources` | string (csv) | `suprema,library` | Fontes a incluir: `suprema`, `library`, ou `suprema,library` |
| `minScore` | integer (0-100) | 0 | Filtra resultados com score >= valor |
| `minSample` | integer | 0 | Filtra resultados com sample size do bucket primario >= valor |
| `bankrollFilter` | boolean | false | Se `true`, filtra torneios fora do bankroll (depende de bankroll cadastrado em user_settings; se nao cadastrado, ignora flag) |
| `lookbackDays` | integer | 180 | Janela de historico do jogador a considerar (default 180 dias = 6 meses) |

**Auth:** JWT obrigatorio (`requireAuth`).

**Rate limit:** 30 req/min por usuario (mesma instancia do `analyticsLimiter` ja existente, ou nova dedicada).

**Response (200):**
```json
{
  "date": "2026-04-23",
  "playerProfile": {
    "totalTournaments": 1247,
    "lookbackDays": 180,
    "lookbackTournaments": 423,
    "coldStart": false,
    "overallRoi": 12.4,
    "coverage": {
      "sites": ["Suprema", "PokerStars", "GGPoker"],
      "buyInRanges": ["$5-$11", "$11-$22", "$22-$55"],
      "categories": ["Vanilla", "PKO"],
      "speeds": ["Normal", "Turbo"]
    }
  },
  "tournaments": [
    {
      "id": "suprema-12345",
      "source": "suprema",
      "name": "Mystery KO $22",
      "site": "Suprema",
      "buyIn": 22.00,
      "guaranteed": 5000.00,
      "startTime": "2026-04-23T22:00:00-03:00",
      "time": "22:00",
      "dayOfWeek": 4,
      "category": "PKO",
      "speed": "Turbo",
      "gameType": "NLH",
      "fieldSizeEstimate": 280,
      "lateRegMinutes": 60,
      "startingStack": 10000,
      "blindLevelMinutes": 8,
      "score": 87,
      "grade": "S",
      "confidence": "high",
      "rationale": "ROI 18% em PKO Suprema $11-$25 (87 amostras, 90d). Horario nobre confere com seu melhor turno (21h-00h: ROI 21%).",
      "signals": {
        "siteRoi": { "value": 14.2, "sample": 312, "weight": 0.20, "score": 76 },
        "buyInRoi": { "value": 16.8, "sample": 134, "weight": 0.20, "score": 82 },
        "categoryRoi": { "value": 18.1, "sample": 87, "weight": 0.20, "score": 88 },
        "speedRoi": { "value": 9.4, "sample": 245, "weight": 0.10, "score": 64 },
        "dayOfWeekRoi": { "value": 22.5, "sample": 78, "weight": 0.10, "score": 91 },
        "timeOfDayRoi": { "value": 21.0, "sample": 102, "weight": 0.15, "score": 88 },
        "fieldRoi": { "value": 11.2, "sample": 188, "weight": 0.05, "score": 70 }
      },
      "warnings": [],
      "bankrollOk": true,
      "alreadyInGrid": false
    }
  ],
  "totalAvailable": 47,
  "totalReturned": 47,
  "generatedAt": "2026-04-23T18:32:01-03:00",
  "cacheHit": false
}
```

**Regras de negocio:**
- Combina torneios de duas fontes:
  - **Suprema** (`source: "suprema"`): chamada interna para o servico `getSupremaTournaments(date)` (mesmo cache de 1h ja usado pelo `/api/suprema/tournaments`)
  - **Library** (`source: "library"`): torneios da `tournament_library` do usuario filtrados por `dayOfWeek == derivado(date)` E `isInTrash == false`
- Se `sources` nao inclui `suprema`, NAO chama a API externa (economia)
- Se `sources` nao inclui `library`, ignora a biblioteca
- Para cada torneio, chama `computeTournamentScore(tournament, playerAnalytics)` (RF-02)
- Lista ordenada por `score DESC`, depois por `confidence DESC` ("high" > "medium" > "low"), depois por `startTime ASC`
- Campo `alreadyInGrid: true` se ja existe `planned_tournament` do usuario para o mesmo dia com mesmo `externalId` (Suprema) ou mesmo `name + time + site` (library/manual)
- Campo `bankrollOk`: derivado de `user_settings.bankroll` e regra "1% rule" (default 100 buy-ins), com tolerancia de 1.5x; se bankroll nao cadastrado, sempre `true`
- Cache de scoring por (userId, date, sources): TTL de 30 minutos (mais curto que cache Suprema porque depende de dados do usuario que podem mudar com upload novo)

**Criterio de aceitacao:**
- [ ] `GET /api/tournament-selector?date=2026-04-23` retorna lista ranqueada
- [ ] Sem auth retorna 401
- [ ] `date` ausente: usa data de hoje (timezone do servidor)
- [ ] `date` em formato invalido (ex: `23-04-2026`) retorna 400
- [ ] `sources=suprema` retorna apenas torneios Suprema
- [ ] `sources=library` retorna apenas torneios da biblioteca
- [ ] `sources=suprema,library` retorna ambos misturados e ordenados por score
- [ ] `minScore=70` filtra torneios com score < 70
- [ ] `minSample=30` filtra torneios cujo bucket primario tem sample < 30
- [ ] `bankrollFilter=true` com bankroll cadastrado oculta torneios acima do limite
- [ ] `bankrollFilter=true` sem bankroll cadastrado nao filtra nada (e nao retorna erro)
- [ ] Lista ordenada por score DESC
- [ ] Cada torneio tem campos: id, source, name, site, buyIn, score (0-100), grade (S/A/B/C/D), confidence (low/medium/high), rationale (string), signals (objeto com 7 buckets)
- [ ] `alreadyInGrid` = true para torneios ja em `planned_tournaments` do usuario na mesma data
- [ ] Segunda chamada com mesmos params em <30min retorna `cacheHit: true` (sem recomputar)
- [ ] 31a requisicao no minuto retorna 429
- [ ] Resposta em <500ms no p95 mesmo com 200 torneios e 5k+ historico

---

### RF-02: Algoritmo de scoring `computeTournamentScore()`

**Descricao:** Funcao pura que recebe um torneio (com campos suficientes para classificacao) + as estatisticas analiticas pre-carregadas do jogador, e retorna `{ score, grade, confidence, rationale, signals, warnings }`.

**Assinatura:**
```typescript
function computeTournamentScore(
  tournament: ScoringInputTournament,
  playerAnalytics: PlayerAnalyticsBundle,
  options?: ScoringOptions
): TournamentScoreResult
```

**Inputs (`ScoringInputTournament`):**

| Campo | Origem | Como classificar |
|---|---|---|
| `site` | direto | usado como bucket exato |
| `buyIn` | direto (number BRL ou USD ja convertido para BRL) | bucketizado em faixas: `$0-1.99`, `$2-4.99`, `$5-10.99`, `$11-21.99`, `$22-54.99`, `$55-109.99`, `$110-219.99`, `$220+` (mesma logica do `getAnalyticsByBuyinRange`) |
| `category` | direto: "Vanilla", "PKO", "Mystery" | bucket exato |
| `speed` | direto: "Normal", "Turbo", "Hyper" | bucket exato |
| `dayOfWeek` | derivado da data: 0 (dom) a 6 (sab) | bucket exato |
| `time` (HH:mm) | direto | bucketizado por turno: `madrugada` (00:00-05:59), `manha` (06:00-11:59), `tarde` (12:00-17:59), `noite-cedo` (18:00-20:59), `noite-nobre` (21:00-23:59) |
| `fieldSizeEstimate` | de `maxPlayers` (Suprema) ou null | bucketizado: `pequeno` (<100), `medio` (100-499), `grande` (500-1999), `massivo` (2000+); se null, sinal `fieldRoi` recebe peso 0 |

**Inputs (`PlayerAnalyticsBundle`):** Pacote pre-carregado pelo endpoint, contendo:
```typescript
{
  totalTournaments: number,
  bySite: { site: string, sample: number, roi: number, profit: number }[],
  byBuyIn: { range: string, sample: number, roi: number }[],
  byCategory: { category: string, sample: number, roi: number }[],
  bySpeed: { speed: string, sample: number, roi: number }[],
  byDayOfWeek: { dayOfWeek: number, sample: number, roi: number }[],
  byTimeOfDay: { bucket: string, sample: number, roi: number }[],
  byField: { range: string, sample: number, roi: number }[]
}
```

> **Nota:** O analytics atual nao tem `byTimeOfDay` — sera necessario adicionar `getAnalyticsByTimeOfDay()` no `storage.ts`. Spec abre essa dependencia explicitamente em RF-06.

**Algoritmo de scoring (combinacao linear ponderada com confidence shrinking):**

**Passo 1 — Para cada um dos 7 sinais, calcular `bucketScore` 0-100 a partir do ROI bruto:**

```
bucketScore = clamp( 50 + (roi * 2), 0, 100 )
```
- ROI 0% → score 50 (neutro)
- ROI +10% → score 70
- ROI +25% → score 100 (cap)
- ROI -10% → score 30
- ROI -25% → score 0 (cap)

**Passo 2 — Aplicar shrinkage por sample size (low-sample buckets puxam pra 50):**

```
shrunkScore = ((bucketScore * sample) + (50 * shrinkConstant)) / (sample + shrinkConstant)
```
Onde `shrinkConstant = 30` (literatura de bayesian shrinkage para domínios com alta variancia, validavel com dados reais no Sprint).

- sample 30 com bucketScore 100 → shrunkScore 75
- sample 100 com bucketScore 100 → shrunkScore 88
- sample 5 com bucketScore 100 → shrunkScore 57

**Passo 3 — Pesos por sinal (hardcoded no MVP, configuravel em fase futura):**

| Sinal | Peso |
|---|---|
| `siteRoi` | 0.20 |
| `buyInRoi` | 0.20 |
| `categoryRoi` | 0.20 |
| `speedRoi` | 0.10 |
| `dayOfWeekRoi` | 0.10 |
| `timeOfDayRoi` | 0.15 |
| `fieldRoi` | 0.05 |
| **Total** | **1.00** |

**Passo 4 — Score final:**

```
finalScore = round( sum(shrunkScore_i * weight_i for each signal i) )
```

Se `fieldSizeEstimate` for null, redistribuir o peso 0.05 do `fieldRoi` proporcionalmente entre os outros 6 sinais (somar 0.05/6 a cada peso).

**Passo 5 — Grade:**

| Score | Grade |
|---|---|
| >= 85 | S |
| 70-84 | A |
| 55-69 | B |
| 40-54 | C |
| < 40 | D |

**Passo 6 — Confidence:**

Determinada pelo bucket primario (`buyInRoi` AND `categoryRoi` ambos):
- `high`: ambos os buckets tem sample >= 30
- `medium`: pelo menos um bucket tem sample >= 15
- `low`: ambos tem sample < 15

**Passo 7 — Rationale (texto curto, max 200 chars):**

Template:
```
"ROI {topSignalRoi}% em {topSignalName} ({topSignalSample} amostras, {lookbackLabel}). {secondSignalSentence}"
```

Onde:
- `topSignal` = sinal com maior `(shrunkScore * weight)` que NAO seja siteRoi
- `secondSignalSentence` = 0 ou 1 sentenca curta destacando outro sinal positivo (ROI > 10% E sample >= 30) ou alerta (ROI < -10% E sample >= 30)

Exemplos:
- `"ROI 18% em PKO Suprema $11-$25 (87 amostras, 90d). Horario nobre confere com seu melhor turno (21h-00h: ROI 21%)."`
- `"ROI 4% em Vanilla $22 (52 amostras, 90d). Atencao: ROI -8% em Hyper (124 amostras)."`
- `"Sample baixo em todos os buckets. Score baseado em poucos dados — aumente o historico para personalizar."`

**Passo 8 — Warnings (array de strings, opcional):**

- `"low_sample"` — se confidence == "low"
- `"out_of_bankroll"` — se `bankrollFilter` ativo e torneio acima do limite (NAO entra no score, e flag visual)
- `"unfamiliar_site"` — se sample em site < 10
- `"never_played_category"` — se sample em category == 0

**Cold start (jogador com `totalTournaments < 50`):**

- Skip do algoritmo principal
- Score generico baseado em metricas universais:
  - Speed `Normal` → +15 (variance baixa, melhor pra aprender)
  - Speed `Turbo` → +5
  - Speed `Hyper` → -10
  - fieldSize `medio` (100-499) → +10
  - fieldSize `pequeno` (<100) → +5 (volume baixo, mas overlay potencial)
  - fieldSize `massivo` (2000+) → -5 (variance alta)
  - Horario `noite-nobre` → +5
- Base score = 50, somar bonus, clampar 0-100
- Confidence sempre `low`
- Rationale fixo: `"Score generico — importe pelo menos 50 torneios para receber recomendacoes personalizadas."`
- Grade calculada normalmente sobre o score generico

**Criterio de aceitacao:**
- [ ] Funcao retorna `{ score, grade, confidence, rationale, signals, warnings }` para qualquer input valido
- [ ] Score sempre entre 0 e 100 (inclusive)
- [ ] Grade derivada do score conforme tabela
- [ ] Confidence derivada do sample size dos buckets primarios
- [ ] Sample 0 em um bucket → score do bucket = 50 apos shrinkage
- [ ] Sample 30 com ROI +20% → bucketScore 90, shrunkScore 70
- [ ] Pesos somam 1.0 (sem field) ou redistribuidos quando field ausente
- [ ] Cold start (totalTournaments < 50) usa algoritmo simplificado
- [ ] Cold start retorna confidence "low" e rationale fixo
- [ ] Rationale nunca excede 200 chars
- [ ] Warnings populadas conforme regras
- [ ] Funcao e PURA (mesmo input → mesmo output, sem efeitos colaterais)
- [ ] Funcao roda em <2ms por torneio (validavel com benchmark)

---

### RF-03: Endpoint analytics agregado `/api/analytics/player-bundle`

**Descricao:** Endpoint que retorna o `PlayerAnalyticsBundle` em uma unica chamada (todas as 7 dimensoes + metadados), para evitar 7 round-trips ao banco e permitir cache eficiente.

**Endpoint:** `GET /api/analytics/player-bundle?lookbackDays=180`

**Auth:** JWT (`requireAuth`).

**Response:**
```json
{
  "totalTournaments": 1247,
  "lookbackTournaments": 423,
  "lookbackDays": 180,
  "fromDate": "2025-10-25",
  "toDate": "2026-04-23",
  "overallRoi": 12.4,
  "bySite": [...],
  "byBuyIn": [...],
  "byCategory": [...],
  "bySpeed": [...],
  "byDayOfWeek": [...],
  "byTimeOfDay": [...],
  "byField": [...]
}
```

**Regras de negocio:**
- Reutiliza queries existentes (`getAnalyticsBySite`, etc.) com filtro de periodo customizado (`lookbackDays`)
- Adiciona nova query `getAnalyticsByTimeOfDay` (RF-06)
- Cache em memoria por (userId, lookbackDays): TTL 5 minutos
- Invalida cache do usuario quando ha upload novo (hook em `/api/upload-history` POST handler)

**Criterio de aceitacao:**
- [ ] Endpoint retorna bundle completo com 7 dimensoes
- [ ] `lookbackDays` configura janela
- [ ] Cache hit em segunda chamada dentro de 5min
- [ ] Cache invalidado apos upload
- [ ] Response em <300ms no p95 para usuario com 5k+ torneios
- [ ] Sem auth retorna 401

---

### RF-04: UI — Widget na pagina Grade Planner (`/coach`)

**Descricao:** Painel novo no Grade Planner que substitui (ou complementa) a sidebar atual da Biblioteca, com a lista do dia ranqueada por score. Cada item tem botao "Adicionar a grade" que cria `planned_tournament` direto.

**Decisao arquitetural:** Widget integrado ao `/coach`, NAO pagina dedicada. Justificativa:
- Reduz friccao (selecao + planejamento na mesma tela)
- Reaproveita o layout split-panel da Biblioteca v2
- Evita orfanizar feature em rota separada com baixo trafego

**Layout:**
- Tab nova "Selector" no painel da Biblioteca (lado esquerdo do `/coach`), ao lado das tabs existentes (Catalogo, Importar, Lixeira)
- Quando ativada, ocupa 100% do painel da biblioteca
- Conteudo:
  - Header: titulo "Selector" + seletor de data (default: hoje) + botao "Atualizar"
  - Banner cold-start (se `totalTournaments < 50`): "Importe mais historico (atualmente: X torneios) para receber recomendacoes personalizadas. Ainda assim, o ranking abaixo usa metricas universais."
  - Filtros (chips horizontais):
    - Fonte: `Tudo | Suprema | Biblioteca` (default: Tudo)
    - Score minimo: `Todos | A+ (>=70) | S (>=85)` (default: Todos)
    - Sample: `Todos | Alta confianca (>=30 amostras)` (default: Todos)
    - Bankroll: `Todos | Dentro do limite` (default: Todos; oculta filtro se bankroll nao cadastrado)
  - Lista de torneios (cards verticais):
    - Header do card:
      - Badge da grade (S/A/B/C/D) com cor (S verde, A azul, B amarelo, C laranja, D vermelho)
      - Score (numero grande, ex: "87")
      - Nome do torneio + horario + site (logo)
      - Buy-in (R$ ou $ com prefixo)
      - Badge de confidence: "Alta confianca" (verde) | "Media confianca" (amarelo) | "Baixa confianca" (cinza)
    - Body do card:
      - Rationale (texto cinza italico)
      - Mini-grafico horizontal de barras com os 7 sinais (cada barra colorida por shrunkScore)
    - Footer do card:
      - Warnings (badges vermelhas se houver: "Bankroll fora", "Site novo", "Categoria nunca jogada")
      - Botao "Adicionar a grade" (primario)
        - Se `alreadyInGrid: true` → botao desabilitado com texto "Ja na grade"
      - Botao "Detalhes" (secundario, abre modal com breakdown completo dos signals)

**Estado vazio:**
- Se `tournaments.length === 0`: "Nenhum torneio disponivel para esta data. Ajuste os filtros ou selecione outra data."
- Se filtros aplicados zeraram: "Nenhum torneio combina com seus filtros. Tente afrouxar os criterios."

**Acao "Adicionar a grade":**
- Chama `POST /api/planned-tournaments` com:
  - `dayOfWeek` derivado da data
  - `profile`: perfil ativo do dia (de `profile_states`); fallback "A"
  - `site`, `name`, `time`, `buyIn`, `category` (mapeado para `type`), `speed`, `gameType`, `lateRegMinutes`, `startingStack`, `maxPlayers`, `blindLevelMinutes`, `guaranteed` — todos do torneio scored
  - `externalId`: preservado do torneio original
  - `status`: "upcoming"
  - `prioridade`: 2 (Media) por padrao; 1 (Alta) se score >= 85
- Apos sucesso: invalidar cache `planned-tournaments`, atualizar `alreadyInGrid: true` no card, toast verde "Adicionado a grade — Score 87 (S)"
- Apos falha: toast vermelho com mensagem do erro

**Modal de detalhes (botao "Detalhes"):**
- Titulo: nome do torneio + grade + score
- Tabela de signals:

| Sinal | ROI bruto | Sample | Score do bucket | Score apos shrinkage | Peso | Contribuicao |
|---|---|---|---|---|---|---|
| Site | 14.2% | 312 | 76 | 75 | 0.20 | 15.0 |
| Buy-in | 16.8% | 134 | 82 | 80 | 0.20 | 16.0 |
| ... | ... | ... | ... | ... | ... | ... |
| **Total** | | | | | **1.00** | **87** |

- Texto explicativo curto: "Score = soma ponderada dos scores ajustados. Ajuste por sample reduz peso de buckets com poucos dados."
- Botao "Adicionar a grade" replica do footer

**Criterio de aceitacao:**
- [ ] Tab "Selector" visivel no painel da Biblioteca em `/coach`
- [ ] Seletor de data funcional, default hoje
- [ ] Banner cold-start aparece se totalTournaments < 50
- [ ] Lista carregada via `GET /api/tournament-selector?date=...&sources=suprema,library`
- [ ] Cada card mostra grade, score, nome, horario, site, buy-in, rationale, mini-grafico, warnings, botoes
- [ ] Filtros funcionam (fonte, score min, sample, bankroll)
- [ ] Botao "Adicionar a grade" cria planned_tournament e atualiza estado
- [ ] Cache invalidado e grade atualiza ao adicionar
- [ ] Botao desabilitado se ja na grade
- [ ] Modal de detalhes mostra breakdown completo dos signals
- [ ] Estado vazio renderizado quando lista zero
- [ ] Loading state visivel durante fetch
- [ ] Erro renderizado com botao "Tentar novamente"
- [ ] Layout responsivo (mobile: cards full-width, desktop: cards com altura compacta)

---

### RF-05: Score visivel na biblioteca de torneios

**Descricao:** Quando um torneio da biblioteca pessoal aparece no LibraryCard (Tournament Library v2), exibir badge de grade + score se o torneio tiver `dayOfWeek` definido (so faz sentido scorar contra o turno do dia).

**Regras de negocio:**
- Apenas para torneios da biblioteca com `dayOfWeek` definido
- Score calculado on-demand via call ao `/api/tournament-selector` filtrado por `library` e o dayOfWeek do torneio (ou via endpoint dedicado `/api/tournament-selector/library/:id` se RF-04 nao estiver carregado)
- Cache no client (TanStack Query) por 5 minutos
- Se score nao disponivel ainda, exibir spinner pequeno; se erro, omitir badge silenciosamente
- Visualmente: badge pequena `S 87` no canto superior direito do LibraryCard
- Tooltip ao hover: rationale curto (primeira sentenca)

**Criterio de aceitacao:**
- [ ] LibraryCard mostra badge `Grade Score` quando disponivel
- [ ] Tooltip exibe rationale ao hover
- [ ] Sem score (loading/erro): badge omitida, sem quebrar layout
- [ ] Cache evita re-calculo a cada render
- [ ] So aparece para torneios com `dayOfWeek` definido

---

### RF-06: Nova query `getAnalyticsByTimeOfDay`

**Descricao:** Adicionar metodo no `storage.ts` que retorna ROI por turno do dia (mesmo formato dos outros analytics).

**Buckets de turno:**
- `madrugada` (00:00 - 05:59)
- `manha` (06:00 - 11:59)
- `tarde` (12:00 - 17:59)
- `noite-cedo` (18:00 - 20:59)
- `noite-nobre` (21:00 - 23:59)

**Assinatura:**
```typescript
getAnalyticsByTimeOfDay(userId: string, period: string, filters: any): Promise<{
  bucket: string,
  sample: number,
  roi: number,
  profit: number,
  buyins: number
}[]>
```

**Regras de negocio:**
- Usa `tournaments.datePlayed` (timestamp) para extrair a hora
- Bucket calculado via `EXTRACT(HOUR FROM date_played)` no SQL
- Mesma estrutura de filtros que `getAnalyticsByDayOfWeek` (period, dashboard filters)
- Endpoint REST opcional: `GET /api/analytics/by-time-of-day` (consistente com os demais)

**Criterio de aceitacao:**
- [ ] Metodo retorna array com 5 buckets (mesmo zerados)
- [ ] Calculo de hora usa timezone correto (verificar se `datePlayed` e UTC ou local)
- [ ] Filtros de periodo aplicam corretamente
- [ ] Endpoint `/api/analytics/by-time-of-day` opcional, mas se criado, segue padrao dos outros

---

### RF-07: Tracking de uso (telemetry) — opcional para evolucao do algoritmo

**Descricao:** Logar cada chamada ao Selector e cada acao de "Adicionar a grade" para futura analise de eficacia do algoritmo.

**Tabela nova `tournament_selector_logs`:**

| Campo | Tipo | Notas |
|---|---|---|
| `id` | varchar (nanoid) | PK |
| `userId` | varchar | FK users.userPlatformId |
| `eventType` | varchar | "view" (chamou endpoint) ou "add_to_grid" (adicionou torneio) |
| `tournamentExternalId` | varchar nullable | externalId do torneio adicionado (so para "add_to_grid") |
| `score` | integer nullable | score no momento da acao |
| `grade` | varchar(1) nullable | grade no momento da acao |
| `confidence` | varchar nullable | confidence no momento |
| `metadata` | jsonb | snapshot dos filtros + signals (apenas para add_to_grid) |
| `createdAt` | timestamp | now() |

**Regras de negocio:**
- Loga "view" sempre que `/api/tournament-selector` e chamado (1 evento por chamada)
- Loga "add_to_grid" quando torneio e adicionado via Selector (frontend envia POST ao endpoint de tracking)
- Async (nao bloqueia request)
- Util para futuro:
  - Calibrar pesos do algoritmo com dados reais (correlacao score → ROI realizado)
  - Identificar quais grades os jogadores mais adicionam (S/A vs B/C)
  - A/B test de variantes futuras

**Criterio de aceitacao:**
- [ ] Tabela criada via migracao
- [ ] Cada chamada ao endpoint loga "view"
- [ ] Cada add_to_grid via Selector loga evento
- [ ] Logs nao bloqueiam o response principal (async)
- [ ] Privacidade: dados nao expostos para outros usuarios; nao usados em features publicas

---

## Requisitos Nao-Funcionais

- **Performance:**
  - `/api/tournament-selector` responde em <500ms no p95 com 200 torneios e 5k+ historico
  - `computeTournamentScore()` executa em <2ms por torneio
  - `/api/analytics/player-bundle` responde em <300ms no p95
- **Cache:**
  - Bundle analytics: 5min TTL, invalidado em upload novo
  - Selector results: 30min TTL por (userId, date, sources)
  - Suprema lobby: reutiliza cache de 1h ja existente
- **Resiliencia:**
  - Se Suprema API falha, retorna apenas torneios da biblioteca + warning no response (`"warnings": ["suprema_unavailable"]`)
  - Se analytics bundle falha, retorna 500 com mensagem clara (sem fallback silencioso)
- **Privacidade:**
  - Score, signals e rationale sao por usuario; nao expostos em APIs publicas
  - Nenhum endpoint comparativo entre usuarios neste escopo
- **Acessibilidade:**
  - Cores das grades (S/A/B/C/D) nao podem ser unica fonte de informacao (tambem usar texto)
  - Badges de confidence com texto + cor

## Endpoints Previstos

| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| GET | `/api/tournament-selector` | Lista ranqueada do dia | JWT |
| GET | `/api/analytics/player-bundle` | Bundle agregado de analytics | JWT |
| GET | `/api/analytics/by-time-of-day` | (opcional) ROI por turno | JWT |
| POST | `/api/tournament-selector/log` | (opcional) Log de evento "add_to_grid" | JWT |

## Modelos de Dados Afetados

### `tournament_selector_logs` (NOVA — opcional, para RF-07)

| Campo | Tipo | Constraints |
|---|---|---|
| id | varchar | PK, nanoid |
| userId | varchar | FK users.userPlatformId, not null |
| eventType | varchar | not null, check in ('view', 'add_to_grid') |
| tournamentExternalId | varchar | nullable |
| score | integer | nullable |
| grade | varchar(1) | nullable |
| confidence | varchar | nullable |
| metadata | jsonb | nullable |
| createdAt | timestamp | default now() |

**Indexes:** `(userId, createdAt DESC)` para consultas de telemetria.

### Nenhuma alteracao em tabelas existentes.

A feature e read-only sobre `tournaments`, `planned_tournaments`, `tournament_library`, `user_settings`. O unico write e em `planned_tournaments` quando o usuario clica "Adicionar a grade" — reusa endpoint POST existente, sem schema novo.

## Integracoes Externas

Nenhuma nova. Reutiliza:
- API Pokerbyte (via servico interno `getSupremaTournaments`)
- Banco PostgreSQL/Neon (queries analytics existentes + nova `getAnalyticsByTimeOfDay`)

## Cenarios de Teste Derivados

### Happy Path
- [ ] Jogador com 1k+ torneios chama `/api/tournament-selector?date=2026-04-23&sources=suprema,library` e recebe lista ranqueada com scores 0-100
- [ ] Top torneio tem grade S, rationale destacando ROI alto em buy-in/categoria
- [ ] Bottom torneio tem grade D, rationale destacando warnings
- [ ] Jogador clica "Adicionar a grade" no top torneio → planned_tournament criado, badge muda para "Ja na grade"
- [ ] Segunda chamada em 30min → `cacheHit: true`, mesma resposta

### Algoritmo de Scoring
- [ ] Bucket com sample=0 e ROI inexistente → score = 50 (apos shrinkage)
- [ ] Bucket com sample=30 e ROI=20% → bucketScore=90, shrunkScore=70
- [ ] Bucket com sample=300 e ROI=20% → bucketScore=90, shrunkScore=86
- [ ] Bucket com sample=5 e ROI=50% → bucketScore=100, shrunkScore=57 (sample puxa para neutro)
- [ ] Soma dos pesos = 1.0 (sem fieldRoi quando ausente, redistribuido)
- [ ] Score final clampado em [0, 100]
- [ ] Grade derivada corretamente (>=85 = S, 70-84 = A, etc.)

### Cold Start
- [ ] Usuario com 30 torneios → response.playerProfile.coldStart=true
- [ ] Banner cold-start visivel no widget
- [ ] Scores usam algoritmo simplificado (Normal +15, Hyper -10, etc.)
- [ ] Confidence sempre "low"
- [ ] Rationale fixo: "Score generico — importe pelo menos 50 torneios..."

### Filtros
- [ ] `sources=suprema` retorna so Suprema
- [ ] `sources=library` retorna so biblioteca; sem chamar API externa
- [ ] `minScore=70` filtra grade C/D
- [ ] `minSample=30` exclui torneios com baixa amostra nos buckets primarios
- [ ] `bankrollFilter=true` com bankroll cadastrado oculta torneios acima do limite
- [ ] `bankrollFilter=true` sem bankroll → filtro ignorado, sem erro

### Edge Cases
- [ ] Suprema API offline → response inclui `warnings: ["suprema_unavailable"]`, lista so com torneios da biblioteca
- [ ] Biblioteca vazia → fonte ignorada silenciosamente
- [ ] Torneio Suprema sem `maxPlayers` → fieldRoi peso redistribuido
- [ ] Torneio com `category` desconhecida (nao Vanilla/PKO/Mystery) → bucket categoryRoi vira null, peso redistribuido
- [ ] Data no passado → mesma logica, mas Suprema pode retornar vazio
- [ ] Data muito no futuro (> 7 dias) → Suprema pode retornar vazio
- [ ] Cache hit dentro de 30min retorna identico (`cacheHit: true`)
- [ ] Apos upload novo de CSV → cache de bundle invalidado, proximo selector recalcula
- [ ] 31a request no minuto retorna 429
- [ ] Sem auth retorna 401
- [ ] `date` em formato invalido retorna 400
- [ ] Torneio ja na grade tem `alreadyInGrid: true`, botao desabilitado

### UI
- [ ] Widget renderiza dentro do painel `/coach`
- [ ] Tabs Catalogo/Importar/Lixeira/Selector funcionais
- [ ] Cards renderizam com grade colorida (S verde, D vermelho), score grande, rationale, mini-grafico
- [ ] Modal de detalhes mostra tabela completa de signals
- [ ] Filtros aplicam sem reload de pagina
- [ ] Loading state durante fetch
- [ ] Erro renderiza com botao "Tentar novamente"
- [ ] Toast verde apos add_to_grid bem-sucedido
- [ ] Botao desabilitado para torneios ja na grade

### Performance
- [ ] 200 torneios + 5k historico → endpoint responde em <500ms
- [ ] computeTournamentScore() < 2ms por torneio (benchmark)
- [ ] Bundle analytics responde em <300ms
- [ ] Cache hit responde em <50ms

## Fora de Escopo

- **Pesos do algoritmo configuraveis pelo usuario** — hardcoded no MVP. Calibragem virá em fase 2 com dados reais via RF-07.
- **Algoritmos alternativos (regressao, ML)** — combinacao linear ponderada e suficiente para MVP. Adicionar ML quando houver volume de eventos para treinar.
- **Sugestao automatica de grade completa** — feature so ranqueia, nao monta grade. Founder pode pedir "Auto-Build Grade" como Sprint separado.
- **Comparacao com outros usuarios** ("seu ROI vs media da plataforma") — fora deste escopo por privacidade e complexidade.
- **Notificacoes ativas** ("Hoje tem 3 torneios grade S, abra o Selector") — fica para Sprint de retencao (Goal Setting/Streaks).
- **Selector para outras redes alem de Suprema** — depende de novas integracoes; nao planejado neste sprint.
- **Filtro por horario especifico** ("so torneios entre 20h e 23h") — pode ser adicionado em iteracao se demanda surgir; MVP nao inclui.
- **Score historico (como o score evoluiu para o jogador?)** — nao calculado, mas RF-07 prepara terreno para isso futuramente.
- **Persistencia de filtros do widget** entre sessoes — comeca sempre nos defaults.
- **Multi-data (semana inteira de uma vez)** — apenas 1 dia por chamada no MVP.

## Dependencias

### Dependencias internas (ja existem)
- `tournaments` — historico do jogador
- `tournament_library` + `tournament_library_settings` (Tournament Library v2)
- `planned_tournaments` (Grade Planner)
- `user_settings` (para bankroll opcional)
- `profile_states` (para perfil ativo no add_to_grid)
- Endpoints `/api/analytics/by-*` (analytics.ts)
- Servico interno `getSupremaTournaments` (suprema.ts)
- Endpoint POST `/api/planned-tournaments`

### Dependencias novas (a serem criadas no escopo desta spec)
- `getAnalyticsByTimeOfDay()` no storage.ts (RF-06)
- Endpoint `GET /api/analytics/player-bundle` (RF-03)
- Endpoint `GET /api/tournament-selector` (RF-01)
- Funcao `computeTournamentScore()` em modulo dedicado `server/scoring/tournamentScorer.ts` (RF-02)
- Tab "Selector" no painel `/coach` (RF-04)
- Componente `LibraryCardScoreBadge` na Tournament Library (RF-05)
- (opcional) Tabela `tournament_selector_logs` + endpoint de log (RF-07)

### Dependencias logicas
- `bankroll` em `user_settings` — provavel que ainda nao exista (Sprint 2 e Bankroll Management). Spec assume "se nao existe, ignora". Quando Sprint 2 adicionar, o filtro fica funcional automaticamente.

## Notas de Implementacao (sugestoes para o System-Architect)

1. **Modulo dedicado para scoring:** Criar `server/scoring/tournamentScorer.ts` com a funcao pura `computeTournamentScore`. Manter logica fora do `routes/` facilita testes unitarios e calibragem futura.

2. **Constantes em arquivo separado:** `server/scoring/scoringConstants.ts` com pesos, shrinkConstant, mapeamento de buckets de buy-in e turno. Facilita ajuste sem mexer na funcao.

3. **Cache de bundle:** Reusar padrao de Map em memoria com TTL ja usado pelo cache Suprema (`server/suprema*.ts`). Considerar mover para Redis se a feature escalar — nao urgente.

4. **Bucketizacao de buy-in:** Reusar exatamente as faixas usadas em `getAnalyticsByBuyinRange` para garantir matching correto. Verificar se o codigo atual ja exporta as faixas como constante; se nao, refatorar para evitar duplicacao.

5. **Bucketizacao de turno:** Implementar como funcao pura `getTimeOfDayBucket(hhmm: string): TimeOfDayBucket`. Nao depender de date-fns para esta operacao simples.

6. **Telemetria opcional (RF-07):** Implementar somente se houver tempo no Sprint. Sem ela, a feature funciona; sem ela, perdemos sinal para calibrar pesos. Recomendo incluir mas marcar como "nice-to-have" final.

7. **Tipo no shared:** Adicionar `TournamentScore`, `ScoringSignal`, `ScoringInputTournament`, `PlayerAnalyticsBundle` em `shared/schema.ts` ou novo arquivo `shared/scoring.ts`. Manter contratos consistentes entre back e front.

8. **Mini-grafico de signals:** Usar Recharts (ja no stack) com BarChart horizontal. Reusar paleta `lib/chartColors.ts`.

9. **Mapeamento `category` para `type` no add_to_grid:** A spec do Grade Planner usa `type` em planned_tournaments para Vanilla/PKO/Mystery. Manter mapeamento `category → type` para nao quebrar contrato.

10. **Acessibilidade da grade:** Mapeamento sugerido:
   - S: bg verde escuro, text branco, ícone de troféu
   - A: bg azul, text branco, ícone de star
   - B: bg amarelo, text preto, ícone de check
   - C: bg laranja, text preto, ícone de alerta
   - D: bg vermelho, text branco, ícone de X

---

## Decisoes Pendentes (precisam alinhamento com founder antes de seguir para System-Architect)

1. **RF-04 — Widget vs Pagina dedicada:**
   - **Recomendacao:** Widget como tab no `/coach` (decidi pra reduzir friccao + reaproveitar layout).
   - **Alternativa:** Pagina dedicada `/selector`.
   - **Pergunta ao founder:** Confirma widget? Ou prefere pagina propria com link no menu lateral?

2. **RF-02 — Pesos do algoritmo configuraveis pelo usuario:**
   - **Decisao na spec:** Hardcoded no MVP, calibragem em fase 2 com dados reais via RF-07.
   - **Alternativa:** Permitir usuario ajustar (ex: "dou mais peso para horario do que para site").
   - **Pergunta ao founder:** Aceita pesos fixos no MVP ou quer dar essa flexibilidade desde o inicio?

3. **RF-07 — Telemetria opcional:**
   - **Decisao na spec:** Marcar como opcional, recomendado.
   - **Pergunta ao founder:** Inclui RF-07 no escopo do Sprint 1? Ou deixa para Sprint 2 quando tivermos volume real?

4. **RF-05 — Score na biblioteca:**
   - **Decisao na spec:** Calcular sob demanda com cache TanStack Query.
   - **Risco:** Se a biblioteca tiver 100+ torneios, vamos disparar 100 calls ao endpoint.
   - **Pergunta ao founder:** Aceitavel calcular sob demanda? Ou prefere endpoint batch `/api/tournament-selector/library-batch?dayOfWeek=4` que retorna scores de todos os torneios da biblioteca para um dia?

5. **Cold start threshold:**
   - **Decisao na spec:** `< 50 torneios totais` = cold start.
   - **Alternativa:** Pode ser mais alto (100, 200) ou granular (cold start por dimensao — ex: tem 200 torneios mas nenhum em PKO).
   - **Pergunta ao founder:** 50 esta ok? Ou prefere outro corte?

6. **Conversao de moeda no scoring:**
   - **Contexto:** Suprema retorna BRL, mas torneios da biblioteca podem ser em USD (PokerStars, GGPoker).
   - **Risco:** Bucket de buy-in mistura moedas se nao normalizar.
   - **Pergunta ao founder:** O sistema atual ja normaliza para uma moeda no analytics? Se nao, qual moeda padrao? (a spec assume normalizacao para BRL — confirmar com codigo atual de `user_settings.currency` + `exchangeRates`).

7. **Bankroll filter sem bankroll cadastrado:**
   - **Decisao na spec:** Se bankroll nao cadastrado, ignorar o filtro silenciosamente.
   - **Alternativa:** Mostrar prompt "Cadastre seu bankroll em Settings para usar este filtro" e desabilitar o chip.
   - **Pergunta ao founder:** Qual comportamento prefere?

8. **AI Coach integration:**
   - **Decisao na spec:** Mencionada como consumidor secundario (persona Tournament Selection chama o endpoint como tool).
   - **Risco:** Se AI Coach nao tem suporte a tool calls com endpoints internos hoje, fica fora do escopo do Sprint 1.
   - **Pergunta ao founder:** Inclui integracao AI Coach no escopo? Ou deixa para iteracao posterior?

---

## Resumo dos Entregaveis para Test-Writer e Implementer

**Backend (server/):**
- `server/scoring/tournamentScorer.ts` — funcao pura `computeTournamentScore`
- `server/scoring/scoringConstants.ts` — pesos, buckets, shrinkConstant
- `server/routes/analytics.ts` — adicionar `/api/analytics/player-bundle` e (opcional) `/api/analytics/by-time-of-day`
- `server/routes/tournament-selector.ts` — novo modulo de rotas com `GET /api/tournament-selector`
- `server/storage.ts` — adicionar `getAnalyticsByTimeOfDay()` e (se RF-07) metodos para tournament_selector_logs
- `shared/schema.ts` — (se RF-07) definicao da tabela `tournament_selector_logs`
- `shared/scoring.ts` (novo) — types: `TournamentScore`, `ScoringSignal`, `PlayerAnalyticsBundle`, etc.

**Frontend (client/src/):**
- `pages/GradePlanner.tsx` — adicionar tab "Selector" no painel da Biblioteca
- `components/grade-planner/SelectorPanel.tsx` (novo) — painel principal do widget
- `components/grade-planner/SelectorCard.tsx` (novo) — card de um torneio scored
- `components/grade-planner/SelectorDetailsModal.tsx` (novo) — breakdown completo dos signals
- `components/grade-planner/SelectorFilters.tsx` (novo) — chips de filtros
- `components/grade-planner/LibraryCard.tsx` — adicionar `LibraryCardScoreBadge` (RF-05)
- `hooks/useTournamentSelector.ts` (novo) — TanStack Query hook para o endpoint
- `lib/scoringHelpers.ts` (novo) — formatadores de grade/cor, bucket de turno

**Testes (tests/unit/):**
- `tests/unit/scoring/tournamentScorer.test.ts` — funcao pura
- `tests/unit/scoring/scoringConstants.test.ts` — buckets, pesos
- `tests/unit/scoring/coldStart.test.ts` — algoritmo simplificado
- `tests/unit/analytics/playerBundle.test.ts` — endpoint bundle
- `tests/unit/tournament-selector/endpoint.test.ts` — endpoint principal
- `tests/unit/tournament-selector/cache.test.ts` — cache TTL e invalidacao
- `tests/unit/tournament-selector/filters.test.ts` — minScore, minSample, bankroll, sources

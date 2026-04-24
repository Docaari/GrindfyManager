# Sequence Diagram — GET /api/tournament-selector

## Contexto
Diagrama de sequencia detalhado do fluxo principal: jogador abre o widget Selector em `/coach`, frontend dispara `GET /api/tournament-selector?date=YYYY-MM-DD&sources=suprema,library`, backend orquestra paralelismo entre bundle de analytics + lobby Suprema + library, scorer ranqueia, telemetria e gravada async, response retorna lista ranqueada.

## Diagrama Principal — Cache Miss (caminho mais longo)

```mermaid
sequenceDiagram
    actor User as Jogador
    participant SP as SelectorPanel<br/>(React)
    participant Hook as useTournamentSelector<br/>(TanStack Query)
    participant Route as /api/tournament-selector<br/>(routes/tournament-selector.ts)
    participant Auth as requireAuth<br/>(JWT middleware)
    participant SCache as selectorCache<br/>(Map TTL 30min)
    participant Bundle as playerBundle service<br/>(cache TTL 5min)
    participant Storage as storage.ts<br/>(Drizzle)
    participant Suprema as supremaService<br/>(cache 1h)
    participant Pokerbyte as Pokerbyte API
    participant Scorer as tournamentScorer<br/>(funcao pura)
    participant DB as PostgreSQL
    participant Logger as storage.insertSelectorLog<br/>(async, fire & forget)

    User->>SP: Abre tab "Selector" em /coach
    SP->>Hook: queryKey ['selector', date, sources, ...]
    Hook->>Route: GET /api/tournament-selector?date=2026-04-23&sources=suprema,library

    Route->>Auth: validar JWT
    Auth-->>Route: { userId: USER-0042 }

    Route->>SCache: get(userId, date, sources, lookbackDays)
    SCache-->>Route: MISS (cache vazio)

    par Paralelo: Bundle + Suprema + Library
        Route->>Bundle: getOrLoad(userId, lookbackDays=180)
        Bundle->>Bundle: cache check (TTL 5min)
        Bundle-->>Bundle: MISS
        Bundle->>Storage: Promise.all([<br/>  getAnalyticsBySite,<br/>  getAnalyticsByBuyin,<br/>  getAnalyticsByCategory,<br/>  getAnalyticsBySpeed,<br/>  getAnalyticsByDayOfWeek,<br/>  getAnalyticsByTimeOfDay,<br/>  getAnalyticsByField<br/>])
        Storage->>DB: 7 queries SQL agregadas<br/>(GROUP BY com filtro lookback)
        DB-->>Storage: 7 result sets
        Storage-->>Bundle: bundle bruto
        Bundle->>Bundle: normaliza buyIn p/ USD<br/>(via currencyNormalizer)
        Bundle->>Bundle: cache.set(userId, lookbackDays, bundle, ttl=5min)
        Bundle-->>Route: PlayerAnalyticsBundle
    and
        Route->>Suprema: getSupremaTournaments(date='2026-04-23')
        Suprema->>Suprema: cache check (TTL 1h)
        Suprema-->>Suprema: MISS
        Suprema->>Pokerbyte: GET /lobby?date=2026-04-23
        Pokerbyte-->>Suprema: 47 torneios enriquecidos
        Suprema->>Suprema: cache.set(date, lobby, ttl=1h)
        Suprema-->>Route: 47 torneios Suprema
    and
        Route->>Storage: getTournamentLibrary(userId)<br/>where dayOfWeek=4 AND deletedAt IS NULL
        Storage->>DB: SELECT ... FROM tournament_library
        DB-->>Storage: 12 torneios da biblioteca
        Storage-->>Route: 12 torneios library
    end

    Route->>Storage: getPlannedTournaments(userId, dayOfWeek=4)
    Storage->>DB: SELECT externalId, name, time, site<br/>FROM planned_tournaments
    DB-->>Storage: 5 torneios ja planejados
    Storage-->>Route: Set<externalId> + Set<name+time+site>

    Route->>Storage: getUserSettings(userId)
    Storage->>DB: SELECT bankroll_amount, bankroll_rule,<br/>exchange_rates FROM user_settings
    DB-->>Storage: settings
    Storage-->>Route: settings (pode ter bankroll=null)

    Note over Route: Combina lista: 47 Suprema + 12 library = 59 torneios

    loop Para cada um dos 59 torneios
        Route->>Scorer: computeTournamentScore(t, bundle, opts)
        alt totalTournaments < 20
            Scorer->>Scorer: cold start puro<br/>(metricas universais)
        else totalTournaments 20-49
            Scorer->>Scorer: full scoring<br/>+ flag low-confidence
        else totalTournaments >= 50
            Scorer->>Scorer: full scoring algorithm<br/>(7 signals + shrinkage + grade)
        end
        Scorer-->>Route: { score, grade, confidence, rationale, signals, warnings }
    end

    Note over Route: Aplica filtros (minScore, minSample, bankrollFilter)<br/>Ordena por (score DESC, confidence DESC, startTime ASC)<br/>Marca alreadyInGrid

    Route->>SCache: set(userId, date, sources, lookbackDays, result, ttl=30min)

    Note over Route,Logger: Log RF-07 disparado em background<br/>(NAO bloqueia response)
    Route-)Logger: insertSelectorLog({eventType:'view', userId, ...})
    Logger->>DB: INSERT INTO tournament_selector_logs

    Route-->>Hook: 200 OK { tournaments, playerProfile, totalReturned, generatedAt, cacheHit:false }
    Hook->>Hook: cache.set(queryKey, response, staleTime=30min)
    Hook-->>SP: data, isLoading=false
    SP-->>User: Renderiza lista ranqueada<br/>(top com badge S verde, bottom com D vermelho)
```

## Diagrama — Cache Hit (caminho rapido)

```mermaid
sequenceDiagram
    actor User as Jogador
    participant SP as SelectorPanel
    participant Hook as useTournamentSelector
    participant Route as /api/tournament-selector
    participant Auth as requireAuth
    participant SCache as selectorCache

    User->>SP: Recarrega/reabre Selector (mesma data)
    SP->>Hook: queryKey identica
    alt TanStack Query staleTime nao expirou (5min default)
        Hook-->>SP: data cacheada (sem fetch)
    else staleTime expirou
        Hook->>Route: GET /api/tournament-selector?...
        Route->>Auth: JWT
        Auth-->>Route: ok
        Route->>SCache: get(userId, date, sources, lookbackDays)
        SCache-->>Route: HIT (response salva ha 8min)
        Route-->>Hook: 200 OK { ..., cacheHit: true }
        Note over Route: Tempo total &lt; 50ms
    end
    Hook-->>SP: data
    SP-->>User: Renderiza
```

## Diagrama — Add to Grid (com log RF-07)

```mermaid
sequenceDiagram
    actor User as Jogador
    participant SP as SelectorPanel
    participant Card as SelectorCard
    participant Mutation as useMutation<br/>(TanStack)
    participant RoutePT as POST /api/planned-tournaments<br/>(routes/grade-planner.ts)
    participant Storage as storage.ts
    participant DB as PostgreSQL
    participant Logger as insertSelectorLog<br/>(async)
    participant SCache as selectorCache

    User->>Card: Clica "Adicionar a grade"
    Card->>Mutation: mutate(tournament, score, grade)
    Mutation->>RoutePT: POST /api/planned-tournaments<br/>body inclui metadata.fromSelector=true<br/>+ score + grade + signals
    RoutePT->>Storage: insertPlannedTournament(userId, data)
    Storage->>DB: INSERT INTO planned_tournaments
    DB-->>Storage: { id }
    Storage-->>RoutePT: planned tournament criado

    Note over RoutePT,Logger: Detecta metadata.fromSelector -> log async
    RoutePT-)Logger: insertSelectorLog({<br/>  eventType:'add_to_grid',<br/>  tournamentExternalId,<br/>  score, grade, confidence,<br/>  metadata: snapshot signals + filters<br/>})
    Logger->>DB: INSERT INTO tournament_selector_logs

    Note over RoutePT,SCache: Invalida cache do selector p/ esta data<br/>(item agora deve aparecer com alreadyInGrid=true)
    RoutePT->>SCache: invalidate(userId, date)

    RoutePT-->>Mutation: 201 Created
    Mutation->>Mutation: invalidateQueries(['selector', date])<br/>invalidateQueries(['planned-tournaments'])
    Mutation-->>Card: onSuccess
    Card->>SP: atualiza estado (alreadyInGrid=true)
    SP-->>User: Toast verde "Adicionado a grade — Score 87 (S)"<br/>Botao desabilitado "Ja na grade"
```

## Diagrama — Suprema API offline (resiliencia)

```mermaid
sequenceDiagram
    participant Route as /api/tournament-selector
    participant Suprema as supremaService
    participant Pokerbyte as Pokerbyte API
    participant Storage as storage.ts
    participant Hook as useTournamentSelector

    par Paralelo
        Route->>Suprema: getSupremaTournaments(date)
        Suprema->>Pokerbyte: GET /lobby
        Pokerbyte--xSuprema: TIMEOUT / 503
        Suprema-->>Route: throw SupremaUnavailableError
    and
        Route->>Storage: getTournamentLibrary(userId)
        Storage-->>Route: 12 torneios
    end

    Note over Route: catch SupremaUnavailableError<br/>continua com library + warning
    Route->>Route: scorer ranqueia 12 torneios da library
    Route-->>Hook: 200 OK {<br/>  tournaments: [...12 library...],<br/>  warnings: ["suprema_unavailable"],<br/>  totalReturned: 12<br/>}
```

## Diagrama — Cache Invalidation por Upload

```mermaid
sequenceDiagram
    actor User as Jogador
    participant Upload as POST /api/upload-history<br/>(routes/upload.ts)
    participant Parser as PokerCSVParser
    participant Storage as storage.ts
    participant DB as PostgreSQL
    participant Bundle as playerBundle service
    participant SCache as selectorCache

    User->>Upload: Upload novo CSV (200 torneios)
    Upload->>Parser: parse(file)
    Parser-->>Upload: 200 torneios validos
    Upload->>Storage: bulkInsertTournaments(userId, tournaments)
    Storage->>DB: INSERT batch
    DB-->>Storage: ok

    Note over Upload,SCache: Pos-commit: invalida caches<br/>(tudo que depende de analytics do user)
    Upload->>Bundle: invalidate(userId)
    Bundle->>Bundle: cache.delete(userId, *)
    Upload->>SCache: invalidateAllForUser(userId)
    SCache->>SCache: cache.delete onde key inclui userId

    Upload-->>User: 201 { count: 200 }

    Note over User: Proxima chamada ao /api/tournament-selector<br/>recalcula bundle (cache miss) com dados atualizados.
```

## Notas de Implementacao

### Paralelismo
- O bloco `par Paralelo: Bundle + Suprema + Library` e CRITICO para atingir o p95 < 500ms.
- Implementar com `await Promise.all([bundlePromise, supremaPromise, libraryPromise])`.
- `bundlePromise` internamente ja usa `Promise.all` para as 7 queries de analytics.

### Resiliencia
- `supremaService` deve fazer wrap em try/catch dentro do `Promise.all` ou usar `Promise.allSettled`. Se falha, response inclui warning sem quebrar.
- `bundlePromise` NAO tem fallback — se falha, retorna 500. Bundle e dado obrigatorio para scoring.

### Telemetria (RF-07)
- Sempre fire-and-forget (`Promise.resolve().then(() => insertSelectorLog(...))` ou similar). NAO usar `await`.
- Log de erro do logger em `console.error` mas nunca propaga.

### Cache invalidacao
- `selectorCache.invalidateAllForUser(userId)` exige iterar Map e remover keys que comecam com `${userId}:`. Implementar com chave composta `${userId}:${date}:${sources}:${lookbackDays}`.
- Considerar mover para Redis se memory pressure aparecer (ADR-016 cita).

### Logs em paralelo com upload
- Upload ja tem batch de 500 torneios. Apos commit:
  - Invalida bundle cache do user.
  - Invalida selector cache do user (todas as datas).
- Sem afetar response do upload.

# Tournament Selector — Test Fixtures

Fixtures usadas pelos testes da feature **Tournament Selector Inteligente** (Sprint 1, ICE 8.0).

Localizacao: `tests/fixtures/tournament-selector/`

## Convencao
- Cada arquivo .ts exporta uma funcao `make<Nome>()` que devolve um objeto/array novo a cada chamada (evita cross-test mutation).
- Bundles seguem o tipo `PlayerAnalyticsBundle` definido em `shared/scoring.ts` (ainda nao criado — Implementer).
- Suprema lobbies seguem o shape ja existente em `server/supremaMapper.ts`.
- Library templates seguem `tournament_library` do schema atual + futura coluna `library_template_id` em `planned_tournaments` (Q4).

## Inventario

| Arquivo | Conteudo | Usado em |
|---|---|---|
| `bundles.ts` | `makeEmptyBundle()` (0 torneios), `makeColdStartPureBundle()` (10 torneios), `makeColdStartPartialBundle()` (30 torneios), `makeFullBundle()` (200 torneios), `makeBundleWithUnknownCategory()` | `tests/unit/scoring/*`, `tests/integration/services/*` |
| `suprema-lobbies.ts` | `makeSupremaLobby3Tournaments()` (3 torneios variados — Mystery PKO Turbo, Vanilla Normal, Hyper Massivo), `makeSupremaLobbyEmpty()`, `makeSupremaLobbyOffline()` (helper que rejeita) | `tests/integration/api/tournament-selector*`, `tests/unit/tournament-selector/*` |
| `library-templates.ts` | `makeLibrary60Templates()` (60 templates: 50 com `totalPlayed > 0` ordenados decrescente + 10 sem `totalPlayed`), `makeLibraryEmpty()` | `tests/integration/api/tournament-library-with-score*` |
| `time-of-day.ts` | Timestamps em UTC para validar bucketizacao por timezone (limite de 17:59 BRT vs 18:00 BRT) | `tests/integration/services/getAnalyticsByTimeOfDay*` |
| `currency-rates.ts` | `userSettingsWithBRL()`, `userSettingsEmpty()` (sem exchange_rates), `userSettingsWithUSDOnly()` | `tests/unit/scoring/normalizer*` |

## Notas para o Implementer

- O Test-Writer NAO criou os arquivos `.ts` das fixtures porque as **stubs** dos types (`PlayerAnalyticsBundle`, etc.) ainda nao existem — Implementer cria esses types em `shared/scoring.ts` antes de o `tsc` compilar os testes.
- Apos o Implementer rodar `npm run check`, ele deve criar os arquivos de fixture acima conforme assinatura e dataset descritos. Se preferir, mover dataset inline para os testes — nao bloqueia.
- Os testes usam `it.todo()` em cenarios que dependem de fixtures externas para sinalizar o que falta. Cada `it.todo()` referencia o nome de fixture esperado.

## Cenarios cobertos pelos bundles

### `makeEmptyBundle()` — 0 torneios
- `totalTournaments: 0`
- todas as 7 dimensoes vazias `[]`
- usado para: cold start "pure" (`< 20`)

### `makeColdStartPureBundle()` — 10 torneios
- `totalTournaments: 10`
- 1-2 buckets por dimensao com sample baixo (1-5)
- usado para: validar que algoritmo full **nao** roda quando `< 20` (ativa heuristica)

### `makeColdStartPartialBundle()` — 30 torneios
- `totalTournaments: 30`
- buckets esparsos (sample 5-15 nas dimensoes mais comuns)
- usado para: validar que algoritmo full roda + flag `lowConfidence: true`

### `makeFullBundle()` — 200 torneios
- `totalTournaments: 200`
- buckets robustos (sample 30-100 nas principais dimensoes)
- usado para: validar full algoritmo com confidence high/medium

### `makeBundleWithUnknownCategory()` — 200 torneios sem PKO/Mystery
- como acima, mas `byCategory` so tem `Vanilla` (87 amostras)
- usado para: validar redistribuicao de peso quando `categoryRoi` vira null

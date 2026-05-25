# ADR-212: Agregar torneios por tier x tipo com ROI historico real para wizard de variancia

## Status

Proposto

## Data

2026-05-25

## Contexto

O wizard de variancia (VR-1, ADR-211) funciona: o engine Monte Carlo nativo roda em ~0.3s e produz resultados estatisticamente solidos. Porem, o wizard de entrada continua com dois problemas graves:

1. **Granularidade excessiva.** O modo atual ("Perfil + Dia + Multiplicador") lista torneios individuais -- um jogador com 263 torneios na grade semanal ve 263 rows na tabela de buckets. Cada row tem buy-in, field size e ROI editaveis. Isso e inutilizavel para simulacao trimestral/anual.

2. **ROI e field size sao heuristicas genericas.** O sistema usa `NETWORK_DEFAULTS_ROI` (e.g., GGPoker = 8%, WPN = 12%) e `DEFAULT_PLAYERS_AVG = 1000`. O jogador tem ~10.000 torneios historicos importados na tabela `tournaments` com ROI e field size reais por tier e tipo -- esses dados nao sao usados.

### Forcas em jogo

- **Dados reais disponiveis.** A tabela `tournaments` (filtrada por `grind_session_id IS NULL`, CLAUDE.md SS6.1) contem o historico completo do jogador com buy-in, prize, field_size, type e date_played. Destes dados e possivel calcular ROI real ajustado por re-entries e field size medio por tier x tipo.
- **Deduplicacao necessaria.** Importacoes de CSV de diferentes fusos horarios geram duplicatas (mesmo torneio com `date_played` levemente diferente). `DISTINCT ON (name, site, buy_in, prize, field_size, position, date_played::date)` remove ~40% dos duplicados em dados reais.
- **Re-entries distorcem ROI.** Um jogador que fez 3 re-entries em um torneio de $50 investiu $200 ($50 + 3 * $50), nao $50. O ROI classico (`SUM(prize) / SUM(buy_in) - 1`) subestima o custo real. A formula ajustada usa `SUM(buy_in) + SUM(GREATEST(0, -(prize + buy_in)))` como denominador para capturar o custo efetivo das re-entries.
- **Wizard precisa de modo agregado.** Em vez de mostrar 263 torneios individuais, agrupar em ~8 grupos (4 tiers x 2-3 tipos) torna a tabela editavel e compreensivel. O jogador pode ajustar ROI ou count de um grupo inteiro em vez de editar 263 linhas.
- **Simulacao por periodo (nao por dia).** O modo atual pede "Perfil + Dia especifico". O modo agregado pede "Perfil + Periodo (1 semana / 1 mes / 1 trimestre / 1 ano)" e agrega TODOS os dias daquele perfil, escalando pelo numero de semanas.

## Opcoes Consideradas

### Opcao 1: Manter wizard per-tournament-per-day (DESCARTADA)

- **Pros:** Zero trabalho. Modo existente ja funciona com o engine nativo.
- **Contras:** 263 rows na tabela sao inutilizaveis. ROI heuristico nao reflete performance real. Simulacao trimestral requer multiplicador manual sem visibilidade da composicao.

### Opcao 2: Agregacao por tier x tipo com ROI historico (ESCOLHIDA)

Novo endpoint `GET /api/variance/historical-stats` retorna ROI e field size calculados do historico real do jogador. Novo endpoint `GET /api/variance/buckets-aggregate` retorna grupos agregados por tier x tipo para um perfil, com ROI/field do historico ou defaults. Wizard ganha toggle "Por periodo" (modo principal) vs "Por dia" (backward-compat).

- **Pros:**
  - **Dados reais.** ROI e field size do historico do jogador, nao heuristicas genericas.
  - **Tabela editavel.** ~8 grupos em vez de 263 rows.
  - **Simulacao por periodo.** Selecionar "Trimestre" e ver a composicao inteira da grade.
  - **Transparencia.** Badge `hist` (azul) vs `est` (amarelo) indica origem de cada valor.
  - **Deduplicacao robusta.** `DISTINCT ON` remove duplicatas de timezone offset.
  - **ROI ajustado.** Re-entries contabilizadas no denominador.
  - **Cache eficiente.** Historical-stats cache 1h (historico muda so com upload novo).
- **Contras:**
  - **Query complexa.** `DISTINCT ON` + GROUP BY tier x tipo requer index adequado. Mitigacao: `idx_tournaments_user_created_history` (partial, `grind_session_id IS NULL`) ja existe; query validada em sessao interativa com jogador real (~120ms em ~10K rows).
  - **Tier classification hardcoded.** Buckets fixos ($10-22, $22-50, $50-100, $100+). Mitigacao: suficiente para o perfil de jogador mid/high stakes; para micro-stakes (<$10), torneios sao filtrados (nao sao MTT competitivos).
  - **Satellite/Add-on merge.** Agrupar Satellite e Add-on com Vanilla simplifica mas perde granularidade. Mitigacao: esses tipos sao marginais (~5% do volume) e o jogador pode desagrupar editando manualmente.

### Opcao 3: Clustering automatico (ML) dos torneios (DESCARTADA)

- **Pros:** Grupos otimos sem tiers fixos.
- **Contras:** Overhead de implementacao, resultados inconsistentes entre runs, dificil de explicar ao usuario. Tiers fixos sao well-understood na comunidade MTT.

## Decisao

**Adotar Opcao 2: agregacao por tier x tipo com ROI historico real.**

### Tier Classification

| Tier | Buy-in range (USD) | Referencia |
|------|-------------------|------------|
| `high` | >= $100 | High stakes standard |
| `mid` | >= $50 e < $100 | Mid stakes standard |
| `low` | >= $22 e < $50 | Low stakes standard |
| `entry` | >= $10 e < $22 | Entry level |

Torneios com buy-in < $10 sao filtrados (nao sao MTT competitivos para analise de variancia).

### Type Classification

Tipos primarios da tabela `tournaments.type` (ADR-031): `Vanilla`, `PKO`, `Mystery`, `Satellite`, `Add-on`.

Para a agregacao: `Satellite` e `Add-on` sao mergeados em `Vanilla` do mesmo tier (volume marginal, comportamento de variancia similar ao tipo base).

### Deduplication Query

```sql
WITH deduped AS (
  SELECT DISTINCT ON (name, site, buy_in, prize, field_size, position, date_played::date)
    buy_in, prize, field_size, type
  FROM tournaments
  WHERE grind_session_id IS NULL
    AND buy_in >= 10
    AND currency = 'USD'
    AND user_id = $1
  ORDER BY name, site, buy_in, prize, field_size, position,
           date_played::date, date_played
)
```

- `grind_session_id IS NULL`: regra CLAUDE.md SS6.1 -- so historico, nao sessoes.
- `buy_in >= 10`: filtrar micro-stakes.
- `currency = 'USD'`: evitar misturar moedas na agregacao (torneios nao-USD sao minoria e o FX introduz ruido).
- `DISTINCT ON (..., date_played::date)`: remove duplicatas de timezone offset (mesmo torneio importado 2x com timestamps ligeiramente diferentes).

### ROI Ajustado (Re-entry Correction)

```
ROI_adjusted = SUM(prize) / NULLIF(SUM(buy_in) + SUM(GREATEST(0, -(prize + buy_in))), 0)
```

Quando um jogador faz re-entry, o registro mostra `prize` negativo abaixo de `-buy_in` (ex: buy_in=50, prize=-100 significa perdeu + re-entry de $50). O `GREATEST(0, -(prize + buy_in))` captura esse custo extra.

### Endpoint: `GET /api/variance/historical-stats`

- **Auth:** JWT (`requireAuth`)
- **Cache:** Server-side 1h TTL (Map in-memory, key=userId). Invalidado apos `POST /api/upload` (upload de CSV).
- **Response:** `HistoricalStats { tiers[], totals }` com ROI ajustado, field size medio, count por tier x tipo.
- **Low sample flag:** Tiers com < 20 torneios deduplicados recebem `lowSample: true`.

### Endpoint: `GET /api/variance/buckets-aggregate`

- **Auth:** JWT (`requireAuth`)
- **Query params:** `profileLetter=A&weeks=12`
- **Logica:**
  1. Buscar `planned_tournaments WHERE profile = $profileLetter AND is_active = true` para TODOS os dias.
  2. Contar quantos dias da semana tem torneios nesse perfil (`daysInProfile`).
  3. Agrupar por tier x tipo. Para cada grupo:
     - `countPerWeek` = torneios nesse grupo / 7 * daysInProfile
     - `count` = countPerWeek * weeks
     - `buyIn` = avg buy-in USD do grupo
     - `roi` = historico (RF-06) ou `NETWORK_DEFAULTS_ROI` fallback
     - `field` = historico (RF-06) ou `DEFAULT_PLAYERS_AVG` fallback
     - `source` = `'historical'` ou `'default'`
  4. Mergear Satellite/Add-on em Vanilla.
  5. Retornar `AggregatedBuckets { groups[], meta }`.

### Wizard UX

Toggle "Por periodo" (default, novo) vs "Por dia" (backward-compat).

"Por periodo":
1. User seleciona Perfil (A/B/C) + Periodo (1 semana / 1 mes / 1 trimestre / 1 ano).
2. `GET /api/variance/buckets-aggregate?profileLetter=A&weeks=12` retorna ~8 grupos.
3. Tabela editavel: user pode ajustar ROI, field, count de qualquer grupo.
4. Campo opcional "Investimento diario": escala buy-ins proporcionalmente.
5. Badges: `hist` (azul) para historico, `est` (amarelo) para heuristica/default.
6. "Simular" envia grupos para `POST /api/variance/simulate`.

### Performance

- `historical-stats`: ~120ms em ~10K rows (validado). Index existente `idx_tournaments_user_created_history` (partial, `grind_session_id IS NULL`) cobre a query.
- `buckets-aggregate`: ~50ms (planned_tournaments sao ~300 rows max por user).
- Cache 1h em historical-stats reduz DB load para o cenario comum (wizard aberto multiplas vezes, historico nao mudou).

### Dados

Sem migration SQL. Nenhuma tabela nova, nenhuma coluna nova. Os endpoints operam sobre dados existentes (`tournaments`, `planned_tournaments`) e retornam resultados calculados.

## Consequencias

### Positivas

- **Simulacao baseada em dados reais.** ROI e field size do historico do jogador, nao chutes genericos.
- **Wizard utilizavel.** ~8 grupos editaveis em vez de 263 rows individuais.
- **Periodo flexivel.** Simular semana, mes, trimestre ou ano sem multiplicador manual.
- **Re-entries contabilizadas.** ROI ajustado reflete custo real do grind.
- **Deduplicacao automatica.** Duplicatas de timezone offset nao poluem os calculos.

### Negativas

- **Filtro `currency = 'USD'` exclui torneios nao-USD.** Para jogadores com volume significativo em BRL/EUR/CNY, o historico fica incompleto. Mitigacao: maioria dos jogadores MTT profissionais joga em USD; extensao FX normalization pode ser adicionada em sprint futuro.
- **Tiers fixos nao atendem micro-stakes (<$10).** Mitigacao: publico-alvo e mid/high stakes. Micro-stakes nao sao relevantes para analise de variancia profissional.

### Neutras

- **Backward-compat mantida.** Modo "Por dia" + `GET /api/primedope/buckets-prefill` continuam funcionando. Nenhum endpoint existente removido.
- **Cache invalidation acoplada a upload.** O endpoint de upload (`POST /api/upload`) precisa chamar a invalidacao do cache de historical-stats. Acoplamento leve, justificado pela simplicidade.

## Confianca

**Alta.** A query de deduplicacao e ROI ajustado foram validadas interativamente com dados reais do jogador (~10K torneios, ~120ms). Os tiers sao well-understood na comunidade MTT. A agregacao por tier x tipo reduz 263 torneios para ~8 grupos -- confirmado com a grade real.

## Referencias

- **Spec:** `Docs/specs/sprint-variance-reform.md` (RF-06, RF-07, RF-08)
- **ADR-211:** `211-variance-native-monte-carlo-engine.md` (engine nativo VR-1)
- **ADR-031:** `031-tournament-types-orthogonal-model.md` (tipos primarios: Vanilla/PKO/Mystery/Satellite/Add-on)
- **CLAUDE.md SS6.1:** Regra `grind_session_id IS NULL` para historico
- **ADR-033:** `033-fx-rate-convention-units-per-usd.md` (convencao FX)
- **Diagramas:** `Docs/architecture/diagrams/variance-reform/`

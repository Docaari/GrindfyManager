# ADR-052 — Stats Analyzer: Coach AI tool `read_user_hud_stats`

- Status: Accepted
- Date: 2026-04-29
- Sprint: F3 / W4
- Decision owner: autonomous (founder AFK; spec default D5)

## Contexto

Sprint F3 W4 expoe stats HUD do usuario para o Coach AI via tool registrada
no registry singleton (`server/coachTools/registry.ts`, ADR-023 / ADR-042).

Coach precisa responder perguntas como:
- "Como ta meu VPIP nos ultimos torneios?"
- "Compare meu PFR atual vs media historica."
- "Meus 3Bet stats estao acima ou abaixo do recomendado?"

Sem essa tool, Coach nao tem acesso a snapshots HUD do usuario — ele so ve
contexto pre-buildado (analytics, leaks, cool-down history).

## Decisao

Criar tool `read_user_hud_stats`:

```ts
{
  name: 'read_user_hud_stats',
  description: 'Le snapshots HUD recentes do usuario (VPIP, PFR, 3Bet, etc.) ' +
               'do layout indicado (ou default). Retorna ultimo snapshot, ' +
               'delta vs media historica, e benchmark populacional estatico.',
  inputSchema: z.object({
    layoutName: z.string().optional(),     // se omitido, usa default
    statKeys: z.array(z.string()).optional(), // se omitido, retorna TODOS do layout
  }),
  gateByTier: ['pro', 'premium', 'admin'],
}
```

**Output sanitizado:**

```ts
{
  __type: 'ToolResult',
  tool: 'read_user_hud_stats',
  ok: true,
  data: {
    layoutName: 'Padrao PT4',
    layoutId: 'xyz',
    latestSnapshot: {
      capturedAt: ISO8601,
      sampleSize: 1500,
      values: { vpip: 22.5, pfr: 18.0, '3bet': 7.2, ... },
    },
    deltaVsAverage: {
      vpip: { current: 22.5, average: 21.0, delta: +1.5 },
      pfr:  { current: 18.0, average: 17.5, delta: +0.5 },
      ...
    },
    populationBenchmark: {
      vpip: { healthy: [18, 26], current: 22.5, status: 'in_range' },
      pfr:  { healthy: [14, 22], current: 18.0, status: 'in_range' },
      ...
    },
  },
}
```

`populationBenchmark` usa tabela ESTATICA (constante em codigo, nao DB) para
V1 — tabela de ranges saudaveis MTT 6-max baseado em consenso publico
(2NL-200NL recreational tracker data). V2/V3 pode trocar por dados Grindfy
agregados quando user base for grande.

## Razoes

### Tool dedicada (vs estender contexto pre-buildado)

- **Lazy.** Coach so paga round-trip se conversa precisar — economiza tokens.
- **Filtro flexivel.** `statKeys` permite Coach pedir so "vpip + pfr" sem
  carregar 30 stats.
- **Audit-friendly.** Tool calls logam input — ve-se quando Coach acessou
  HUD vs outras conversas.

### Gating tier `pro+`

- Stats analyzer sera feature pro+ (consistente com Coach tools existentes).
- Free tier ja nao recebe tools (`exportToolsForAnthropic` retorna []).

### `populationBenchmark` estatico (V1)

- V1 nao tem dados agregados Grindfy (poucos users). Hardcoded ranges
  publicos basta.
- Documentado em `server/coach/tools/hudStatsBenchmark.ts` com fonte
  comentada (PokerTracker default ranges).
- Trade-off: nao customiza por buyin/format. V2 melhora.

### Output sem PII

- `values` e numeros agregados — nao expoe `notes` do snapshot.
- `sampleSize` opcional, nullable.

## Alternativas

1. **Estender `coachContext`** (concatena ultimo snapshot no prompt):
   forca tokens em toda conversa, mesmo as que nao precisam de HUD.
2. **Sub-tool por stat** (`read_user_vpip`, `read_user_pfr`): explode
   namespace, sem ganho.
3. **Benchmark dinamico (DB)**: V2+. V1 nao tem amostra.

## Consequencias

- Novo arquivo: `server/coach/tools/readUserHudStats.ts` (handler).
- `server/coach/tools/hudStatsBenchmark.ts` (constants).
- Registracao em `server/coachTools/index.ts` (ja contem stubs +
  readCooldownHistory; padrao `safeRegister`).
- `Docs/api/coach-tools.md` ganha entrada da tool.
- Tests integration: `tests/integration/coach/stats-analyzer-coach-tool.test.ts`
  (Coach com tool montada → resposta cita stat real do snapshot).
- Lesson learned 04-23 #3: storage shape mock idealizado escondeu bugs.
  Tests usam fixture real (`tests/fixtures/coach-tool-readstats-response.json`).

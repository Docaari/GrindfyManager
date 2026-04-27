# ADR-023: Tool Registry Pattern modular por dominio (vez de registry global ou auto-discovery)

## Status
Aceito

## Data
2026-04-24

## Contexto

O Sprint Coach-2A (`docs/specs/coach-sprint-2a-page-context-and-tools.md`, RF-02) introduz o conceito de **tools** — funcoes invocaveis pelo LLM via Anthropic Tool Use API — para que o coach consulte dados sob demanda em vez de depender exclusivamente do bloco estatico do system prompt (ADR-019).

Este sprint entrega 5 read tools (`query_dimension`, `find_top_leaks`, `get_tournament_suggestions`, `explain_tournament_score`, `simulate_bankroll_scenario`). O roadmap Coach v2 ja preve **40 a 50 tools** ate a v2 completa, distribuidas em multiplos dominios:

- **Read tools** (Sprint 2A — entregue): analytics, leaks, suggestions, scoring, bankroll-simulation
- **Write tools** (Sprint 2B): `register_tournament_in_grade`, `start_grind_session`, `update_bankroll_rule`, `archive_session`, etc.
- **Coach proativo** (Sprint 2C+): `propose_session_plan`, `flag_tilt_risk`, etc.
- **Hand history parser** (Sprint 2C+): `parse_hand`, `analyze_spot`, `compare_with_solver`
- **Multimodal** (futuro): tools de OCR de screenshots
- **Acoes externas** (futuro): tools de exportacao, integracao com Discord/Telegram

Cada tool tem:
- `name`, `description` (para LLM)
- `inputSchema` (Zod)
- `handler` async
- `requiresConfirmation` (write tools)
- `auditLevel` (`'none' | 'log' | 'persist'`)
- `gateByTier` (opcional — restringe por plano)

A **pergunta central:** como organizar o registro dessas dezenas de tools? Centralizado em um arquivo, modular por dominio, ou auto-descoberto?

### Restricoes

- **Ownership claro.** Tools de bankroll devem viver perto do dominio bankroll. Tools de scoring devem viver perto do scoring engine. Mistura prejudica encontrabilidade.
- **Testabilidade.** Cada tool tem teste unitario isolado + teste de registro. Granularidade de modulo ajuda.
- **Tree-shaking nao e relevante** porque o servidor importa tudo de qualquer jeito (registry e populado em import time).
- **Implementer e Reviewer (proximos sprints) precisam adicionar tools sem refactor amplo.** Adicionar uma write tool em Sprint 2B nao deve forcar reescrita do registry global.
- **Anthropic tool format requer `tools` array no request.** O backend precisa formatar todas tools registradas em JSONSchema. Nao importa de onde vem — interface unificada.

## Opcoes Consideradas

### Opcao A: Registry global em arquivo unico (`server/coachTools/registry.ts` com array hardcoded)

```ts
// server/coachTools/registry.ts
export const ALL_TOOLS: CoachTool[] = [
  { name: 'query_dimension', handler: queryDimensionHandler, ... },
  { name: 'find_top_leaks', handler: findTopLeaksHandler, ... },
  { name: 'get_tournament_suggestions', ... },
  // ... mais 47 tools
];
```

- **Pros:**
  - Simples de ler — uma fonte de verdade.
  - Indexavel: qualquer dev encontra todas tools com Ctrl+F em 1 arquivo.
  - Sem ambiguidade de "onde adicionar".

- **Contras:**
  - **Arquivo cresce sem limite.** 50 tools => arquivo com 200+ imports + 200+ linhas de array. Conflitos de merge crescem proporcionalmente.
  - **Acoplamento entre dominios.** Mudar uma tool de scoring forca commit no mesmo arquivo de tools de bankroll. Code review fica ruim.
  - **Sem ownership semantico.** Quem e dono de `coachTools/registry.ts`? Time de scoring? Bankroll? Tudo? Indefinicao.
  - **Escala mal para mais sprints.** Sprint 2B adiciona 5 write tools, 2C mais 8, 2D mais 6 — todos no mesmo arquivo. Eventualmente vira "deus arquivo" como o `routes.ts` antigo do projeto (mais de 6000 linhas, ja modularizado).
  - **Rejeitada por escala.**

### Opcao B: Registry modular por dominio + index central (ESCOLHIDA)

```
server/coachTools/
  registry.ts              # interface CoachTool, registerTool, getTool, exportToolsForAnthropic
  index.ts                 # importa cada handler e chama registerTool() — preenche em import time
  handlers/
    queryDimension.ts      # handler + schema da tool query_dimension
    findTopLeaks.ts
    getTournamentSuggestions.ts
    explainTournamentScore.ts
    simulateBankrollScenario.ts
    # Sprint 2B+: registerTournament.ts, startGrindSession.ts, ...
```

`index.ts`:
```ts
import { registerTool } from './registry';
import { queryDimensionTool } from './handlers/queryDimension';
import { findTopLeaksTool } from './handlers/findTopLeaks';
// ... outros imports

registerTool(queryDimensionTool);
registerTool(findTopLeaksTool);
// ... outros registros
```

- **Pros:**
  - **Ownership por dominio.** Cada handler vive em seu arquivo. Bankroll team mexe em `simulateBankrollScenario.ts`. Scoring team mexe em `explainTournamentScore.ts`. Conflitos minimos.
  - **Escalavel.** Sprint 2B adiciona arquivos novos em `handlers/`, mais 5 linhas em `index.ts`. Zero reescrita.
  - **Imports explicitos.** Diferente de auto-discovery, e impossivel "esquecer de registrar". Falha em import time se o handler nao for referenciado.
  - **Ainda ha um indice unico.** `index.ts` lista todas tools em ordem — mesma encontrabilidade da Opcao A, sem o peso.
  - **Testes seguem padrao.** `tests/unit/coachTools/handlers/queryDimension.test.ts` testa um handler isoladamente. `tests/unit/coachTools/registry.test.ts` testa o registry.
  - **Compativel com TypeScript paths.** `import { ... } from '@/server/coachTools/handlers/...'` se necessario.
  - **Padrao consistente com o projeto.** Routes ja foi modularizado em `server/routes/*.ts` (ver issue 10.2 #1 do CLAUDE.md). Tools seguem mesma filosofia.
  - **Permite cache_control no Anthropic tools array (futuro).** Como `exportToolsForAnthropic` controla a serializacao, e simples adicionar `cache_control` a slices da array.

- **Contras:**
  - **+1 arquivo por tool.** Custo aceito — alinhado a "Single Responsibility".
  - **Boilerplate de registro.** Cada nova tool exige (a) criar handler em `handlers/`, (b) adicionar import em `index.ts`, (c) chamar `registerTool()`. 3 passos. Aceito.

### Opcao C: Auto-discovery via convencao de pasta

`server/coachTools/handlers/*.ts` exporta default `CoachTool`. Loader em `registry.ts` faz `glob('handlers/*.ts')` e importa dinamicamente em runtime.

- **Pros:**
  - Zero boilerplate de registro — soltar arquivo na pasta basta.

- **Contras:**
  - **Quebra com bundlers.** esbuild (usado em build de prod, ver `package.json` script `build`) nao garante tree-shaking ou import dinamico de pastas. Risco de tools "sumirem" em prod sem ninguem perceber ate produzao.
  - **Imports dinamicos sao runtime.** Falha de import nao da error em `tsc`. Bug so aparece quando coach chama tool, ja em prod.
  - **Magic.** Dev novo abre `registry.ts`, ve `glob()`, perde 30 minutos entendendo. Pior DX.
  - **Testes mais frageis.** Mockar registry exige mockar fs/glob.
  - **Rejeitada por fragilidade em build/runtime.**

### Opcao D: Cada dominio expoe seu proprio sub-registry

`server/scoring/scoringTools.ts` registra suas tools internamente. `server/coachTools/registry.ts` faz import-and-merge de varios sub-registries.

- **Pros:**
  - Maximo de proximidade dominio-tool.

- **Contras:**
  - **Fragmenta o conceito de "tool".** Existem N pequenos registries em vez de 1. Debug fica complicado.
  - **Acoplamento circular potencial.** `scoring` importa `coachTools.registry`, `coachTools.index` importa `scoring`. Build pode quebrar dependendo da ordem.
  - **Nao agrega vantagem real sobre Opcao B.** Os handlers ja podem importar livremente de qualquer modulo do projeto (ex: `simulateBankrollScenario.ts` importa `bankrollService`). Mover o registro para o dominio nao melhora ownership.
  - **Rejeitada por complexidade desnecessaria.**

## Decisao

**Adotar Opcao B: registry modular por dominio com index central explicito.**

### Detalhes-chave do design

1. **`server/coachTools/registry.ts`** define:
   - `interface CoachTool<I = unknown, O = unknown>` com `name`, `description`, `inputSchema: ZodSchema<I>`, `handler: (input: I, ctx: ToolContext) => Promise<O>`, `requiresConfirmation`, `auditLevel`, `gateByTier?`
   - `interface ToolContext` com `userId`, `chatSessionId`, `messageId`, `pageContext?`
   - `registerTool(tool: CoachTool)` — adiciona ao Map interno; `throw Error('tool_already_registered')` se duplicada.
   - `getTool(name: string): CoachTool | undefined`
   - `exportToolsForAnthropic(tier: CoachTier): AnthropicToolSchema[]` — filtra por `gateByTier` (undefined => todos os tiers) e converte `inputSchema` Zod para JSONSchema via `zod-to-json-schema`.
   - `listRegisteredTools(): string[]` — debug.

2. **`server/coachTools/index.ts`** importa cada handler e chama `registerTool()`. Esta e a UNICA camada que preenche o registry. Outros modulos nao chamam `registerTool` diretamente.

3. **`server/coachTools/handlers/<toolName>.ts`** exporta um objeto `CoachTool`. Um arquivo por tool. Padrao:
   ```ts
   export const queryDimensionTool: CoachTool<QueryDimensionInput, QueryDimensionOutput> = {
     name: 'query_dimension',
     description: '...',
     inputSchema: queryDimensionSchema,
     handler: queryDimensionHandler,
     requiresConfirmation: false,
     auditLevel: 'log',
   };
   ```

4. **`server/coachToolRunner.ts`** (modulo separado, nao no registry) chama `getTool` + valida input + executa handler + audita em `coach_actions`. Documentado em ADR-024 (wrapping de result).

5. **Adicionar nova tool em sprints futuros (Sprint 2B+):**
   - Criar arquivo `handlers/registerTournamentInGrade.ts`.
   - Adicionar import + `registerTool()` em `index.ts`.
   - Criar testes em `tests/unit/coachTools/handlers/registerTournamentInGrade.test.ts`.
   - Pronto. Zero refactor.

6. **Convencao de naming:** filename = camelCase do tool name. Ex: `query_dimension` -> `queryDimension.ts`.

## Consequencias

### Positivas
- **Escalabilidade.** Crescimento de 5 -> 50 tools nao causa entropia em arquivo unico.
- **Code review limpo.** PR de tool nova mexe em arquivos novos + 1 linha em `index.ts`.
- **Ownership semantico.** Tools de bankroll vivem juntas, tools de scoring juntas, etc.
- **Testes isolados.** Um teste por handler. Mocks claros.
- **Padrao consistente.** Mesma filosofia da modularizacao de `server/routes/` ja feita.
- **Permite optimizacoes futuras.** `cache_control` em slices da array tools fica trivial em `exportToolsForAnthropic`.

### Negativas
- **Boilerplate de 3 passos por tool.** Aceito; mitigado por templates/snippets se virar dor.
- **Index central pode acumular `~50` linhas.** Aceito — segue patternsl simples (1 import + 1 register por tool).
- **Erros de typo em `name` so aparecem em runtime** (ao chamar `getTool`). Mitigacao: `listRegisteredTools` em test smoke + tests por tool que verificam name.

### Neutras
- **Coach-2A so tem 5 tools.** Beneficio fica claro quando Sprint 2B adicionar mais 5+. Investimento upfront aceito.
- **Caminho aberto para sub-pastas se dominios crescerem muito.** Ex: `handlers/scoring/`, `handlers/bankroll/`, `handlers/grind/`. Refactor incremental quando justificar.

## Confianca

**Alta.** Padrao identico ao usado em frameworks como Express middlewares, NestJS providers, Strapi plugins. Risco principal — esquecer de registrar em `index.ts` — mitigado por test smoke `listRegisteredTools().length === expected`.

## Referencias

- Spec: `docs/specs/coach-sprint-2a-page-context-and-tools.md` (RF-02)
- ADR-024: tool result wrapping (defesa anti prompt injection)
- ADR-026: continuation loop limit
- Sequence diagram: `docs/architecture/sequence-coach-tool-use.mermaid`
- Padrao paralelo: `server/routes/` modularizado (CLAUDE.md secao 10.2 #1)

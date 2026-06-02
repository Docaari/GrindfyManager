# ADR-232: Fase C #4 — Tilt tipado (7 tipos) + antídoto

## Status
Aceito

## Data
2026-06-02

## Contexto

A captura crua de tilt já existe no cool-down (`cooldown_logs.tilt_self_assessment` jsonb: `feltTilt`, `keptTilting`, `presence`, `triggers[]`, `action`). O que falta — e o curso D1 ("Você não está tiltado — está em um dos sete") prega como tese central — é tipificar o tilt em **um dos 7 tipos psicológicos** (taxonomia de Tendler) e oferecer o **antídoto distinto** de cada tipo. "Estou tiltado" é sintoma, não diagnóstico; cada tipo tem causa, sintoma e alavanca diferentes.

Esta é a peça **#4 do board ICE (7.7)** da Fase C, âncora curso D1. Irmã da Fase B (ADR-228), que expôs lead measures já capturados na aba Mental lendo `cooldown_logs` read-only. O tilt tipado segue o mesmo molde: estende a captura mínima (campo jsonb, sem migration) + agrega read-only no padrão `cooldownAnalytics.ts`.

Spec aprovada: `Docs/specs/sprint-fase-c-4-tilt-tipado-2026-06-02.md`.

Forças em jogo:
- **SEM migration** — `tiltType` cabe dentro do jsonb `tilt_self_assessment` já existente (lesson #7 nullable+optional).
- **SEM tier gate** — paridade com `stat_analysis` (EST-3) e Fase B.
- **SEM LLM** — antídoto é estático, derivado literalmente do conteúdo do curso D1 §2.4 + §15.1.
- **PII travado** — `action`/notas (texto livre) NUNCA na agregação nem na resposta (lesson Fase B R5).
- Reuso máximo dos padrões existentes (catálogo `hud-stat-catalog.ts`, rota `cooldownAnalytics.ts`, widget Mental).

## Opções Consideradas (decisões D-1..D-7)

### D-1: Onde mora a heurística de sugestão de tipo

#### Opção 1: Helper puro em `shared/tilt-types.ts` (`suggestTiltType`)
- **Prós:** client mostra a sugestão sem roundtrip (UX instantânea no cool-down); server reusa a MESMA função na (eventual) derivação de legados — zero divergência (lesson #10 DRY de prompts/regras); determinístico, testável isolado (padrão dos helpers puros de `server/coach/goals/` e `server/coach/adherence/`).
- **Contras:** vive em `shared/` (precisa importar `TILT_TRIGGERS` de `schema.ts` — já é dep esperada).

#### Opção 2: Helper server-side em `server/coach/...`
- **Prós:** isola do bundle client.
- **Contras:** client precisaria roundtrip para sugerir → UX pior; ou duplicaria a regra no client → divergência silenciosa (anti-lesson #10).

### D-2: Rota de agregação — reusar `cooldownAnalytics.ts` ou módulo novo

#### Opção 1: Reusar `server/routes/cooldownAnalytics.ts` (padrão Fase B D-B1)
- **Prós:** reusa `userIdOf`/`resolvePeriod`/`setCacheHeader`/`unauthorized`/`VALID_PERIODS`; mesmo grupo semântico (`/api/analytics/*`); registro já existe (`registerCooldownAnalyticsRoutes` chamada em `routes/index.ts:280`); todas as rotas são static paths distintos — **zero colisão** (nenhum `:id` no namespace `/api/analytics`).
- **Contras:** arquivo cresce (aceitável — Fase B já adicionou 2 handlers lá).

#### Opção 2: Módulo novo `tiltAnalytics.ts`
- **Contras:** duplica os 4 helpers; nova linha de registro em `index.ts` (risco de colisão de merge na tree compartilhada — incidente #24/#45). Sem ganho.

### D-3: Handlers — `import { storage }` direto vs `injectedStorage`

#### Opção 1: `import { storage }` + `vi.mock` (padrão `cooldownAnalytics.ts`, Fase B D-B2)
- **Prós:** consistência rígida com o módulo escolhido (D-2) — `cooldownAnalytics.ts` importa `storage` no topo e todos os handlers usam direto. Test-writer mocka `storage.getTiltTypeDistribution` via `vi.mock("../storage")` retornando o shape REAL (lesson #3).
- **Contras:** menos "injetável" que o padrão `injectedStorage` (3º arg) dos módulos novos (lesson #34) — mas a coerência com o arquivo vence.

#### Opção 2: `injectedStorage` (3º arg)
- **Contras:** quebraria o padrão do arquivo (os 6 handlers existentes não usam). Mistura inconsistente.

### D-4: Semântica de `getTiltTypeDistribution` — conta explícito vs deriva legados

#### Opção 1: Conta SÓ `tiltType` explícito (não-null no jsonb)
- **Prós:** semântica honesta — "isto é o que o jogador (ou a heurística confirmada) registrou"; sem reinterpretar dados antigos com lógica nova (que mudaria retroativamente se a heurística mudasse); `typedCount` reflete adoção real do recurso; determinístico e estável.
- **Contras:** registros legados (sem `tiltType`) contam só em `totalAssessments`, não em `distribution` → `typedCount` baixo no começo (mitigado por `dataSufficiency:'low'`).

#### Opção 2: Deriva via heurística quando `tiltType` ausente
- **Prós:** "preenche" legados.
- **Contras:** mistura dado declarado com inferido na MESMA contagem (ambíguo); a distribuição mudaria retroativamente se a heurística evoluísse (não-determinístico no tempo); o jogador veria um "dominante" que nunca confirmou. Anti-RF-04 (a spec diz "typedCount = quantos tinham tiltType não-null").

### D-5: Onde exportar o tipo `TiltTypeDistribution`

#### Opção 1: `server/storage.ts` (padrão Fase B D-B3 — `AbGameDistribution`/`WarmupComplianceMetrics`)
- **Prós:** consistência com os tipos de agregação irmãos (todos vivem em `storage.ts` como `export interface`); o client espelha o shape localmente (interface local em `MentalAnalyticsTab.tsx`, como já faz com `AbGameDistributionData`).
- **Contras:** `TiltTypeId` (o enum) ainda vem de `shared/tilt-types.ts` — o tipo de distribuição referencia `TiltTypeId` importado de shared. Aceitável (storage já importa de shared).

#### Opção 2: `shared/tilt-types.ts`
- **Contras:** quebra o padrão dos outros tipos de agregação (que moram em storage.ts).

### D-6: Componentes UI

#### Opção escolhida (componentes REAIS verificados):
- **Cool-down:** `client/src/components/cooldown/BlockThreeTiltReview.tsx` recebe o seletor de tipo + card de antídoto. O `TiltAssessmentValue` é estendido com `tiltType?: TiltTypeId | null`; o componente já tem `value`/`onChange` controlados pelo `CoolDownRunner.tsx` (que persiste via `PATCH /api/cooldown-logs/:id`). O seletor mostra a sugestão pré-destacada (`suggestTiltType(value)`), nunca auto-grava (lesson #11).
- **Aba Mental:** `client/src/components/profile/MentalAnalyticsTab.tsx` ganha um 7º widget `TiltDominantWidget` (irmão dos 6 existentes), consumindo `GET /api/analytics/tilt-type-distribution` via `useQuery` (mesmo padrão dos outros widgets).
- `data-testid` estáveis (lesson #2): `tilt-type-selector`, `tilt-type-option-{id}`, `tilt-antidote-card`, `mental-tilt-dominant`.

### D-7: Heurística determinística — função exata

`suggestTiltType(assessment): TiltTypeId | null` (pura, sem I/O). Ver §Decisão para o contrato completo + tabela trigger→tipo + precedência.

## Decisão

- **D-1 → Opção 1.** Helper puro `suggestTiltType` em `shared/tilt-types.ts`. Client sugere sem roundtrip; server reusa a mesma função (na derivação opcional, que NÃO usamos na agregação — ver D-4).
- **D-2 → Opção 1.** Reusar `server/routes/cooldownAnalytics.ts`. Novo handler `handleTiltTypeDistribution` + nova linha em `registerCooldownAnalyticsRoutes`. Sem nova chamada em `routes/index.ts` (registro já existe na linha 280). Sem colisão (namespace `/api/analytics` é só static paths).
- **D-3 → Opção 1.** `import { storage }` direto; teste via `vi.mock("../storage")` no shape real (lesson #3). Sem `injectedStorage`.
- **D-4 → Opção 1.** A agregação conta **SÓ `tiltType` explícito** (não-null no jsonb). `totalAssessments` = cool-downs com tilt declarado (`feltTilt>0 || keptTilting>0`); `typedCount` = quantos desses têm `tiltType` não-null; `sharePct` sobre `typedCount`. Legados sem tipo NÃO são derivados na agregação (determinismo + honestidade). A heurística vive só na sugestão de UX.
- **D-5 → Opção 1.** `export interface TiltTypeDistribution` em `server/storage.ts` (referenciando `TiltTypeId` de `shared/tilt-types.ts`). Client espelha local em `MentalAnalyticsTab.tsx`.
- **D-6 → componentes reais:** `BlockThreeTiltReview.tsx` (cool-down) + `MentalAnalyticsTab.tsx` (aba Mental). Nenhum componente novo de página.
- **D-7 → heurística travada** (abaixo).

### Catálogo (`shared/tilt-types.ts`) — paridade `hud-stat-catalog.ts`

```ts
export const TILT_TYPE_IDS = [
  "running_bad", "injustice", "hate_losing", "mistake",
  "entitlement", "revenge", "desperation",
] as const;
export const tiltTypeSchema = z.enum(TILT_TYPE_IDS);
export type TiltTypeId = typeof TILT_TYPE_IDS[number];

export interface TiltTypeMeta {
  id: TiltTypeId;
  label: string;          // PT-BR (curso D1 §2.4)
  description: string;    // contextual ("nesta fase..."), nunca de identidade (A4)
  defaultTrigger: TiltTrigger | null;  // mapeia p/ TILT_TRIGGERS quando há 1:1
  antidote: string;       // literal do curso §15.1
}
// TILT_TYPE_CATALOG: TiltTypeMeta[] (conteúdo literal do curso — test-writer/implementer NÃO inventam)
// TILT_TYPE_INDEX = new Map (espelha STAT_INDEX_BY_ID)
// getTiltType(id): TiltTypeMeta | undefined   (espelha getStatById)
// isValidTiltType(id): boolean
```

### Contrato `suggestTiltType` (D-7 — determinístico)

```ts
// Input: o assessment (subset relevante). Pura. Determinística.
function suggestTiltType(
  a: { triggers: string[]; feltTilt?: number; keptTilting?: number; presence?: number },
): TiltTypeId | null
```

**Tabela trigger → tipo** (mapeamento situacional):

| trigger presente | tipo sugerido |
|---|---|
| `briga-interpessoal` | `revenge` |
| `cooler` OU `slowroll` OU `big-bluff-fail` | `injustice` |
| `downswing` | `running_bad` |
| `distracao` / `fome` / `sono` / `outro` | (não mapeiam — estados aversivos genéricos, não tipos) |

**Precedência (primeiro match vence):**
1. `briga-interpessoal` presente → `revenge`
2. `cooler` ∨ `slowroll` ∨ `big-bluff-fail` presente → `injustice`
3. `downswing` presente → `running_bad`
4. nenhum trigger mapeável **E** `keptTilting >= 7` → `desperation` (manteve tiltando alto = chasing provável)
5. caso contrário → `null` (não chuta; jogador decide)

A escolha explícita do jogador SEMPRE vence a sugestão. A sugestão é exibida como "Parece tilt de ___?" pré-selecionável, nunca auto-gravada (lesson #11). Gating de persistência: se `feltTilt===0 && keptTilting===0`, `tiltType` é ignorado (não há tilt a tipificar).

### Schema (sem migration)

`tiltSelfAssessmentSchema` (schema.ts:3857) ganha:
```ts
tiltType: tiltTypeSchema.nullable().optional()   // lesson #7 — back-compat
```
+ `tiltType?: TiltTypeId | null` no type `TiltSelfAssessment` (schema.ts:3549). Campo dentro do jsonb `tilt_self_assessment` existente — **nenhum ALTER TABLE, nenhuma tabela nova, nenhuma migration**.

### Contrato `getTiltTypeDistribution`

```ts
storage.getTiltTypeDistribution(userId: string, period: "7d"|"30d"|"90d"): Promise<TiltTypeDistribution>

export interface TiltTypeDistribution {
  period: "7d" | "30d" | "90d";
  totalAssessments: number;   // cool-downs (completedAt!=null, startedAt>=cutoff) com tilt declarado (feltTilt>0 || keptTilting>0)
  typedCount: number;         // subset com tiltType não-null e válido
  dominant: TiltTypeId | null;// maior count; null se typedCount===0 OU empate no topo
  distribution: Array<{ tiltType: TiltTypeId; count: number; sharePct: number }>; // desc por count; sharePct = count/typedCount
  dataSufficiency: "ok" | "low"; // "low" quando typedCount < 3
}
```

Implementação (espelha `getAbGameDistribution`): scan `cooldown_logs` do período (`completedAt!=null AND startedAt>=cutoff`); para cada row lê `tiltSelfAssessment` jsonb; pula se não-objeto (lesson #9, distingue "sem dados" de "DB explodiu"); conta `totalAssessments` quando `feltTilt>0 || keptTilting>0`; conta `typedCount`/`distribution` só quando `tiltType` é não-null e `isValidTiltType`. `action`/notas NUNCA lidos para a resposta (PII). Empate no topo → `dominant: null`.

Endpoint: `GET /api/analytics/tilt-type-distribution` — `requireAuth`, ownership por `userId`, `Cache-Control: private, max-age=300`, `period` inválido → 400, sem auth → 401, erro → 500 com `console.error` antes (lesson #9).

## Consequências

**Positivas:**
- Zero migration, zero tier gate, zero LLM → sprint barato e reversível.
- DRY total: heurística única (shared) servindo client+server; rota reusa helpers Fase B; tipo no padrão dos irmãos.
- PII travado por design (só enum + contagens trafegam).
- Habilita um sourceMetric mental futuro (METAS-1 RF-15: frequência de tilt tipado) sem implementá-lo.

**Negativas:**
- `typedCount` baixo no começo (legados não derivados — escolha consciente D-4); mitigado por `dataSufficiency:'low'`.
- `cooldownAnalytics.ts` cresce mais um handler (aceitável).

**Neutras:**
- Conteúdo dos antídotos é fonte de verdade do curso D1 — qualquer revisão de texto é edit no catálogo, sem código.
- `desperation` aponta para o stop-loss mecânico do #5 (Fase D) mas NÃO o implementa.

## Confiança
Alta — padrões 100% verificados em código (catálogo, rota, storage, schema, ambos os componentes UI reais).

## Pendência
README index de `decisions/` NÃO atualizado neste passo (deliberado — evita colisão de merge na tree compartilhada; atualizar no fim do sprint).

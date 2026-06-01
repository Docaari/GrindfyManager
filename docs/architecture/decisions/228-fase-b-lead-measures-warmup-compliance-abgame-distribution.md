# ADR-228: Fase B — Lead Measures Baratos (Warm-up Compliance + Distribuição A/B/C-game)

## Status
Aceito

## Data
2026-06-01

## Contexto

A plataforma **já captura** os dois *lead measures* 4DX mais puros — compliance de processo (`warmup_rituals`) e autoavaliação A/B/C-game (`cooldown_logs.abGameAnswers`) — e **não mostra nenhum**. A aba **Mental** do perfil (`MentalAnalyticsTab`) já tem a infra de cooldown compliance end-to-end (`storage.getCooldownComplianceMetrics` → `GET /api/analytics/cooldown-compliance` → `ComplianceWidget`) e a word-cloud de lições (`getTopLessons` + `tokenizeLessons`). Falta espelhar esse padrão para o **warm-up** e agregar a **distribuição A/B/C-game**.

Spec: `Docs/specs/sprint-fase-b-lead-measures-2026-06-01.md` (RF-01..RF-04). É um sprint de **leitura/agregação pura** sobre dados existentes — provável zero migration, zero novo fluxo de captura. Prepara o `sourceMetric` do placar 4DX da futura ferramenta de Metas (`Docs/specs/metas-tool-2026-06-01.md`).

Duas decisões de produto **já travadas pelo founder** entram como invariantes deste ADR:
1. Warm-up rodado completo onde `decisionToPlay=false` (decidiu **não** jogar) conta como **compliance positivo** — é processo executado corretamente (C8/A4/A2), não falha.
2. O **C-game fica fora do share A/B**. O share é só A vs B (arrays comparáveis); o C-game entra como contagem + temas tokenizados (é texto livre / ponto de atenção, C2).

### Recon do código real (lesson #3 — shape real, não idealizado)

- **`server/storage.ts:8021` `periodCutoff`** — `new Date(Date.now() - days*86400000)`. Retrospectivo, NÃO janela de semana UTC.
- **`server/storage.ts:8026` `getCooldownComplianceMetrics`** — modelo a espelhar: 2 `count()` (`grind_sessions status='completed' AND date>=cutoff` para `total`; `cooldown_logs completedAt!=null AND startedAt>=cutoff` para `completed`) + `complianceRate = total>0 ? Math.min(1, completed/total) : 0`. `Number(x ?? 0)` em ambos.
- **`server/storage.ts:8157` `getTopLessons`** — modelo a espelhar para tokens: SELECT `abGameAnswers` de `cooldown_logs` (`completedAt!=null AND startedAt>=cutoff`), parse defensivo (`answers?.lesson`, `typeof === 'string' && .trim()`), `await import("./services/lessonTokenizer")` → `tokenizeLessons(lessons)`.
- **`server/services/lessonTokenizer.ts`** — `tokenizeLessons(string[]) → Array<{token,count}>`. `TOP_N=30`, descarta tokens `.length <= 3`, STOPWORDS PT-BR/EN, lowercase, split por whitespace+pontuação, sort desc por count + tiebreak `localeCompare`. Já é PII-safe (só palavras isoladas > 3 chars).
- **`server/routes/cooldownAnalytics.ts`** — módulo de analytics da aba Mental. Padrão de handler: `import { storage }` **direto** (NÃO `injectedStorage`), handlers `(req, res)` de 2 args, helpers `userIdOf`/`resolvePeriod`/`setCacheHeader`/`unauthorized`, `VALID_PERIODS = {7d,30d,90d}`, `DEFAULT_PERIOD='30d'`, `CACHE_HEADER='private, max-age=300'`. `requireAuth` no registro. Erro → `console.error` + `500 {message}` (lesson #9). Registrado em `server/routes/index.ts:276` via `registerCooldownAnalyticsRoutes(app)`.
- **`client/src/components/profile/MentalAnalyticsTab.tsx`** — 4 widgets (`ComplianceWidget`/`DistributionWidget`/`ImpactWidget`/`LessonsWidget`), `Skeleton` local, period selector com `<button>` plano (NÃO Radix tabs — lesson #27 N/A), `useQuery` + `apiRequest("GET", url)` (retorna JSON parseado — lesson #13), `data-testid` por widget, `anyError` banner agregado. `QueryClientProvider` é provido pelo parent (perfil) — sem necessidade de ErrorBoundary local (lesson #29 N/A nesta superfície; o `anyError` já isola).
- **Schema `warmup_rituals` (`shared/schema.ts:842`)** — colunas: `userId`, `startedAt notNull`, `completedAt nullable`, `version varchar(16) notNull` (`'full'`/`'aborted'`; `'minimal'` reservado p/ Sprint W-3, não existe ainda), `decisionToPlay boolean` (`null`=aborted, `true`=jogou, `false`=não jogou), `overrideUsed boolean default false`, `emotionalCheckScore`. Índices: `idx_warmup_rituals_user_completed (userId, completedAt)` + `idx_warmup_rituals_user_started (userId, startedAt)`.
- **Schema `cooldown_logs` (`shared/schema.ts:3515`)** — `abGameAnswers jsonb $type<AbGameAnswers>` onde `AbGameAnswers = { aGame: string[]; bGame: string[]; cGame: string; lesson: string }` (schema.ts:3500). Índice `idx_cooldown_user_completed (userId, completedAt)`.

## Opções Consideradas

### Opção 1: Módulo de rota — reusar `cooldownAnalytics.ts` vs novo `mentalAnalytics.ts`
- **Reusar `cooldownAnalytics.ts`** (renomear conceitualmente para "mental analytics"):
  - **Prós:** já é o módulo de analytics da aba Mental; mesmo `userIdOf`/`resolvePeriod`/`setCacheHeader`/`unauthorized`/constantes (DRY); já registrado em `index.ts:276` (zero mudança de ordem de registro → zero risco de colisão); o widget consome do mesmo prefixo `/api/analytics/`.
  - **Contras:** o nome do arquivo passa a ser levemente mentiroso (warm-up não é cool-down). Mitigável com atualização do cabeçalho do arquivo.
- **Novo `mentalAnalytics.ts`**:
  - **Prós:** nome semântico.
  - **Contras:** duplica os 4 helpers OU exige extrair um `_analyticsShared.ts` (over-engineering p/ 2 endpoints); nova entrada de registro em `index.ts` (mais um ponto de ordem a controlar). Sem ganho real.

### Opção 2: injectedStorage (lesson #34/#36) vs `import { storage }` direto (padrão do módulo)
- **`import { storage }` direto** (padrão atual de `cooldownAnalytics.ts`):
  - **Prós:** consistência byte-a-byte com os 4 handlers vizinhos; o test-writer mocka via `vi.mock("../storage")` exatamente como os testes de cooldown analytics já fazem; zero divergência de assinatura no mesmo arquivo.
  - **Contras:** depende de `vi.mock` (não composição por 3º arg).
- **`injectedStorage` 3º arg**:
  - **Prós:** mock por composição sem `vi.mock`.
  - **Contras:** divergiria do padrão do arquivo (os 4 handlers irmãos usariam `storage` direto e os 2 novos não) — inconsistência interna que confunde leitura e review. Lesson #34/#36 aplica-se a **módulos novos**; aqui herdamos um módulo com padrão estabelecido.

### Opção 3: C-game no share — A/B (RESOLVIDO) vs tri-share A/B/C
- Travado pelo founder: **share só A vs B**. `aGame`/`bGame` são arrays de itens comparáveis; `cGame` é string única (texto livre). Tri-share misturaria contagem-de-itens com contagem-de-entradas (unidades diferentes) — semanticamente errado. C-game = `cGameEntryCount` + `cGameThemes`.

## Decisão

### D-B0 — Número e migration
ADR **228** (227 é o maior em disco). **SEM MIGRATION** — confirmado: os índices `idx_warmup_rituals_user_started (userId, startedAt)` cobrem o filtro de RF-01 (`userId` + `startedAt >= cutoff`); `idx_cooldown_user_completed (userId, completedAt)` cobre RF-02 exatamente como já cobre `getTopLessons` (o `completedAt!=null` usa o índice pelo prefixo `userId`; `startedAt>=cutoff` é filtro residual no mesmo scan — idêntico ao callsite existente, sem regressão de perf). Nenhuma coluna, tabela ou índice novo. Interface TS pura, como EST-2/ADR-227.

### D-B1 — Módulo de rota: reusar `cooldownAnalytics.ts` (Opção 1)
Registrar `handleWarmupCompliance` e `handleAbGameDistribution` em `server/routes/cooldownAnalytics.ts`, reusando os 4 helpers. Atualizar o cabeçalho do arquivo (de "Cool-down Analytics" para "Mental Analytics — cool-down + warm-up + A/B/C-game"). Adicionar as 2 rotas em `registerCooldownAnalyticsRoutes` após `top-lessons`. **Ordem de registro inalterada** (`index.ts:276` continua igual). **Resolve DEC-B7.**

### D-B2 — Handlers seguem o padrão do módulo: `import { storage }` direto (Opção 2)
`handleWarmupCompliance(req, res)` e `handleAbGameDistribution(req, res)` — 2 args, `storage` importado no topo, mock via `vi.mock("../storage")`. Reusam `userIdOf`/`resolvePeriod`/`setCacheHeader`/`unauthorized`/`VALID_PERIODS`/`CACHE_HEADER`. Erro → `console.error(...)` antes (lesson #9) + `500 {message}`. **Resolve DEC-B6.**

### D-B3 — Onde moram os tipos
Os 2 tipos (`WarmupComplianceMetrics`, `AbGameDistribution`) são **exportados de `server/storage.ts`**, ao lado dos métodos (espelha o retorno inline anônimo do cooldown, mas nomeados porque o widget e a futura Metas referenciam o shape). São server-side; o widget redeclara interfaces locais espelho em `MentalAnalyticsTab.tsx` (mesma convenção que `ComplianceData`/`LessonItem` já usam hoje — não importam do server). **Promoção a `shared/` deferida** para quando a Metas consumir o shape em build compartilhado (mesma postura de ADR-227 DEC-MA1).

### D-B4 — Semântica exata do compliance warm-up (RF-01)
**Denominador (`total`)** = `grind_sessions` com `status='completed'` e `date >= cutoff` (§6.1 — `grind_sessions`, NUNCA `session_tournaments`). **Idêntico ao cooldown** → comparável no mesmo widget.

**Numerador (`completed`)** = `warmup_rituals` com `completedAt IS NOT NULL AND version='full'` e `startedAt >= cutoff`. A decisão travada (`decisionToPlay=false` conta positivo) **já é capturada por construção**: a query NÃO filtra `decisionToPlay`, então o ritual completo que decidiu não jogar permanece em `completed`. **Não** se adiciona OR/filtro de `decisionToPlay` — `version='full'` já cobre.

**`complianceRate`** = `total > 0 ? Math.min(1, completed / total) : 0`. **Clamp em 1 obrigatório** (R1): `warmup_rituals` e `grind_sessions` são tabelas independentes alinhadas por janela de data (não por `linkedGrindSessionId` 1:1 — warm-up nem sempre vira sessão; um warm-up `full` com `decisionToPlay=false` NÃO gera `grind_session completed`). Logo `completed > total` é possível (mais warm-ups que sessões jogadas) → antes do clamp daria >100%. O clamp em 1 mitiga (mesmo trade-off já aceito no cooldown). O microcopy explicita a semântica ("warm-ups completos vs sessões jogadas").

**Janela:** numerador por `warmup_rituals.startedAt >= cutoff` (espelha cooldown que usa `cooldownLogs.startedAt >= cutoff`); denominador por `grind_sessions.date >= cutoff`.

**`version='aborted'`** → excluído de `completed`, contado em `abortedCount`.

**`'minimal'` (futuro — DEC-B1):** a regra trava só `'full'` (minimal não existe; hoje retornaria 0 rows). Decisão: **manter `version='full'` estrito** (não usar `version IN ('full','minimal')` preventivamente) — `'minimal'` é Sprint W-3 e o critério "minimal conta como compliance" precisa de validação de produto quando a feature existir. Comentário `// TODO(W-3): incluir version='minimal' em completed quando Sprint W-3 existir (ADR-228 DEC-B1)` grepável no método.

### D-B5 — Campos auxiliares de RF-01 (DEC-B2/B3)
Shape final inclui (todos baratos, do mesmo scan):
- `abortedCount` — `version='aborted'` no período (sinal de "começa e larga").
- `decisionNotToPlayCount` — `version='full' AND decisionToPlay=false` (subconjunto de `completed`, **não somar fora**; processo positivo A4/C8).
- `overrideUsedCount` (**incluído no shape — DEC-B2**) — `version='full' AND overrideUsed=true` (jogou com check emocional < 6 — sinal de risco). Incluído por ser barato e contrato-estável; o widget exibe discretamente OU omite na v1 (decisão de UI do implementer, sem afetar a API).
- `fullCount` **DROPADO (DEC-B3)** — redundante com `completed`; manter só `completed`, alinhado ao cooldown.

### D-B6 — Distribuição A/B/C-game (RF-02)
**Fonte:** `cooldown_logs` com `completedAt IS NOT NULL AND startedAt >= cutoff` (mesmo recorte de `getTopLessons`), lendo `abGameAnswers`.

**Parse defensivo obrigatório (R2, lesson #9/#11):** cada `abGameAnswers` pode ser `null`/parcial/legado. Helper interno trata `aGame`/`bGame` ausentes como `[]`, `cGame`/`lesson` ausentes como `""`. Itens de array contam só se `typeof === 'string' && .trim()` (ignora `""`/`"   "`). Linha malformada → ignorada sem crash (não fabricar dado — lesson #11).

- `journaledSessions` = nº de linhas com **ao menos um** campo não-vazio (A, B, C ou lesson).
- `aGameItemCount` / `bGameItemCount` = soma de itens não-vazios nos arrays.
- `cGameEntryCount` = nº de linhas com `cGame` string não-vazia (C-game é texto livre único → contagem de entradas, não de itens).
- `avgAGamePerSession` / `avgBGamePerSession` = `journaledSessions>0 ? itemCount/journaledSessions : 0` (sem NaN/Infinity). **Cru no storage, formatação no widget (DEC-B4)** — consistente com o resto da aba.
- `abShare` = `{ aGamePct, bGamePct }`. Quando `a+b > 0`: `aGamePct = a/(a+b)`, `bGamePct = b/(a+b)` (somam 1). Quando `a+b = 0`: `{0,0}`. **C-game fora do share (decisão travada — Opção 3).**
- `cGameThemes` = `tokenizeLessons([...cGames, ...lessons])` — combina C-game + lição (C-game é o ponto de atenção C2). Top-30 (reusa `TOP_N`). **NUNCA copiar `cGame`/`lesson` cru para a resposta** — só a forma tokenizada (R5/lesson de privacidade, espelha cool-down word cloud + EST-2 RF-08). `await import("./services/lessonTokenizer")` (lazy, igual `getTopLessons`).
- Período sem dados → shape "vazio" coerente (todos `0`/`[]`), **200 não 404**.

### D-B7 — Guard test de colisão (DEC-B8)
Risco **baixo**: ambas as rotas são paths estáticos completos sob `/api/analytics/` (sem `:param` que shadowe — diferente de EST-3/EST-6 onde havia `/:id`). Decisão: **1 smoke test de registro** (cada rota responde 200 com auth + 401 sem) basta; **sem** guard de shadowing complexo. **Resolve DEC-B8.**

### D-B8 — Vínculo futuro com Metas (RF-04, sinalização apenas)
**Fase B NÃO pluga no motor de aderência (ADR-227)** — `warmup_compliance` está no union `SourceMetric` mas SEM entrada em `SOURCE_METRIC_MAP` (DEC-MA8 deferido). Esta fase **só expõe** a métrica/rota/UI. Cabeçalho dos arquivos novos/editados cita `sprint-fase-b-lead-measures-2026-06-01.md` + `metas-tool-2026-06-01.md` (sourceMetric futuro: `warmup_compliance` ← `WarmupComplianceMetrics.complianceRate`; `a_game_pct` ← `AbGameDistribution.abShare.aGamePct`). **Nenhum import de `getPlannedVsActual`/ADR-227 neste sprint.**

## Shapes TS finais

```ts
// server/storage.ts — RF-01 (espelha getCooldownComplianceMetrics, +5 campos auxiliares)
export interface WarmupComplianceMetrics {
  total: number;                  // grind_sessions status='completed' AND date>=cutoff
  completed: number;              // warmup_rituals completedAt!=null AND version='full' AND startedAt>=cutoff
  complianceRate: number;         // total>0 ? Math.min(1, completed/total) : 0
  abortedCount: number;           // warmup_rituals version='aborted' no período
  decisionNotToPlayCount: number; // SUBCONJUNTO de completed: version='full' AND decisionToPlay=false
  overrideUsedCount: number;      // version='full' AND overrideUsed=true (sinal de risco; widget exibe discreto/omite)
}
async getWarmupComplianceMetrics(
  userId: string,
  period: "7d" | "30d" | "90d",
): Promise<WarmupComplianceMetrics>;

// server/storage.ts — RF-02
export interface AbGameDistribution {
  journaledSessions: number;      // cooldown_logs (completedAt!=null, startedAt>=cutoff) com >=1 campo de abGameAnswers preenchido
  aGameItemCount: number;         // soma de itens não-vazios em aGame
  bGameItemCount: number;         // soma de itens não-vazios em bGame
  cGameEntryCount: number;        // linhas com cGame string não-vazia
  avgAGamePerSession: number;     // 0 se journaledSessions=0 (cru, sem arredondar)
  avgBGamePerSession: number;     // 0 se journaledSessions=0
  abShare: { aGamePct: number; bGamePct: number }; // soma 1 quando a+b>0; {0,0} senão
  cGameThemes: Array<{ token: string; count: number }>; // tokenizeLessons([...cGames, ...lessons]), top-30, PII-safe
}
async getAbGameDistribution(
  userId: string,
  period: "7d" | "30d" | "90d",
): Promise<AbGameDistribution>;
```

Tipos exportados de `server/storage.ts` (D-B3). Widget redeclara interfaces espelho locais em `MentalAnalyticsTab.tsx`.

## Endpoints

| Método | Rota | Handler | Módulo | Auth | Cache |
|---|---|---|---|---|---|
| GET | `/api/analytics/warmup-compliance?period=` | `handleWarmupCompliance` | `cooldownAnalytics.ts` | requireAuth | `private, max-age=300` |
| GET | `/api/analytics/abgame-distribution?period=` | `handleAbGameDistribution` | `cooldownAnalytics.ts` | requireAuth | `private, max-age=300` |

`period` ausente/vazio → `30d`; inválido → `400 {message}`; sem token → `401`; erro storage → `500 {message}` + `console.error`. Registro após `top-lessons` em `registerCooldownAnalyticsRoutes`.

## Consequências

**Positivas:**
- Dois lead measures 4DX deixam de ser dado parado — prova-de-conceito barata do 4DX.
- Shapes estáveis prontos para a Metas (`sourceMetric`) sem refatoração futura.
- Zero migration, zero novo fluxo de captura, zero risco em produção (leitura pura sobre tabelas indexadas).
- Consistência total com o padrão de analytics da aba Mental (DRY de helpers, mesmo cache, mesma família de `data-testid`).

**Negativas / trade-offs:**
- `complianceRate` warm-up pode "parecer >100% antes do clamp" (R1) — mitigado por `Math.min(1,...)` + microcopy; trade-off já aceito no cooldown.
- Nome do arquivo `cooldownAnalytics.ts` fica levemente impreciso (agrega warm-up também) — mitigado por cabeçalho atualizado.
- Baixa adoção do journal A/B/C (R3) deixa o widget A/B quase sempre vazio — empty-state forte; boost de adoção é Fase E (#9), fora de escopo.

**Neutras:**
- `'minimal'` warm-up (Sprint W-3) precisará revisitar D-B4 (TODO grepável deixado).
- `overrideUsedCount` no shape mas exibição discreta/omitida na UI v1 — decisão de UI sem impacto de contrato.

## Confiança
**Alta** — espelhamento byte-a-byte de dois padrões já em produção (`getCooldownComplianceMetrics` + `getTopLessons`), duas decisões de produto travadas, zero migration confirmada, superfície de UI já estabelecida.

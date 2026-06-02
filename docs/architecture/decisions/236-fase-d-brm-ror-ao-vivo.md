# ADR-236: Painel BRM/RoR ao vivo (banca real → varianceEngine)

## Status
Aceito

## Data
2026-06-02

## Contexto

A matemática de Risk of Ruin (RoR) + desvio padrão (SD) já existe e está
calibrada em `server/services/varianceEngine.ts` (`runMonteCarloSimulation`,
ADR-211 motor nativo + ADR-215 D2 RoR via Monte Carlo empírico). Hoje ela só
roda no **simulador** (`/api/variance/simulate`, `/api/primedope/*`), onde o
jogador insere números **hipotéticos** (grade planejada, ROI estimado, banca
digitada). O jogador nunca vê o RoR da **situação real dele**.

Fase D #8 (board ICE 7.3, âncora curso "Antes das Cartas" F2 — BRM/risco de
ruína) fecha esse gap: alimenta o motor já existente com a **banca real**
(`storage.getCurrentBankroll`) e o **perfil de jogo real** (tiers do histórico
all-time via `storage.getHistoricalStatsByUser`), e expõe um painel BRM ao vivo
no `/bankroll`. É a ponte entre "simulador de cenários" e "diagnóstico da minha
banca hoje". Segundo pilar de risco da Fase D (stop-loss #5 protege a sessão;
BRM/RoR protege a banca de longo prazo).

Feature 100% read-only: zero escrita em DB, zero migration. Reusa motor + cache
existentes. A spec aprovada
(`Docs/specs/sprint-fase-d-brm-ror-2026-06-02.md`) travou D1–D10 e deferiu
DEF-1..DEF-4. Este ADR resolve as decisões arquiteturais de implementação
(D-1..D-7) deixadas em aberto para o Architect.

### Forças em jogo
- **Reuso vs duplicação:** o motor (varianceEngine), o cache (ADR-162 em
  `routes/variance.ts`), o storage de banca (ADR-109) e o de histórico já
  existem. Reusar reduz superfície e mantém uma única fonte da verdade da
  matemática (ADR-215 não pode ser refeita).
- **Honestidade estatística (lesson #11):** RoR de amostra pequena é ruidoso.
  O painel NUNCA pode fabricar um número que pareça preciso sobre 3 torneios.
- **Isolamento de sessão:** sessão paralela mexe no domínio Coach AI. Esta
  feature não pode tocar nenhum arquivo de Coach.
- **Semântica de `count` no horizonte `weeks`:** o engine distribui `count`
  ao longo de `weeks` (`Math.floor(count/weeks)` + resto). Errar isso distorce
  o RoR. Precisa travar como o engine consome `count`.

## Decisões

### D-1 — Orquestração em serviço dedicado read-only

**Escolha:** novo `server/services/bankrollHealth.ts` com a função orquestradora
`buildBankrollHealth(userId)`. NÃO inline no route handler.

**Justificativa:** paridade com `varianceEngine.ts` / `walletService.ts` (lógica
de negócio em service, route só faz auth + cache + serialização). Permite testar
a orquestração isoladamente (lesson #3 — mock do storage com shape real) sem
montar Express. O serviço busca banca + tiers, monta groups, chama o engine,
classifica e retorna um payload estável.

**Contrato:**
```ts
// server/services/bankrollHealth.ts
export interface BankrollHealthResult {
  bankrollUsd: number;          // getCurrentBankroll().totalUsd (0 se sem banca)
  roiMean: number | null;       // engine roi.mean (decimal); null se engine não rodou
  stdDev: number | null;        // engine stdDev (USD); null se engine não rodou
  riskOfRuinPct: number | null; // engine riskOfRuin.pct [0,100]; null se não rodou
  classification: RorClassification | null; // healthy|warning|risky; null se ror null
  dataSufficiency: DataSufficiency;          // ok|low|none|no_bankroll
  sampleSize: number;           // soma de count de TODOS os tiers (até descartados)
  bisOfMargin: number | null;   // totalUsd / weightedAvgBuyIn dos groups válidos; null s/ groups
  groupsUsed: number;           // nº de groups válidos enviados ao engine
}

export async function buildBankrollHealth(
  userId: string,
  deps?: {                       // injeção p/ teste (lesson #3/#34)
    getCurrentBankroll?: (uid: string) => Promise<any>;
    getHistoricalStatsByUser?: (input: { userId: string }) => Promise<any>;
    runSimulation?: typeof runMonteCarloSimulation;
  },
): Promise<BankrollHealthResult>;
```
Em produção, `deps` ausente → usa `storage.getCurrentBankroll` /
`storage.getHistoricalStatsByUser` (lazy import p/ evitar dep circular, padrão
do storage) + `runMonteCarloSimulation`.

### D-2 — `count` all-time como volume direto no horizonte `weeks=52`

**Escolha:** passar `groups[].count = tier.count` (total all-time) **direto**,
SEM escalar por semana. `weeks = 52` constante (D4 da spec).

**Justificativa (lida no engine, linhas 313–316 de `varianceEngine.ts`):** o MC
distribui o `count` de cada group ao longo das `weeks`:
`base = Math.floor(p.count / weeks)` + resto nas primeiras semanas. Ou seja,
`count` é o **volume total projetado sobre todo o horizonte**, não um valor
semanal nem um multiplicando. Com `count=300` e `weeks=52`, o engine simula 300
torneios espalhados em 52 semanas — exatamente "se eu jogar o que joguei
all-time, distribuído ao longo de 1 ano". Essa é a semântica de BRM desejada:
RoR de longo prazo do meu volume histórico contra minha banca atual.

**Diferença do `/buckets-aggregate` (lido em `routes/variance.ts` linhas
222–253):** aquele handler parte da **grade planejada**
(`listPlannedTournamentsByProfile`) e calcula
`count = round((groupCount/7) * daysInProfile * weeks)` — projeção da grade
futura. #8 NÃO usa esse caminho: parte SÓ do histórico real
(`getHistoricalStatsByUser`, all-time), com `count` cru. Fontes diferentes,
semânticas diferentes. O molde reusado de `/buckets-aggregate` é apenas o
mapeamento tier+type → `name`/`isPKO`, não o cálculo de volume.

**Consequência:** RoR reflete "minha tendência histórica de volume ao longo de
1 ano". Não normaliza para "volume anual típico" (DEF-2 / weeks configurável
fica para fatia futura). Documentado e travado.

### D-3 — Classificação RoR: helper PURO + thresholds nomeados

**Escolha:** helper puro `classifyRiskOfRuin(pct)` em `bankrollHealth.ts` (ou
módulo irmão), com constantes nomeadas. Testável isolado, sem I/O.

**Contrato + thresholds (D6 da spec, travados):**
```ts
export const ROR_THRESHOLD_HEALTHY = 5;   // < 5%  = saudável
export const ROR_THRESHOLD_WARNING = 15;  // 5–15% = atenção; > 15% = arriscado
export type RorClassification = "healthy" | "warning" | "risky";

export function classifyRiskOfRuin(
  pct: number | null,
): { classification: RorClassification; label: string; suggestion: string } | null {
  if (pct == null) return null;
  if (pct < ROR_THRESHOLD_HEALTHY)
    return { classification: "healthy", label: "Saudável",
             suggestion: "Sua banca suporta bem seu volume atual." };
  if (pct <= ROR_THRESHOLD_WARNING)
    return { classification: "warning", label: "Atenção",
             suggestion: "Considere subir a banca ou reduzir o ABI." };
  return { classification: "risky", label: "Arriscado",
           suggestion: "Risco de ruína alto — reduza buy-ins ou reforce a banca antes de continuar." };
}
```
**Boundaries travados:** `pct === 5` → warning; `pct === 15` → warning;
`pct === 15.01` → risky; `pct === null` → null (não chama). Thresholds 5/15
travados nesta fatia (sem doc de research com outros cortes).

### D-4 — `dataSufficiency`: helper puro decide ok/low/none/no_bankroll

**Escolha:** helper puro `resolveDataSufficiency(sampleSize, bankrollUsd)` que
decide o estado ANTES de chamar o engine. O engine só roda quando o estado NÃO
for `none`/`no_bankroll`.

**Contrato + regras (RF-02, travadas):**
```ts
export const SAMPLE_THRESHOLD_OK = 200;   // >= 200 torneios = amostra confiável
export type DataSufficiency = "ok" | "low" | "none" | "no_bankroll";

export function resolveDataSufficiency(
  sampleSize: number,
  bankrollUsd: number,
): DataSufficiency {
  if (bankrollUsd == null || bankrollUsd <= 0) return "no_bankroll"; // precede tudo
  if (sampleSize <= 0) return "none";
  if (sampleSize < SAMPLE_THRESHOLD_OK) return "low";  // 1..199 → mostra com aviso
  return "ok";                                          // >= 200
}
```
- `no_bankroll` **precede** a checagem de amostra (banca null/<=0 é caso à parte,
  RF-03): mesmo sem histórico, se não há banca, o estado é `no_bankroll`.
- O engine só é chamado quando `dataSufficiency ∈ {ok, low}` (há banca > 0 E
  >= 1 group válido). Em `none`/`no_bankroll`, `riskOfRuinPct = null`,
  `classification = null`, engine NÃO roda (lesson #11 — não fabricar precisão).
- `sampleSize` = soma de `count` de **TODOS** os tiers retornados (até os
  descartados dos groups), para honestidade da amostra (RF-01).
- Threshold 200 travado (default; ajustável se surgir doc de research).

### D-5 — Endpoint `GET /api/variance/bankroll-health` no `varianceRouter`

**Escolha:** montar como `GET /bankroll-health` no `varianceRouter`
(`server/routes/variance.ts`), que já está montado em `/api/variance`
(`server/routes/index.ts` linha 296). Rota final: `/api/variance/bankroll-health`.
NÃO criar novo módulo de rotas nem montar em `/api/bankroll`.

**Justificativa:** o `varianceRouter` já contém o cache `app.locals._varianceCache`
+ generation counter + `invalidateHistoricalStatsCache` (D-6). Adicionar a rota
aqui reusa toda a infra de cache sem duplicar. `/api/bankroll/health` exigiria
um novo cache e um novo módulo — atrito desnecessário. (A alternativa
`/api/bankroll/*` foi considerada por afinidade de domínio com a UI, mas perde
o reuso de cache/invalidação que é o ponto central da feature.)

**Handler (padrão de `historical-stats`):**
- `requireAuth`; `userId = req.user.userPlatformId`; sem userId → **401**.
- Cache lookup `brm:${userId}` (D-6) antes de orquestrar.
- Cache miss → `await buildBankrollHealth(userId)` → grava no cache → 200.
- Banca null/<=0 → `buildBankrollHealth` retorna `dataSufficiency:'no_bankroll'`,
  `bankrollUsd:0`, `riskOfRuinPct:null` → **200** (não 500), card faz empty-state.
- **Erro no engine/storage → log ANTES (lesson #9) + 200 com payload degradado**
  `{ dataSufficiency:'none', riskOfRuinPct:null, classification:null }`. Preferir
  200-degradado a 500, para o card renderizar gracioso (o card sabe esconder).
  `getHistoricalStatsByUser` já tem fallback interno `{tiers:[]}`; um throw real
  no engine cai no degradado.

### D-6 — Cache: reusa o util de `variance.ts` (ADR-162), key `brm:${userId}`

**Escolha:** reusar EXATAMENTE o mecanismo de `routes/variance.ts`:
`getCacheMap(req)` (`app.locals._varianceCache`) + `getGeneration(userId)` +
`CACHE_TTL_MS = 1h`. Chave dedicada `brm:${userId}` (distinta de `hist:${userId}`).
NÃO criar cache novo.

**Invalidação (confirmada no código):** o generation counter é **por-userId**
(`invalidationGeneration: Map<userId, number>`), então qualquer
`invalidateHistoricalStatsCache(userId)` busta **todas** as keys daquele user —
incluindo `brm:`. O upload handler já chama
`invalidateHistoricalStatsCache(userId)` (`routes/upload.ts` linhas 530 e 1662),
logo o `brm:` invalida no mesmo gatilho do histórico, sem código novo. O cache é
validado por `cached.expiresAt > now && cached.generation === gen` (mesmo padrão
do `historical-stats`).

**Consequência:** cache-hit não roda o engine (verificável via spy — critério de
aceitação). TTL 1h limita custo do MC (10k sims, CPU-bound) a 1×/hora/user.

### D-7 — UI `BankrollHealthCard` no `/bankroll`, `useQuery` isolado

**Escolha:** novo `client/src/components/bankroll/BankrollHealthCard.tsx`,
montado em `client/src/pages/Bankroll.tsx` logo após `<BankrollWidget />`
(linha ~162), dentro do container `space-y-6`, gated por `hasActiveWallets`
(o estado `no_bankroll` também é tratado internamente pelo card como
empty-state). NÃO tocar `VarianceCard` (`client/src/components/home/` — conceito
diferente: luck-tracking, não RoR). NÃO criar dashboard/página nova.

**Regras (RF-05):**
- `useQuery` queryKey `["/api/variance/bankroll-health"]`, `queryFn` via
  `apiRequest("GET", ...)` (já retorna JSON parseado — lesson #13). Isolar via
  ErrorBoundary local OU garantir QueryClientProvider em testes standalone
  (lesson #29).
- Renderiza 5 números: banca (USD), ROI histórico (%), SD (stdDev USD),
  RoR (%), BIs de margem. Badge de classification com cores de `@/lib/ui-tokens`
  (healthy=verde/`success`, warning=âmbar/`warning`, risky=vermelho/`danger`).
- `dataSufficiency='none'` → empty-state "Sem histórico suficiente. Importe seus
  torneios." + CTA `/upload`.
- `dataSufficiency='no_bankroll'` → empty-state "Adicione sua banca para ver o
  risco de ruína." (CTA permanece na própria `/bankroll`).
- `dataSufficiency='low'` → card completo + badge/texto "Amostra pequena —
  estimativa imprecisa". NÃO esconde o número (esconde só em `none`).
- `dataSufficiency='ok'` → card completo, sem aviso.
- RoR clampado 0–100 na exibição (engine já devolve pct empírico em [0,100]).
- `data-testid` estáveis (lesson #2): `bankroll-health-card`,
  `bankroll-health-empty`, `bankroll-health-low-sample`, `bankroll-health-ror`,
  `bankroll-health-classification`.
- Loading → skeleton; error → card escondido / mensagem leve.

## Opções Consideradas

### Orquestração (D-1)
- **Serviço dedicado** (escolhido) — paridade, testável, isolado.
  - Prós: lógica fora do route; mock por injeção; reuso futuro (ex.: tool de
    coach poderia chamar o mesmo service — fora de escopo agora).
  - Contras: +1 arquivo.
- **Inline no route handler** — menos arquivos.
  - Prós: tudo num lugar.
  - Contras: difícil testar a orquestração sem Express; mistura I/O + cálculo;
    quebra o padrão service-layer do projeto.

### Endpoint (D-5)
- **`/api/variance/bankroll-health` no varianceRouter** (escolhido).
  - Prós: reusa cache + invalidação existentes (zero infra nova); coerente com
    a família de endpoints variance.
  - Contras: a rota não fica sob `/api/bankroll` (afinidade de domínio com a UI).
- **`/api/bankroll/health` em novo módulo.**
  - Prós: rota alinhada à UI/domínio banca.
  - Contras: exige novo cache + novo gatilho de invalidação (duplicaria a infra
    de ADR-162). O ganho semântico não paga o custo de duplicação.

## Consequências

**Positivas:**
- Transforma o número hipotético do simulador em diagnóstico real e contínuo.
- Reuso total da matemática calibrada (ADR-215) — uma fonte da verdade.
- Cache + invalidação grátis (reuso ADR-162); upload já busta `brm:`.
- Read-only, sem migration, sem custo de LLM, sem tier gate (paridade simulador).
- Helpers puros (`classifyRiskOfRuin`, `resolveDataSufficiency`) testáveis em
  isolamento; orquestração testável por injeção de deps.

**Negativas / limitações conhecidas:**
- **DEF-1 (FX):** `getHistoricalStatsByUser` é USD-only (`currency='USD'` no
  WHERE) — torneios não-USD são **excluídos** da amostra, não convertidos. Um
  jogador 100% BRL vê `tiers=[]` → empty-state `none`. Documentado; conversão
  FX do histórico fica para fatia futura.
- **DEF-2 (weeks):** horizonte fixo em 52 (não exposto como toggle).
- **DEF-3 (coach):** disparo de nudge quando RoR > 15% pertence ao domínio Coach
  AI (fronteira proibida nesta sessão) — deferido.
- **DEF-4 (reserva):** usa `totalUsd` consolidado; não distingue banca-de-jogo
  vs reserva.
- RoR reflete tendência de volume **all-time** projetada em 1 ano (D-2); não
  normaliza para "volume anual típico".

**Neutras:**
- O engine retorna `riskOfRuin` apenas quando `bankrollUsd > 0` (linha 445–453);
  RF-03 evita chamar com banca <=0, mas mesmo se chamasse viria `undefined` —
  o serviço trata ambos (null-safe).

## Referências
- ADR-211 — varianceEngine nativo (Monte Carlo).
- ADR-215 — calibração matemática (D2 RoR via MC empírico, SD output).
- ADR-162 — cache de historical-stats (`app.locals._varianceCache` + generation).
- ADR-109 — `getCurrentBankroll` (FX cascata consolidada em USD).
- ADR-235 — Fase D stop-loss (irmão de risco).
- Spec: `Docs/specs/sprint-fase-d-brm-ror-2026-06-02.md`.
- Lessons: #3 (mock shape real), #6 (FX→USD), #9 (log antes do fallback),
  #11 (honestidade estatística / dataSufficiency), #13 (apiRequest JSON),
  #29 (useQuery isolado), #34 (injeção de deps testável).

## Follow-ups (/simplify 2026-06-02 — DRY/quality, não-bloqueantes, código funcionalmente sólido)
- **Group-builder duplicado:** `buildBankrollHealth` monta `groups[]` dos tiers com mapeamento ~igual ao `/buckets-aggregate` (`variance.ts`). Extrair `buildGroupsFromTiers(tiers)` compartilhado (toca `variance.ts` existente + testes → diferido pra não arriscar a suíte verde + a corrida de merge).
- **Suggestion drift:** `classifyRiskOfRuin` (service) e `suggestionFor` (card) repetem os 3 textos de sugestão. Fonte única: incluir `suggestion` na resposta da API + dropar o do card. Diferido (muda shape da resposta + card).
- **Formatação local:** `BankrollHealthCard` tem `fmtUsd`/`fmtPct` locais vs `client/src/lib/format.ts`. Consolidar. Diferido (baixo valor).
- **I/O sequencial:** `getCurrentBankroll` então `getHistoricalStatsByUser` (sequencial). Paralelizar com Promise.all economizaria ~1 round-trip no cache-miss, MAS quebraria o early-return "no_bankroll pula history" (e o teste que o assere). Mantido sequencial (correto + testado).
- Modelagem `count` all-time × `weeks=52` (D-2): honesta dentro da premissa ("se mantiver seu volume"); o RoR vai derivar conforme o histórico cresce — documentado, sem janela configurável (DEF-2).

## Confiança
Alta — todos os pontos de integração foram lidos no código do worktree
(`varianceEngine.ts` semântica de count/weeks, `variance.ts` cache,
`upload.ts` invalidação, shapes reais de `getCurrentBankroll` /
`getHistoricalStatsByUser`, mount em `routes/index.ts`, render em `Bankroll.tsx`).

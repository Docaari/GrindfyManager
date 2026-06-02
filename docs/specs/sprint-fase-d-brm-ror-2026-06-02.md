# Spec: Fase D #8 — Painel BRM/RoR ao vivo (banca real → varianceEngine)

## Status
Proposta

## Resumo
Painel read-only que pluga a **banca real** do jogador + o **ROI/desvio reais derivados do histórico** no `varianceEngine` (Monte Carlo já existente) para mostrar um diagnóstico ao vivo da saúde da banca: "com sua banca atual ($X), seu ROI histórico (Y%), jogando seu ABI ($W) — seu risco de ruína é R%". Transforma o número hipotético do simulador em um diagnóstico real e contínuo.

## Contexto
Âncora: curso "Antes das Cartas" F2 (BRM / risco de ruína) + D9. Board ICE 7.3.

O GAP: a matemática de Risk of Ruin (RoR) + desvio padrão (SD) **já existe e está calibrada** (`server/services/varianceEngine.ts`, ADR-211/215, RoR via Monte Carlo empírico ADR-215 D2). Mas hoje ela só roda no **simulador** (`/api/variance/simulate` + `/api/primedope/*`), onde o jogador insere números **hipotéticos** (grade planejada, ROI estimado, banca digitada). O jogador nunca vê o RoR da **situação real dele**.

#8 fecha esse gap: alimenta o motor com a banca real (`getCurrentBankroll`) e o perfil de jogo real (tiers do histórico via `getHistoricalStatsByUser`), e expõe um painel BRM ao vivo. É a ponte entre "simulador de cenários" e "diagnóstico da minha banca hoje".

**Prioridade:** parte de Fase D (gestão de risco), depois de #5 stop-loss (done). É o segundo pilar de risco: stop-loss protege a sessão; BRM/RoR protege a banca de longo prazo.

## Usuários
- **Jogador MTT (todos os tiers):** abre o painel e vê o RoR da banca real + classificação (saudável/atenção/arriscado) + sugestão. Não impõe nada — é diagnóstico consultivo.

## Decisões Travadas (resolvidas nesta spec)

| # | Decisão | Escolha travada |
|---|---------|-----------------|
| D1 | Fonte dos inputs do engine | Banca = `getCurrentBankroll().totalUsd`. Groups (buyIn/field/roi/count/isPKO) = derivados de `getHistoricalStatsByUser` (tiers do histórico, mesma lógica do `/buckets-aggregate`). Ver mapeamento abaixo. |
| D2 | De onde vem o SD | **NÃO derivamos SD do histórico.** O `varianceEngine` produz `stdDev` + `riskOfRuin.pct` internamente via Monte Carlo a partir dos groups. SD é **output**, não input. Lesson: não fabricar SD ruidoso de amostra pequena. |
| D3 | Janela do histórico | **All-time** (sem filtro de período). `getHistoricalStatsByUser` já é all-time, USD-only, dedup, `grind_session_id IS NULL`. Maior amostra = RoR mais estável. |
| D4 | weeks (horizonte do MC) | **52** (1 ano). RoR de longo prazo é o conceito de BRM. Fixo nesta fatia (não exposto como input). |
| D5 | Apresentação / onde | **Card no `/bankroll`** (página de banca — contexto natural). NÃO criar dashboard novo. NÃO mexer no `VarianceCard` do Home (é outro conceito — luck-tracking). Componente novo `BankrollHealthCard`. |
| D6 | Classificação RoR → ação | RoR < 5% = **Saudável**; 5–15% = **Atenção**; > 15% = **Arriscado**. Sugere, não impõe. Ver RF-04. |
| D7 | Cache | Sim. Per-(userId) com TTL 1h, reusando o **padrão de `server/routes/variance.ts`** (`app.locals._varianceCache` + generation counter, ADR-162). Chave dedicada `brm:${userId}`. Invalida no mesmo gatilho do histórico (upload). |
| D8 | Migration | **NENHUMA.** Feature 100% read-only. |
| D9 | FX→USD (lesson #6) | `getCurrentBankroll` já consolida em USD (walletService FX cascata). `getHistoricalStatsByUser` é **USD-only** (`currency = 'USD'` no WHERE) — linhas não-USD são **excluídas** da amostra, não convertidas. Documentar como limitação conhecida (ver Notas + edge case). NÃO somar moeda crua. |
| D10 | Tier gate | **Sem tier gate** (paridade com simulador, que é acessível a todos). Read-only, sem custo de LLM. |

## Decisões Deferidas (marcar para o Architect / fatias futuras)
- **DEF-1 (FX no histórico):** converter linhas não-USD do histórico para USD antes de agregar (hoje são descartadas). Requer mudar `getHistoricalStatsByUser` (USD-only) — fora de escopo read-only desta fatia. Architect: confirmar se a perda de amostra não-USD é aceitável ou se precisa de helper paralelo.
- **DEF-2 (weeks configurável):** expor horizonte (1/4/12/52) como toggle no painel — fatia futura.
- **DEF-3 (RoR → coach / nudge):** disparar nudge quando RoR > 15%. Pertence ao domínio Coach AI (fronteira proibida nesta sessão). Deferido.
- **DEF-4 (banca incluir/excluir reserva):** hoje usa `totalUsd` consolidado. Distinguir "banca de jogo" vs reserva é fatia futura.

## Mapeamento Input Real → varianceEngine

`runMonteCarloSimulation(input)` espera `{ groups[], weeks, simulations?, seed?, bankrollUsd? }`. Mapeamento:

| Campo do engine | Fonte real | Regra |
|---|---|---|
| `bankrollUsd` | `getCurrentBankroll(userId).totalUsd` | USD consolidado. Se `null` ou `<= 0` → painel em empty-state (ver RF-03). |
| `groups[].name` | tier+type do histórico | Ex: `"High PKO"` (mesma label de `/buckets-aggregate`). |
| `groups[].buyIn` | `tier.avgBuyIn` | USD (histórico já USD-only). |
| `groups[].field` | `tier.avgField` | Tamanho médio de field do tier. |
| `groups[].roi` | `tier.roiAdjusted` | Decimal (0.15 = 15%). ROI ajustado já calculado no SQL. |
| `groups[].count` | `tier.count` (all-time) | Total de torneios do tier no histórico. **Não escalar por semana** — usar o count real all-time como volume projetado no horizonte. (Architect: confirmar se count all-time direto é o volume desejado para `weeks=52`, ou se deve normalizar para "volume anual típico". Ver RF-01 regra de negócio + edge case.) |
| `groups[].isPKO` | `tier.type === 'PKO'` | Boolean. |
| `weeks` | constante `52` | D4. |
| `simulations` | default (10000) | Não override. |
| `seed` | omitido | RoR real usa aleatoriedade (não precisa reproducibilidade no painel). |

**Output consumido do engine:** `riskOfRuin.pct`, `stdDev`, `roi.mean`, `totalInvested`. (RoR só vem preenchido quando `bankrollUsd > 0` — garantido por RF-03.)

## Requisitos Funcionais

### RF-01: Serviço de cálculo BRM ao vivo (`buildBankrollHealth`)
**Descrição:** Função pura/serviço read-only (novo `server/services/bankrollHealth.ts`) que: (1) busca banca real + tiers do histórico, (2) monta os `groups[]` para o engine, (3) chama `runMonteCarloSimulation`, (4) classifica o RoR, (5) retorna um payload estável para o endpoint.

**Regras de negócio:**
- Banca = `getCurrentBankroll(userId).totalUsd`. Tiers = `getHistoricalStatsByUser({ userId }).tiers`.
- Monta groups com o mapeamento acima. Tiers com `count === 0` ou sem `avgBuyIn`/`avgField` válidos (NaN/null/<=0) são **descartados** do array de groups.
- Se nenhum group válido sobrar → `dataSufficiency = 'none'` e NÃO chama o engine (ver RF-02).
- `weeks = 52`. Chama `runMonteCarloSimulation` apenas quando há groups válidos E `bankrollUsd > 0`.
- Computa `totalTournamentsSample` = soma de `count` de todos os tiers (mesmo os descartados, para honestidade da amostra).
- Computa `bisOfMargin` (BIs de margem) = `totalUsd / weightedAvgBuyIn`, onde `weightedAvgBuyIn` = média de `avgBuyIn` ponderada por `count` dos groups válidos. Se sem groups → `null`.

**Critério de aceitação:**
- [ ] Com banca > 0 e ≥1 tier válido, retorna `{ rorPct: number, stdDev, roiMean, bankrollUsd, bisOfMargin, classification, dataSufficiency, totalTournamentsSample, groupsUsed }`.
- [ ] Tiers inválidos (count 0, avgBuyIn NaN) não entram em `groups`.
- [ ] `bankrollUsd` no payload == `getCurrentBankroll().totalUsd`.
- [ ] `weeks=52` é passado ao engine (verificável via spy no engine).

### RF-02: Honestidade estatística — `dataSufficiency` (lesson #11)
**Descrição:** RoR só é confiável com amostra suficiente. Painel degrada graciosamente quando a amostra é fraca, NUNCA fabrica um número que parece preciso.

**Regras de negócio:**
- `dataSufficiency` ∈ `{ 'ok', 'low', 'none' }`.
- `totalTournamentsSample >= 200` → `'ok'` (RoR mostrado normalmente).
- `1 <= totalTournamentsSample < 200` → `'low'` (RoR mostrado COM aviso "amostra pequena — estimativa imprecisa, colete mais torneios"). Threshold **200** travado (Architect pode ajustar se houver doc de research; default 200).
- `totalTournamentsSample === 0` (sem histórico USD) → `'none'` (NÃO chama engine; painel mostra empty-state com CTA para `/upload`).
- Banca `null`/`<=0` → trata como caso à parte (RF-03), independente de `dataSufficiency`.
- Quando `'low'`, o RoR ainda é calculado e exibido, mas a UI marca visualmente a baixa confiança (badge/texto). NÃO esconder o número em `'low'` — esconder só em `'none'`.

**Critério de aceitação:**
- [ ] `totalTournamentsSample = 0` → `dataSufficiency='none'`, engine NÃO é chamado, `rorPct = null`.
- [ ] `totalTournamentsSample = 50` → `dataSufficiency='low'`, `rorPct` presente, flag de baixa confiança true.
- [ ] `totalTournamentsSample = 500` → `dataSufficiency='ok'`.
- [ ] Em `'low'` o número de RoR vem preenchido (não null) mas a UI exibe aviso.

### RF-03: Endpoint `GET /api/bankroll/health` (ou `/api/variance/bankroll-health`)
**Descrição:** Endpoint read-only autenticado que retorna o payload do RF-01, com cache.
**Decisão de rota:** montar em `server/routes/variance.ts` como `GET /bankroll-health` (reusa o router de variance + o cache `app.locals._varianceCache` + `invalidateHistoricalStatsCache` já existentes). Rota final: `/api/variance/bankroll-health`. (Architect: confirmar montagem; alternativa `/api/bankroll/health` exigiria novo cache — preferir variance.ts pela reutilização.)

**Regras de negócio:**
- `requireAuth`. `userId` via `req.user.userPlatformId`. Sem userId → 401.
- Cache per-`brm:${userId}`, TTL 1h, generation counter (mesmo mecanismo de `historical-stats`). Hit de cache retorna payload sem rodar o engine.
- Banca `null`/`<=0` → 200 com `{ dataSufficiency: 'no_bankroll', rorPct: null, bankrollUsd: 0, classification: null }` (empty-state com CTA "adicione sua banca em /bankroll").
- Erro no engine ou storage → logar ANTES (lesson #9) + retornar 200 com payload degradado `{ dataSufficiency:'none', rorPct:null }` (NÃO 500 que quebraria o card; o card sabe esconder). Architect decide entre 200-degradado vs 500 — preferir 200-degradado para o card render gracioso.

**Critério de aceitação:**
- [ ] `GET /api/variance/bankroll-health` sem auth → 401.
- [ ] Com banca + histórico → 200 com payload completo do RF-01.
- [ ] Segunda chamada dentro de 1h → cache hit (engine NÃO roda de novo — verificável via spy).
- [ ] `invalidateHistoricalStatsCache(userId)` (já chamado pelo upload handler) busta também o `brm:` key.
- [ ] Banca zero → 200 com `dataSufficiency='no_bankroll'`, não 500.

### RF-04: Classificação RoR → ação (consultiva)
**Descrição:** Traduz `rorPct` em uma classificação simples + uma sugestão textual. Sugere, não impõe.
**Regras de negócio (D6):**
- `rorPct < 5` → `classification='healthy'`, label "Saudável", sugestão "Sua banca suporta bem seu volume atual."
- `5 <= rorPct <= 15` → `classification='warning'`, label "Atenção", sugestão "Considere subir a banca ou reduzir o ABI."
- `rorPct > 15` → `classification='risky'`, label "Arriscado", sugestão "Risco de ruína alto — reduza buy-ins ou reforce a banca antes de continuar."
- `rorPct === null` (none/no_bankroll) → `classification=null`.
- Thresholds 5/15 travados nesta fatia (Architect: se houver doc de research/curso com outros cortes, ajustar).

**Critério de aceitação:**
- [ ] rorPct 2 → healthy; 10 → warning; 25 → risky; null → null.
- [ ] Boundary: rorPct exatamente 5 → warning; exatamente 15 → warning; 15.01 → risky.
- [ ] Sugestão textual presente para cada classification não-null.

### RF-05: Painel UI `BankrollHealthCard` no `/bankroll`
**Descrição:** Card que consome o endpoint via `useQuery` e renderiza: banca atual (USD), ROI histórico (%), SD (stdDev USD), RoR (%), classificação (badge colorido), BIs de margem, e aviso de amostra quando `'low'`.
**Regras de negócio:**
- `useQuery` isolado (lesson #29 — se montado standalone em testes, encapsular em ErrorBoundary local OU garantir QueryClientProvider).
- `dataSufficiency='none'` → empty-state "Sem histórico suficiente. Importe seus torneios." + CTA `/upload`.
- `dataSufficiency='no_bankroll'` → empty-state "Adicione sua banca para ver o risco de ruína." + CTA permanece na própria `/bankroll`.
- `dataSufficiency='low'` → renderiza o card completo + badge/texto "Amostra pequena — estimativa imprecisa".
- `dataSufficiency='ok'` → card completo, sem aviso.
- Badge de classification: healthy=verde, warning=âmbar, risky=vermelho (reusar tokens de `@/lib/ui-tokens`).
- `data-testid` estáveis (lesson #2): `bankroll-health-card`, `bankroll-health-empty`, `bankroll-health-low-sample`, `bankroll-health-ror`, `bankroll-health-classification`.
- Loading state (skeleton) e error state (card escondido ou mensagem leve).

**Critério de aceitação:**
- [ ] `data-testid="bankroll-health-card"` presente com banca+histórico.
- [ ] Mostra os 5 números: banca, ROI, SD, RoR, BIs de margem.
- [ ] Badge de classification reflete a cor correta por estado.
- [ ] `'none'` → empty-state com CTA upload; `'no_bankroll'` → empty-state banca.
- [ ] `'low'` → card + aviso de amostra visível.
- [ ] Card montado em `/bankroll` (página existente), não em dashboard novo.

## Requisitos Não-Funcionais
- **Performance:** Monte Carlo (10k sims) é CPU-bound (~dezenas de ms a centenas). Cache 1h per-user evita recálculo a cada render. Endpoint deve responder cache-hit em < 50ms; cache-miss limitado pelo engine (aceitável até ~500ms).
- **Honestidade:** NUNCA exibir RoR sem amostra (`'none'`). Em `'low'`, sempre acompanhar de aviso. (Lesson #11.)
- **FX:** toda agregação de banca/histórico em USD; nunca somar moeda crua (lesson #6). Histórico não-USD é excluído (D9/DEF-1).
- **Isolamento de sessão:** NÃO tocar nenhum arquivo do domínio Coach AI (lista de fronteira). Domínio permitido: `varianceEngine.ts`, `routes/variance.ts`, `services/bankrollHealth.ts` (novo), `pages/Bankroll.tsx`, `components/bankroll/*` (novo card).
- **Read-only:** zero escrita em DB, zero migration.

## Endpoints Previstos
| Método | Rota | Descrição | Auth |
|---|---|---|---|
| GET | /api/variance/bankroll-health | RoR/BRM ao vivo da banca real + classificação | JWT |

## Modelos de Dados Afetados
**NENHUM.** Feature read-only. Consome (leitura): `wallets`/`bankroll_snapshots` (via `getCurrentBankroll`), `tournaments` WHERE `grind_session_id IS NULL` (via `getHistoricalStatsByUser`). Sem migration.

## Integrações Externas
| Serviço | Propósito | Quando |
|---|---|---|
| (nenhuma nova) | — | — |

Internas (já existentes): `varianceEngine.runMonteCarloSimulation`, `storage.getCurrentBankroll`, `storage.getHistoricalStatsByUser`, `walletService` (FX cascata, via getCurrentBankroll), `fxResolver` (já dentro do storage).

## Cenários de Teste Derivados

### Happy Path
- [ ] Banca $5000, histórico com 1 tier (count 300, avgBuyIn $20, avgField 500, roi 0.10, não-PKO) → engine roda, `rorPct` numérico, `dataSufficiency='ok'`, `classification` coerente, `bisOfMargin ≈ 250`.
- [ ] Múltiplos tiers válidos → todos entram em groups; `totalTournamentsSample` = soma dos counts.

### Validação de Input / Estados
- [ ] GET sem auth → 401.
- [ ] Cache: 1ª chamada roda engine; 2ª (< 1h) é cache hit (engine não chamado).
- [ ] `invalidateHistoricalStatsCache(userId)` força recálculo na próxima chamada.

### Regras de Negócio (classificação + dataSufficiency)
- [ ] `totalTournamentsSample = 0` → `'none'`, `rorPct=null`, engine NÃO chamado.
- [ ] `totalTournamentsSample = 50` → `'low'`, `rorPct` presente, flag baixa confiança.
- [ ] `totalTournamentsSample = 500` → `'ok'`.
- [ ] rorPct 2→healthy, 5→warning, 15→warning, 15.01→risky, 25→risky.
- [ ] Tier com count 0 ou avgBuyIn NaN → descartado dos groups.

### Edge Cases (lista para o test-writer)
- [ ] **Amostra pequena:** 1 tier com count 3 → `'low'`, número exibido com aviso (não esconde, não fabrica precisão falsa).
- [ ] **Banca zero/null:** `getCurrentBankroll` retorna `null` → `dataSufficiency='no_bankroll'`, `rorPct=null`, engine NÃO chamado (não passa `bankrollUsd<=0` ao engine, pois engine retorna `riskOfRuin=undefined` nesse caso — mas evitamos a chamada inútil).
- [ ] **Sem histórico:** `getHistoricalStatsByUser` retorna `{ tiers: [] }` → `'none'`, empty-state upload.
- [ ] **FX ausente / histórico não-USD:** linhas não-USD já são excluídas pelo SQL (`currency='USD'`); se TODO o histórico for não-USD → `tiers=[]` → `'none'`. Documentar: usuário com banca em BRL e torneios em BRL vê empty-state (limitação DEF-1).
- [ ] **RoR extremo:** banca muito baixa vs volume alto → `rorPct` pode chegar a ~100 → `classification='risky'`, número exibido sem crash (clamp visual 0–100 na UI; engine retorna pct empírico já em [0,100]).
- [ ] **RoR zero:** banca enorme → `rorPct ≈ 0` → `healthy`.
- [ ] **Engine throw:** `runMonteCarloSimulation` lança → log antes (lesson #9) + payload degradado `'none'`/rorPct null, sem 500 que quebre o card.
- [ ] **Storage throw:** `getCurrentBankroll`/`getHistoricalStatsByUser` lançam → log antes + degradado (getHistoricalStatsByUser já tem fallback interno `{tiers:[]}`).
- [ ] **Mock = shape real (lesson #3):** testes DEVEM mockar `getCurrentBankroll` retornando `{ totalUsd, walletsCount, bisAvailable, deltaPct7d, sparkline }` (shape REAL, não `{ bankroll: X }`) e `getHistoricalStatsByUser` retornando `{ tiers:[{tier,type,count,avg_buy_in,avg_field,roi_adjusted}], totals:{...} }` (note snake_case interno mapeado p/ camelCase — confirmar shape exato no storage antes de mockar).

## Fora de Escopo
- Refazer a matemática do `varianceEngine` (RoR/SD/percentis) — já calibrada (ADR-215). Apenas consumir.
- Refazer o simulador (`/api/variance/simulate`, `/api/primedope/*`, `usePrimedopeSimulation`).
- Stop-loss (#5, já done) e cooldown.
- Qualquer coisa de Coach AI (nudge de RoR, chat, relatório) — fronteira proibida nesta sessão (DEF-3).
- Conversão FX de histórico não-USD (DEF-1).
- Horizonte (weeks) configurável (DEF-2).
- Distinção banca-de-jogo vs reserva (DEF-4).
- Migration / qualquer escrita em DB.
- Mexer no `VarianceCard` do Home (conceito diferente: luck-tracking, não RoR).
- Dashboard novo / nova página.

## Dependências
- `server/services/varianceEngine.ts` (existe, ADR-211/215) — consumido.
- `storage.getCurrentBankroll` (existe, ADR-109) — banca USD.
- `storage.getHistoricalStatsByUser` (existe) — tiers do histórico USD-only.
- Padrão de cache `server/routes/variance.ts` (existe, ADR-162) — reuso.
- `@/lib/ui-tokens` — tokens de cor para badges.

## Notas de Implementação
- O engine **já** retorna `riskOfRuin` apenas quando `bankrollUsd > 0` (linha 446 do varianceEngine). RF-03 evita chamar quando banca <=0, mas mesmo se chamasse, `riskOfRuin` viria `undefined` — tratar ambos.
- Reusar a lógica de montagem de groups do `/buckets-aggregate` (tier+type → name, isPKO = type==='PKO', etc.) — mas a partir de `getHistoricalStatsByUser` direto (all-time), NÃO de `listPlannedTournamentsByProfile` (que é grade planejada). São fontes diferentes: buckets-aggregate usa grade planejada × histórico; #8 usa SÓ histórico real.
- `getHistoricalStatsByUser` retorna tiers com chaves **snake_case** internas (`avg_buy_in`, `avg_field`, `roi_adjusted`) mapeadas; confirmar o shape exato retornado (o `.map` no storage já normaliza para `avg_buy_in`/`avg_field`/`roi_adjusted` numéricos) — o serviço BRM consome essas chaves.
- Cache: seguir EXATAMENTE o padrão `getCacheMap(req)` + `getGeneration` + `invalidateHistoricalStatsCache` de `variance.ts`; adicionar key `brm:${userId}` (a generation já é por-userId, então o invalidate do upload busta tudo do user). Confirmar que o upload handler chama `invalidateHistoricalStatsCache`.
- ADR sugerido: 236 (próximo livre; último é 235).
- Verify browser é parte do "done": abrir `/bankroll`, confirmar card renderiza com banca real + RoR + classificação, e empty-states (logar com user sem histórico / sem banca).

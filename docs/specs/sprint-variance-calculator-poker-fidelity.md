# Spec / Plano — Variance Calculator: Fidelidade Poker + Import do Histórico CSV

**Status:** 📋 PLANEJAMENTO (não iniciar implementação)
**Bloqueado por:** agentes paralelos finalizando a página **Torneios** (`TournamentLibraryNew`) + pipeline de **Upload** (CSV → `tournaments`).
**Autor:** sessão `variance-calculator` 2026-05-29
**Surface:** Simulador de Variância MTT = aba `variance` em `GradePlanner` → `PrimedopePanel` → `AggregationWizard` + `server/services/varianceEngine.ts`.
**Referência competitiva:** PrimeDope Variance Calculator (primedope.com/variance) — objetivo: **superá-la** usando os números reais que o sistema de upload do Grindfy fornece.

> ⚠️ Este documento é só plano. Os agentes paralelos ainda mexem em Torneios + Upload. Quando terminarem, estudaremos as ferramentas juntas e priorizaremos as fases abaixo.

---

## 0. Contexto — o que já existe hoje (pós-fix 2026-05-29)

### 0.1 Fix de UX já aplicado nesta sessão (uncommitted em `main`)
Corrigido em `AggregationWizard.tsx` + wrapper `GradePlanner` + `PrimedopePanel`:
1. **Buy-in editável** (era display fixo).
2. **"Payload invalido" resolvido** — causa-raiz: backend (`server/routes/primedope.ts`) exige `field: z.number().int()` e `count: z.number().int().positive()`, mas o `buckets-aggregate` devolvia `field` como média **float** (ex. `523.7`) e `count` podia arredondar pra `0`. Fix: `sanitizeForSimulate()` arredonda `field`→int≥2, clampa `count`≥1, `buyIn`>0 no boundary do cliente antes do POST.
3. **Investimento diário removido** (não devia aparecer).
4. **Add/remover tipo de torneio** (botão "Adicionar tipo" + lixeira por linha + nome editável).
5. Tipografia maior + resumo formatado pt-BR.

### 0.2 O que a engine (`varianceEngine.ts`) já modela
- **Monte Carlo** 10k sims (clamp 1k–50k), PRNG seedável (splitmix32).
- **Payout sintético power-law** por faixa de field (`alpha` 2.0/1.7/1.5/1.3) + min-cash 1.5× buy-in.
- **Skill calibration** por busca binária (inverse-CDF: `pos = ceil(field * rand^skill)`) pra bater o ROI alvo.
- **Saídas ricas:** EV + CI95 (CLT), ROI mean/median, SD, % chance lucro, percentis R7 (P0.15→P99.85), drawdown (mean/median/p95/p99/worst), Risk of Ruin empírico (se bankroll informado), histograma Freedman-Diaconis, contribuição por grupo.
- **Já existe no input mas NÃO exposto na UI:** `placesPaidPct` (ITM% override, D6) e `rakePct` (D7).

### 0.3 Resultado/gráfico — confirmar que funciona
`PrimedopeResult.tsx` já renderiza: 4 KPI cards, tabela de CI (70/95/99.7%), `ScenarioCards` (pessimista/mediana/otimista), `DrawdownCard`, `VarianceHistogram` (gráfico), `EquityCurves`, `GroupContributions`. **Cobre o pedido** "melhores/piores/caso mais frequente" (mediana = pico do histograma). Pós-fix do payload, validar manualmente que renderiza ponta-a-ponta.

---

## 1. Feature A — Importar dados baseado no histórico CSV

### 1.1 Ideia (founder)
Botão **"Importar do histórico"** na calculadora. Usa os torneios que o usuário já upou (CSV via `/upload`), traz os **tipos de torneio separados por ROI**, o usuário escolhe o **período** e só os torneios desse período entram na simulação.

### 1.2 Seleção de período
- **Intervalo de datas:** "de X a Y".
- **Últimos N dias:** atalho (7/30/90/365).
- Só torneios com `date` dentro do período são agregados.

### 1.3 Reuso da engine de Torneios + "modo família"
- A página **Torneios** (`TournamentLibraryNew`) já tem **agrupamento 2-níveis** ("família" = grupo de torneio; "variações" = nomes/velocidades dentro da família) e calcula **ROI por grupo**.
- A calculadora deve **reusar essa mesma lógica de agrupamento** pra montar os buckets: cada família vira uma linha (`AggGroup`) com `buyIn` médio, `field` médio, `roi` (ajustado), `count` no período, flag PKO/Satellite.
- Hoje `buckets-aggregate` agrega de `planned_tournaments` (grade futura). A Feature A agrega do **histórico real** (`tournaments`, `grind_session_id IS NULL` — regra §6.1 do CLAUDE.md). Provável novo endpoint: `GET /api/variance/history-aggregate?from=&to=` (ou `lastDays=`) reusando `getHistoricalStatsByUser` + agrupamento família.

### 1.4 Fonte de dados (já existe parcialmente)
- `storage.getHistoricalStatsByUser` já computa **ROI ajustado** por tier/type via SQL (`roi_adjusted = SUM(prize)/NULLIF(SUM(buy_in)+SUM(downswing),0)`).
- Falta: **filtro de período** (hoje agrega tudo) + agrupamento por **família** (hoje por tier×type) + `field` médio real por grupo.

### 1.5 Dependência crítica (BLOQUEIO)
- A definição final de "família" e o shape dos dados de Torneios **ainda estão sendo ajustados** por agente paralelo. O motor `server/services/libraryGrouping.ts` (`groupTournaments()` → `GroupedFamily[]`, chave `site|buyInTier|type` + specifics aninhados) existe mas **NÃO está em main** (uncommitted). Não implementar Feature A até esse contrato landar em main.

### 1.6 Design detalhado VR-CALC-2 (PRONTO — implementar quando os contratos alinharem)

Plano concreto, decidido com founder 2026-05-29 ("só planejar agora"). Duas sessões em paralelo; esta calculadora entra **depois** que Torneios + Upload estabilizam.

**Decisão de agrupamento (resolve Q em aberto §4.1):** interim usa `getHistoricalStatsByUser` (tier×type, **já em main**, estável) pra destravar sem depender do paralelo; quando `libraryGrouping.groupTournaments` landar em main, **trocar a fonte** pro agrupamento por família (site|tier|type) — contrato `GroupedFamily[]` já mapeia 1:1 pra `AggGroup`.

**Decisão de UX (resolve Q §4.2):** import é **modo alternativo não-destrutivo** — toggle no topo do `AggregationWizard`: `[Grade planejada]` (atual, default) vs `[Meu histórico]`. Trocar pra "Meu histórico" troca a fonte dos buckets; edições inline (buy-in/rake/ITM/ROI) continuam por sessão.

**Backend — novo endpoint** `GET /api/variance/history-aggregate`:
- Query: `from?=YYYY-MM-DD` + `to?=YYYY-MM-DD` **OU** `lastDays?=7|30|90|365`. Sem período → erro 400 (forçar escolha explícita).
- Auth: `requireAuth`. Fonte: `tournaments WHERE grind_session_id IS NULL` (regra §6.1 — histórico, não sessão) + `date BETWEEN from AND to`.
- Agrupamento: interim tier×type (SQL existente + cláusula de período); futuro família via `groupTournaments`.
- Por grupo computar: `buyIn` médio (USD; FX→USD antes — memory/feedback_grind_live_fx lesson #6), `field` médio real, `roi` ajustado (`SUM(prize)/NULLIF(SUM(buyIn)+downswing,0)`), `count` no período, `isPKO` (do type), `placesPaidPct`/`rakePct` defaults (15%/7% GG) — ou **derivar ITM real** do histórico (posições pagas observadas) como upgrade.
- Resposta: mesmo shape `{ groups: AggGroup[], meta }` que `buckets-aggregate` (wizard consome sem mudança).
- Cache: padrão `app.locals._varianceCache` + invalidação no upload (já existe `invalidateHistoricalStatsCache`).
- Zod: reaproveitar ranges; período validado (from<=to, janela máx ex. 730 dias).

**Frontend** (`AggregationWizard`): toggle de fonte + period picker (date range OU chips últimos N dias) quando "Meu histórico". `useQuery` key inclui `from/to/lastDays`. Empty state: "Nenhum torneio no período — importe CSV em /upload ou ajuste o período".

**Amostra mínima (resolve Q §4.4):** reusar `lowSample` < 20 por grupo (badge "n baixo" já existe). Grupos abaixo do piso entram mas com aviso de baixa confiança no ROI.

**Vantagem sobre PrimeDope:** ROI + field + buy-in vêm de **dados reais do upload** do jogador, não estimativa manual. É o diferencial central da ferramenta.

**Testes previstos:** endpoint (período filtra corretamente, FX→USD, §6.1 exclui sessão, ROI por grupo, empty), UI (toggle troca fonte, period picker, empty state, payload mantém shape).

**Não inclui (fica VR-CALC-3+):** família grouping fino (espera paralelo), payout real derivado do CSV, satélite/PKO bounty.

---

## 2. Feature B — Fidelidade Poker (gap vs PrimeDope + além)

Founder: *"a ferramenta é muito fraca nesse aspecto sobre poker"*. A engine usa um payout **sintético** e ignora dinâmicas reais. Abaixo o gap analysis + agenda de pesquisa. Cada item precisa de pesquisa de math/poker **antes** de virar ADR.

### 2.1 Campos que faltam na UI (engine já suporta — quick win)
| Campo | Estado | Ação |
|-------|--------|------|
| ~~**Rake %**~~ ✅ ADR-216 | Editável por torneio na UI; entra no custo + calibração; default 7% (GG) | FEITO |
| ~~**ITM % / places paid**~~ ✅ ADR-216 | Editável por torneio na UI; default 15% | FEITO |

### 2.2 Leaks de math reais (precisam pesquisa + correção)
1. ~~**Rake não reduz o prize pool.**~~ ✅ RESOLVIDO (ADR-216). Modelo PrimeDope/MTTDB: prize pool = `field × buyIn` (buyIn = contribuição ao pool), cost = `buyIn × (1+rake)`, calibração `target=(1+rake)(1+ROI)`. ROI segue líquido, sem double-count.
2. **Satellite mapeado como Vanilla** (`normalizeType` em `variance.ts:68` faz `Satellite→Vanilla`). Satélite tem payout **flat** (N assentos de valor igual) — variância e EV completamente diferentes de payout power-law. **(LEAK confirmado)** — precisa modo de payout "satélite" (flat seats).
3. **PKO/bounty cru.** Hoje só achata `alpha −0.3`. Real PKO: ~50% do buy-in vai pra pool de bounties; EV de bounty é fluxo separado (bounties coletados ∝ eliminações ∝ skill/stack), progressivo dobra a cada KO. Subestima upside e variância de PKO. Precisa modelar **bounty como componente de EV separado**.
4. **Re-entry / rebuy / add-on não modelados.** Afetam: investimento real (multiplica buy-in), tamanho de field efetivo, variância. Add-on já é mapeado→Vanilla (perde info).
5. **Late registration não modelado.** Afeta field efetivo + stack inicial relativo.
6. **Field size fixo (média).** Real: field varia por torneio (ex. ±30%). Poderia sortear field de uma distribuição em vez de usar a média.
7. **ROI tratado como ponto fixo.** Real: ROI tem incerteza própria (especialmente com amostra pequena). Poderia adicionar incerteza no ROI alvo (Bayesian/bootstrap a partir da amostra real do CSV).
8. **Independência entre torneios** (limitação já declarada). Real: variância de banca tem correlação intra-dia (mesma sessão, mesmo tilt). Difícil — talvez fora de escopo.
9. **ICM / deals de final table** não modelados. Reduz variância no topo (deals achatam payout). Provavelmente escopo avançado.

### 2.3 Estrutura de pagamento real
PrimeDope deixa colar a estrutura de payout real. Grindfy tem vantagem: pode **derivar a estrutura real do CSV** (posições + prêmios efetivos do histórico do jogador por família). Pesquisa: como reconstruir/calibrar a curva de payout a partir dos dados de upload em vez do power-law sintético.

### 2.4 Agenda de pesquisa (antes de qualquer ADR)
- [ ] Estruturas de payout reais por field-size / rede (WPN, GG, Stars) — validar `alpha` atual vs realidade.
- [ ] Math de bounty/PKO EV (pool de bounty, progressivo, EV de KO por skill).
- [ ] Math de satélite (flat payout, ITM = nº assentos, variância).
- [ ] ITM% típico por tipo/field (10–20%) — tabela de defaults por tipo.
- [ ] Rake típico por stake/rede (% do buy-in) — defaults pré-preenchidos.
- [ ] Incerteza de ROI a partir de amostra (bootstrap / intervalo de credibilidade) — quão grande precisa a amostra do CSV pra ROI ser confiável (cross-ref: `lowSample` < 20 já existe).
- [ ] Como PrimeDope modela cada item acima (benchmark feature-a-feature).
- [ ] Variância de field size — vale sortear de distribuição?

> Pesquisa profunda já provou valor nesta área — ver `memory/research_variance_2026-05-29.md` + `Docs/strategy/mtt-variance-math-study-guide-2026-05-29.md` (base do ADR-215). Repetir o padrão: pesquisar → ADR → TDD.

---

## 3. Roadmap faseado (proposta — priorizar quando agentes terminarem)

| Fase | Escopo | Depende de | Esforço |
|------|--------|-----------|---------|
| ~~**VR-CALC-1**~~ ✅ SHIPPED (ADR-216, 2026-05-29) | Rake% + ITM% editáveis por torneio na UI; **rake entra no custo + calibração** (modelo PrimeDope/MTTDB `target=(1+rake)(1+ROI)`, sem double-count); leaks conhecidos visíveis na página | — | S–M |
| ~~**VR-CALC-2**~~ ✅ SHIPPED interim (2026-05-29) | Endpoint `GET /api/variance/history-aggregate` (from/to OU lastDays) + `server/services/historyAggregate.ts` (agrupa `tournaments grind_session_id IS NULL` por **tier×type** com ROI ajustado real) + UI toggle "Grade planejada"/"Meu histórico" + period chips + **date-range custom (from/to)**. Único upgrade futuro: tier×type → **família** (`libraryGrouping`) quando landar em main (deliberado, não débito) | — | M–L |
| ~~**VR-CALC-3**~~ 🟡 PARCIAL (ADR-217, 2026-05-29) | ✅ **Satélite flat-payout** (leak #2 resolvido) + estrutura de payout (Padrão/Flat/Top-Heavy) escolhível por grupo + calculadora usável **sem bankroll** + test debt pré-existente corrigido. ⏳ PKO bounty como EV separado (leak #3) ainda interim (alpha-flatten) — research-gated | Pesquisa math bounty | L |
| ~~**VR-CALC-5** (re-entry)~~ ✅ PARCIAL (ADR-217) | **Re-entry/rebuy** via `avgEntries` (custo real + calibração). ⏳ Late reg, field variável, ICM ainda research-gated | — | — |
| **VR-CALC-4** | Payout real derivado do CSV (2.3) + incerteza de ROI por bootstrap (leak #7) | VR-CALC-2 + pesquisa | L |
| **VR-CALC-5b** (avançado) | Late reg, field size variável (regen payout caro), ICM/deals | Pesquisa + decisão de escopo | XL |

---

## 4. Decisões em aberto (resolver com founder antes de implementar)
1. ~~Rake abate o pool?~~ ✅ RESOLVIDO ADR-216 (rake no custo+calibração, modelo PrimeDope, sem double-count).
2. ~~Import substitui ou modo alternativo?~~ ✅ RESOLVIDO — **modo alternativo** (toggle não-destrutivo, VR-CALC-2 interim).
3. ~~ITM%/rake por grupo ou global?~~ ✅ RESOLVIDO — **por grupo** com defaults (ITM 15%, rake 7% GG).
4. ~~Amostra mínima?~~ ✅ RESOLVIDO — reusa `lowSample` < 20 (badge "n baixo").
5. ~~Custom date-range (from/to) na UI?~~ ✅ RESOLVIDO — sub-toggle "Últimos N dias" / "Intervalo" (date inputs from/to; só busca quando from<=to).

**VR-CALC-2 100% completo no escopo interim.** Único upgrade futuro: trocar agrupamento tier×type → família (`libraryGrouping.groupTournaments`) quando o motor landar em main — decisão deliberada, não débito (tier×type é granularidade adequada pra variância; família evitaria fragmentação em grupos low-sample).

---

## 5. Arquivos-chave (mapa pra quem implementar)
- **UI:** `client/src/components/primedope/AggregationWizard.tsx` (tabela editável), `PrimedopeResult.tsx` (gráfico/cards), `PrimedopePanel.tsx`, `GradePlanner.tsx` (aba variance).
- **Engine:** `server/services/varianceEngine.ts` (Monte Carlo + payout + skill).
- **Rotas:** `server/routes/primedope.ts` (`/simulate` + zod), `server/routes/variance.ts` (`/buckets-aggregate`, `/historical-stats`).
- **Storage:** `storage.getHistoricalStatsByUser` (`storage.ts:11709`), `listPlannedTournamentsByProfile`.
- **Agrupamento família:** `client/src/pages/TournamentLibraryNew.tsx` (2-níveis, ROI por grupo) — fonte de verdade do agrupamento a reusar.
- **Defaults:** `shared/primedopeDefaults.ts`.
- **ADR atual:** `Docs/architecture/decisions/215-*` (math precision). Próximos ADRs por fase acima.
- **Pesquisa base:** `memory/research_variance_2026-05-29.md`, `Docs/strategy/mtt-variance-math-study-guide-2026-05-29.md`.

---

## 6. Pré-requisitos (gate de início)
- [ ] Agente da página **Torneios** finalizou (contrato de família/agrupamento estável).
- [ ] Pipeline de **Upload** finalizado (shape de `tournaments` por tipo confiável).
- [ ] Founder + Claude estudam as 3 ferramentas juntas (Torneios, Upload, Calculadora) e validam o roadmap.
- [ ] Pesquisa da seção 2.4 concluída e virou ADR(s).

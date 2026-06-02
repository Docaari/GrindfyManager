# Spec: Fase F #12 — Game Selection Score (Softness / 6 indicadores de field mole)

## Status
Proposta

## Resumo
Adiciona ao Tournament Selector um **eixo de softness** (quão mole/explorável é o
field de um torneio), derivado de 6 indicadores do curso "Antes das Cartas" F1
(game selection). O softness é exibido como **eixo SEPARADO** ao lado do score
0-100 existente — NÃO altera o scorer calibrado. Para jogadores de MTT
profissionais que querem priorizar mesas moles, não só ROI histórico.

## Contexto
O Tournament Selector atual (`server/scoring/tournamentScorer.ts`) pontua a
**qualidade geral** do torneio para AQUELE jogador (ROI por site/buy-in/categoria/
field/horário, com shrinkage Bayesiano + cold start). Isso responde "esse torneio
combina com o MEU histórico?", mas NÃO responde a pergunta central de game
selection do curso F1: **"esse field está MOLE?"** — ou seja, quão explorável é a
população, independente do meu histórico.

Board ICE 6.7, âncora curso F1. O GAP é o eixo softness. Esta fase só entrega o
**softnessScore (6 indicadores) + exibição** — não refaz o scorer 0-100.

### Por que eixo separado e NÃO componente do score 0-100 (decisão travada)
O score 0-100 é calibrado (pesos somam 1.0, anchors de cold start fixos em ADR-015,
dezenas de testes legados em `tests/**` validam valores exatos). Injetar softness
como 8º sinal:
- quebraria a soma de pesos e os anchors de cold start;
- forçaria recalibração de todos os testes do scorer;
- misturaria duas perguntas distintas (fit pessoal vs softness do field) num
  número só, perdendo legibilidade.
Eixo separado/aditivo é reversível, barato, não toca o caminho calibrado e é mais
honesto para o jogador (dois sinais, dois propósitos).

## Usuários
- **Jogador MTT (profissional/semi-pro)**: vê, no card do selector e no grade
  planner, um badge "Field mole" + score de softness + breakdown dos indicadores
  que bateram, para priorizar torneios exploráveis. Não interage além de ler.

## Limitação fundamental dos dados (honestidade — lesson #11)
Os 6 indicadores foram mapeados contra os campos **REAIS** disponíveis
(`ScoringInputTournament` em `shared/scoring.ts` + raw rows Suprema/library). NÃO
existe no sistema: flag de satélite, contagem real de qualifiers, flag de
sportsbook, flag de multi-day, nem flag de restrição regional. **5 dos 6
indicadores são PROXY POR NOME (regex sobre `name`) ou heurística de campo
existente.** Cada indicador carrega um nível de confiança (`strong`/`weak`) e a UI
DEVE rotular "estimado por nome" quando aplicável. NÃO inventamos dado que não
existe.

---

## Mapeamento dos 6 indicadores → campo/heurística REAL

Fonte de cada campo: `ScoringInputTournament` (`name`, `site`, `buyIn` [USD],
`fieldSizeEstimate`, `timeOfDayBucket`) + raw row (`guaranteed` string na Suprema,
`s.guaranteed`; library pode ter `guaranteed`). FX já normalizado para USD no
`buildScoringInput` (lesson #6) — `buyIn` no SCT já está em USD.

| # | Indicador (curso F1) | Campo/heurística REAL | Confiança | Limitação |
|---|---|---|---|---|
| 1 | Satélite/qualifier influx | **Proxy por nome**: regex em `name` (case+accent-insensitive) match `satélite\|satelite\|sat\b\|qualifier\|qualy\|step\|seat\|ticket\|classificat` | `weak` | Não há contagem real de % qualifiers no field. Só detecta se O PRÓPRIO torneio é satélite (nome). NÃO detecta "X% dos entrants vieram de satélite". Documentar: proxy de nome. |
| 2 | Garantido alto vs buy-in (overlay potential) | **Campo real (parcial)**: `guaranteed` (USD, via FX) ÷ `buyIn` (USD) = ratio de "assentos garantidos". Alto ratio → premiação grande relativa ao buy-in → atrai recreacionais + chance de overlay. | `strong` (quando `guaranteed > 0`) | `guaranteed` pode ser 0/ausente (library sem garantido) → indicador NÃO dispara (não penaliza, só não soma). Ratio é proxy de overlay, não overlay confirmado (não temos field esperado vs garantido em dinheiro). |
| 3 | Sportsbook integration | **Proxy por allowlist de site**: `site` ∈ allowlist de redes com integração de aposta esportiva conhecida. Ver `SOFTNESS_SPORTSBOOK_SITES` abaixo. | `weak` | Sistema NÃO tem flag de sportsbook. Sites conhecidos: `WALLET_PLATFORMS` (Suprema, GGNetwork, PokerStars, WPN, 888, PartyPoker, etc). Allowlist inicial conservadora baseada em realidade BR. Site fora da allowlist OU desconhecido → indicador não dispara. |
| 4 | Multi Day1 | **Proxy por nome**: regex em `name` match `day\s?1\b\|d1\b\|\b1[ab]\b\|flight\|multi.?day` | `weak` | Não há flag de multi-day. Proxy de nome (ex: "Main Event Day 1B"). Falsos negativos prováveis em torneios multi-day sem "Day 1" no nome. |
| 5 | Prime-time | **Campo real**: `timeOfDayBucket === 'noite-nobre'` (21:00-23:59) — opcionalmente também `'noite-cedo'` (18:00-20:59) com peso menor. Ver decisão D-5. | `strong` | `timeOfDayBucket` já existe e é derivado de forma determinística. Forte. (Limitação: prime-time é por fuso BR; bucket usa hora local do `time` string como já faz o selector.) |
| 6 | Restrição regional | **Proxy por nome**: regex em `name` match `brasil\|brazil\|br\b\|latam\|americas\|nacional\|regional\|\bsa\b\|sul.?americ` | `weak` | Não há flag de região. Proxy de nome muito ruidoso ("BR" pode aparecer em contextos não-regionais). Confiança baixíssima — UI DEVE marcar fortemente "estimado por nome". |

### Constantes propostas (a confirmar pelo architect/implementer)

```
// server/scoring/softnessConstants.ts (NOVO arquivo — não tocar scoringConstants.ts)

SOFTNESS_SATELLITE_RE   = /(satelit|satellite|\bsat\b|qualif|\bqualy\b|\bstep\b|\bseat\b|ticket|classificat)/i  (após stripAccents)
SOFTNESS_MULTIDAY_RE    = /(day\s?1\b|\bd1\b|\b1[ab]\b|flight|multi.?day)/i
SOFTNESS_REGIONAL_RE    = /(brasil|brazil|\bbr\b|latam|americas|nacional|regional|\bsa\b|sul.?americ)/i  (após stripAccents)

SOFTNESS_OVERLAY_RATIO_THRESHOLD = 100   // guaranteed/buyIn >= 100 (ex: $5 buy-in com $500+ gtd) → softness alto.
                                          // Justificativa: ratio >=100 sinaliza premiação atrativa pra recreacional
                                          // relativa ao buy-in. PROPOSTA — calibração fina deferida (não há ground truth).

SOFTNESS_PRIMETIME_BUCKETS = { 'noite-nobre': forte, 'noite-cedo': fraco }  // ver D-5

SOFTNESS_SPORTSBOOK_SITES = ['GGNetwork', 'PokerStars', '888', 'PartyPoker']
   // Redes com integração/cross-sell de aposta esportiva conhecida (influxo recreacional).
   // PROPOSTA conservadora. Suprema NÃO incluída por padrão (rede BR de poker puro) —
   // confirmar com founder. Site fora da lista OU desconhecido → indicador não dispara.
```

> ⚠️ Helper `stripAccents` (normalize NFD + remove diacríticos) deve existir/ser
> criado para os regex de nome (satélite, regional). Verificar reuso antes de criar.

---

## Requisitos Funcionais

### RF-01: Detector dos 6 indicadores (função pura)
**Descrição:** Função pura `detectSoftnessIndicators(input)` que recebe os campos
reais (name, site, buyInUSD, guaranteedUSD, timeOfDayBucket) e retorna um array de
indicadores que bateram, cada um com `{ key, matched: true, confidence, label,
evidence }`.
**Regras de negócio:**
- Cada um dos 6 indicadores é avaliado independentemente (presença individual —
  lesson #8, NUNCA testar por `length` do array).
- Indicador 1 (satélite), 4 (multi-day), 6 (regional): regex sobre `name`
  normalizado (stripAccents + lowercase). `confidence: 'weak'`.
- Indicador 2 (overlay): só dispara quando `guaranteedUSD > 0 && buyInUSD > 0 &&
  guaranteedUSD/buyInUSD >= SOFTNESS_OVERLAY_RATIO_THRESHOLD`. `confidence: 'strong'`.
  Quando `guaranteed` ausente/0 → não dispara (não penaliza).
- Indicador 3 (sportsbook): `site ∈ SOFTNESS_SPORTSBOOK_SITES`. `confidence: 'weak'`.
- Indicador 5 (prime-time): `timeOfDayBucket ∈ SOFTNESS_PRIMETIME_BUCKETS`.
  `confidence: 'strong'` para `noite-nobre`.
- `guaranteedUSD` deve ser normalizado de moeda nativa para USD ANTES (mesma
  convenção do `buildScoringInput` — lesson #6). O detector recebe valores JÁ em USD.
- Função é pura/determinística, sem I/O, sem dependência do bundle de analytics.
**Critério de aceitação:**
- [ ] Cada indicador é detectável isoladamente dado um input que só ele bate.
- [ ] Cada indicador carrega `confidence: 'strong' | 'weak'`.
- [ ] Indicador overlay não dispara com `guaranteed` ausente/0.
- [ ] Regex de nome ignora acentos e case ("Satélite" == "satelite").

### RF-02: Cálculo do softnessScore (soma ponderada)
**Descrição:** Função pura `computeSoftnessScore(indicators)` que converte os
indicadores detectados em um sub-score **0-100** + breakdown.
**Regras de negócio (decisão travada — ver D-2):**
- Fórmula = **soma ponderada normalizada para 0-100**, onde indicadores `strong`
  pesam mais que `weak`. Pesos propostos (a confirmar architect):
  - overlay (strong): 30
  - prime-time noite-nobre (strong): 25 / noite-cedo (weak): 10
  - sportsbook (weak): 15
  - satélite (weak): 15
  - multi-day (weak): 10
  - regional (weak): 5
  - **Soma máxima teórica = 100** (overlay 30 + prime 25 + sportsbook 15 + satélite
    15 + multi-day 10 + regional 5 = 100). Score = soma dos pesos dos indicadores
    que bateram (já em escala 0-100, sem renormalização — clamp 0-100 defensivo).
- Retorna `{ softnessScore: number (0-100), tier: 'mole'|'medio'|'duro',
  matchedCount: number, indicators: [...], overallConfidence: 'strong'|'weak'|'mixed' }`.
- `tier`: `mole` se `softnessScore >= 50`, `medio` se `>= 25`, senão `duro`.
  (Thresholds PROPOSTOS — calibração deferida, ver D-2.)
- `overallConfidence`: `strong` se algum indicador strong bateu; `weak` se só weak
  bateram; (sem matches → `softnessScore=0`, `tier='duro'`, confidence irrelevante).
**Critério de aceitação:**
- [ ] Todos os 6 indicadores falsos → `softnessScore=0`, `tier='duro'`.
- [ ] Só overlay (strong) bate → score=30, tier='medio'.
- [ ] Overlay + prime-time noite-nobre + sportsbook → 30+25+15=70, tier='mole'.
- [ ] Score sempre ∈ [0,100] (clamp defensivo).
- [ ] `overallConfidence='weak'` quando só indicadores weak bateram.

### RF-03: Integração no payload do selector (eixo separado, aditivo)
**Descrição:** O `handleTournamentSelector` (`server/routes/tournament-selector.ts`)
enriquece cada `SelectorTournament` com um bloco `softness` SEM tocar em `score`/
`grade`/`signals`/`confidence` existentes.
**Regras de negócio:**
- Novo campo opcional em `SelectorTournament` (`shared/scoring.ts`):
  ```
  softness?: {
    score: number;            // 0-100
    tier: 'mole' | 'medio' | 'duro';
    matchedCount: number;
    overallConfidence: 'strong' | 'weak';
    indicators: Array<{ key: SoftnessIndicatorKey; label: string;
                        confidence: 'strong' | 'weak'; evidence?: string }>;
  } | null;
  ```
- Calculado para Suprema E library, após o `buildSupremaScoringInput`/
  `buildLibraryScoringInput` (reusa `built.buyInUSD` + `guaranteed` raw → USD).
- O cálculo de softness é uma **camada ACIMA** do scorer (mesmo padrão de
  `applyTicketBoost`/`enrichWithTickets`) — NÃO entra em `computeTournamentScore`.
- `softness` NÃO afeta `score`, `grade`, ordenação atual, filtros (`minScore`,
  bankroll), nem cache key. (Sort por softness é opcional/deferido — ver D-3b.)
- Best-effort: se o detector lançar, loga e seta `softness: null` (lesson #9 —
  loga antes do fallback; nunca quebra o selector).
**Critério de aceitação:**
- [ ] `score`/`grade` do torneio idênticos com e sem o bloco softness (regressão).
- [ ] `softness` presente em torneios Suprema e library.
- [ ] Erro no detector → `softness: null`, selector continua respondendo 200.
- [ ] Cache key NÃO muda (softness é derivado determinístico do mesmo input).

### RF-04: Exibição no SelectorCard
**Descrição:** O `SelectorCard` renderiza um badge de softness + breakdown dos
indicadores que bateram, com rótulo de confiança.
**Regras de negócio:**
- Badge `data-testid="softness-badge"` com label por tier: `mole`="Field mole",
  `medio`="Field médio", `duro`="Field duro" (cor: mole=verde, medio=âmbar,
  duro=neutro/cinza). Só renderiza badge quando `softness != null`.
- Breakdown `data-testid="softness-breakdown"`: lista os `indicators` que bateram
  com label PT-BR (ex: "Garantido alto vs buy-in", "Horário nobre", "Satélite").
- **Honestidade (lesson #11):** quando `overallConfidence === 'weak'` (ou para
  indicadores individuais `weak`), o breakdown exibe sufixo/ícone "estimado por
  nome" (`data-testid="softness-estimated-note"`). NÃO afirmar certeza.
- `tier='duro'` (score baixo / sem matches): NÃO renderiza badge (evita ruído) OU
  renderiza badge neutro discreto — decisão D-4.
- Não há ação/botão novo. É informativo (lesson #11 — componente decorativo não
  ganha ação default).
**Critério de aceitação:**
- [ ] Badge mostra label correto por tier.
- [ ] Breakdown lista só os indicadores que bateram.
- [ ] `overallConfidence='weak'` → nota "estimado por nome" visível.
- [ ] `softness=null` → nenhum elemento de softness no DOM.

### RF-05: Exibição no SelectorDetailsModal (breakdown completo)
**Descrição:** O `SelectorDetailsModal` (modal de detalhes do score) ganha uma
seção "Softness do field" com todos os 6 indicadores (os que bateram destacados,
os que não bateram em cinza) + o score 0-100 de softness + explicação textual da
limitação dos proxies.
**Regras de negócio:**
- Lista os 6 indicadores sempre (estado: bateu / não bateu), com confiança de cada.
- Texto fixo de honestidade: "Indicadores marcados com * são estimados pelo nome do
  torneio e podem ter falsos positivos/negativos."
- Reusa o mesmo bloco `softness` do payload (sem fetch novo).
**Critério de aceitação:**
- [ ] Seção lista os 6 indicadores com estado bateu/não-bateu.
- [ ] Indicadores `weak` marcados com `*` + legenda de honestidade.
- [ ] `softness=null` → seção exibe "Não calculado" (ou oculta), sem quebrar modal.

---

## Requisitos Não-Funcionais
- **Performance:** O detector é O(1) por torneio (regex + comparações). Aplicado
  inline no loop de scoring existente (centenas de torneios/dia). Sem I/O extra,
  sem query nova, sem chamada de rede. Impacto desprezível no tempo de resposta.
- **Compatibilidade:** Zero regressão no score 0-100 / grade / sort / filtros /
  cache. Campo `softness` é opcional (`?`) — clientes antigos ignoram.
- **Honestidade de dados (lesson #11):** todo indicador proxy carrega
  `confidence: 'weak'` e a UI rotula "estimado por nome". Não afirmar certeza.
- **FX (lesson #6):** `guaranteedUSD` normalizado para USD antes do ratio, com os
  mesmos `exchangeRates` do user usados em `buildScoringInput`.

## Endpoints Previstos
**Nenhum endpoint novo.** O bloco `softness` é aditivo no payload do
`GET /api/tournament-selector` existente.

| Método | Rota | Mudança | Auth |
|---|---|---|---|
| GET | /api/tournament-selector | Cada `tournament` ganha campo opcional `softness` | JWT |

## Modelos de Dados Afetados
**Nenhuma tabela alterada.** Tudo derivado de campos existentes (`name`, `site`,
`buyIn`/`buyInUSD`, `guaranteed`, `timeOfDayBucket`) + constantes novas.

### `SelectorTournament` (alteração de tipo TS, `shared/scoring.ts`)
| Campo | Tipo | Notas |
|---|---|---|
| softness | `{ score, tier, matchedCount, overallConfidence, indicators[] } \| null` | Opcional. Aditivo. Não afeta `score`/`grade`. |

### Tipos novos (`shared/scoring.ts`)
- `SoftnessIndicatorKey = 'satellite' | 'overlay' | 'sportsbook' | 'multiday' | 'primetime' | 'regional'`
- `SoftnessTier = 'mole' | 'medio' | 'duro'`
- `SoftnessIndicator`, `SoftnessResult` (shape do bloco `softness`).

## Integrações Externas
Nenhuma. (Suprema API já é consumida; nenhum campo novo solicitado a ela.)

## Migration?
**NÃO.** Deriva 100% de campos existentes + constantes em código. Nenhuma coluna,
nenhuma tabela, nenhum back-fill. (Migrations 0092-0093 reservadas pela sessão
Coach; 0094+ livre — mas esta fase NÃO usa migration.)

---

## Decisões travadas vs deferidas

### Travadas
- **D-1 (integração):** softness é **EIXO SEPARADO/ADITIVO**, NÃO componente do
  score 0-100. Camada acima do scorer (padrão `applyTicketBoost`).
- **D-2 (fórmula):** soma ponderada com pesos `strong > weak`, máximo = 100, sem
  renormalização, clamp defensivo. Tiers mole≥50 / medio≥25 / duro<25.
- **D-6 (migration):** nenhuma.
- **D-7 (honestidade):** todo proxy de nome → `confidence: 'weak'` + rótulo
  "estimado por nome" na UI. Indicador overlay e prime-time = `strong`.
- **D-8 (escopo):** SÓ softnessScore (6 indicadores) + exibição (card + modal +
  tipos + payload). NÃO mexer no scorer 0-100, sort, filtros, cache, bankroll.

### Deferidas (marcar pro architect / fora desta fase)
- **D-3b (sort por softness):** ordenar/filtrar o selector por softness é
  feature futura. Esta fase só EXIBE. (Se desejado, vira RF de fase F.1.)
- **D-2-calibração:** os thresholds (`OVERLAY_RATIO=100`, pesos, tiers) são
  PROPOSTAS sem ground truth. Calibração fina deferida — architect decide se aceita
  os números propostos ou ajusta. Documentar como "calibração v1".
- **D-3 (allowlist sportsbook):** `SOFTNESS_SPORTSBOOK_SITES` proposta conservadora
  (GGNetwork, PokerStars, 888, PartyPoker; Suprema fora). **Confirmar com founder**
  se Suprema/outras entram. Architect pode marcar como decisão de produto pendente.
- **D-4 (badge em field duro):** renderizar badge neutro discreto vs ocultar
  totalmente quando `tier='duro'`. Recomendação: ocultar badge para reduzir ruído,
  mas manter no modal. Architect/implementer confirma na UI.
- **D-5 (prime-time noite-cedo):** incluir `noite-cedo` como indicador prime-time
  fraco (peso 10) ou só `noite-nobre`. Recomendação: incluir noite-cedo como weak.

---

## Cenários de Teste Derivados

### Happy Path
- [ ] Torneio "$5 Satélite Day 1B" às 22:00 na GGNetwork com gtd $1000 → bate
  satélite + multi-day + prime-time + sportsbook + overlay → softnessScore alto,
  tier='mole', breakdown lista os 5.

### Detecção individual (lesson #8 — presença individual, NÃO length)
- [ ] Só satélite no nome → indicator `satellite` presente, `confidence='weak'`.
- [ ] Só `guaranteed/buyIn >= 100` → indicator `overlay` presente, `'strong'`.
- [ ] Só site GGNetwork → indicator `sportsbook` presente, `'weak'`.
- [ ] Só "Day 1A" no nome → indicator `multiday` presente, `'weak'`.
- [ ] Só `timeOfDayBucket='noite-nobre'` → indicator `primetime` presente, `'strong'`.
- [ ] Só "Brasil" no nome → indicator `regional` presente, `'weak'`.

### Cálculo do score
- [ ] Todos os 6 falsos → `softnessScore=0`, `tier='duro'`, `matchedCount=0`.
- [ ] Só overlay (30) → score=30, tier='medio'.
- [ ] overlay+prime-nobre+sportsbook (30+25+15) → 70, tier='mole'.
- [ ] Todos os 6 bateriam → soma=100, clamp não excede 100.
- [ ] `overallConfidence='weak'` quando só weak bateram; `'strong'` se algum strong.

### Edge cases (pro test-writer)
- [ ] **Sem guaranteed**: `guaranteed=0`/ausente → overlay NÃO dispara, score não
  penaliza, demais indicadores funcionam.
- [ ] **Nome ambíguo**: "Bradesco BR Series" → regional bate por "BR" (falso
  positivo conhecido, `confidence='weak'`, UI marca "estimado por nome"). Documentar
  como falso positivo aceito do proxy.
- [ ] **Site desconhecido**: `site=''` ou site fora de `WALLET_PLATFORMS`/allowlist
  → sportsbook NÃO dispara, sem erro.
- [ ] **Todos indicadores falsos**: torneio comum "$10 NLH" tarde na CoinPoker, sem
  gtd → `softness.score=0`, `tier='duro'`, badge oculto (D-4), modal mostra 6
  indicadores não-batidos.
- [ ] **FX (lesson #6)**: torneio Suprema gtd em BRL (ex: R$5000) com buy-in R$50 →
  guaranteed e buyIn convertidos para USD antes do ratio; ratio em USD == ratio em
  BRL (FX se cancela), mas detector recebe valores USD coerentes; sem cotação →
  fallback `DEFAULT_EXCHANGE_RATES` (BRL=5.0), não zera.
- [ ] **timeOfDayBucket null**: `time` inválido → `safeTimeOfDayBucket` retorna null
  → prime-time NÃO dispara, sem erro.
- [ ] **Acento/case**: "SATÉLITE", "satelite", "Satélite" → todos batem satélite
  (stripAccents + lowercase).
- [ ] **Regressão scorer**: para um torneio fixo, `score`/`grade`/`signals` são
  byte-idênticos com e sem o enriquecimento de softness (lesson #3 — mock com shape
  REAL de `ScoringInputTournament`/`SelectorTournament`).
- [ ] **Detector lança → softness null**: forçar exceção no detector (ex: input
  malformado) → handler loga + seta `softness:null`, selector 200.

### UI (SelectorCard / Modal — RTL, lesson #2 data-testid estável)
- [ ] Badge `softness-badge` com label por tier (mole/medio/duro).
- [ ] Breakdown `softness-breakdown` lista só indicadores batidos.
- [ ] `overallConfidence='weak'` → `softness-estimated-note` visível.
- [ ] `softness=null` → nenhum `softness-*` no DOM.
- [ ] Modal lista os 6 indicadores (batidos + não-batidos) + legenda honestidade.

---

## Fora de Escopo
- Refazer/recalibrar o scorer 0-100, pesos dos 7 sinais, grade S/A/B/C/D, cold start.
- Ordenar ou filtrar o selector por softness (deferido D-3b).
- Qualquer coisa de Coach AI (FRONTEIRA inter-sessão — proibido tocar
  coach.ts, server/coach/*, CoachAI.tsx, coach-ai/*, reportEligibility, etc).
- Bankroll (filtros/limites/warnings) — intocado.
- Persistência de softness (sem coluna, sem tabela, sem migration).
- Contagem REAL de qualifiers, flag real de sportsbook/multi-day/região, overlay
  confirmado em dinheiro — dados que NÃO existem; usamos proxies marcados.
- Detecção de satélite via campo estruturado (não existe; proxy de nome só).

## Dependências
- `server/scoring/buildScoringInput.ts` (fornece `buyInUSD`; reuso do padrão de
  enriquecimento acima do scorer).
- `server/scoring/timeOfDayBucket.ts` (fornece `timeOfDayBucket` para prime-time).
- `shared/scoring.ts` (`ScoringInputTournament`, `SelectorTournament`).
- `currencyNormalizer` / `DEFAULT_EXCHANGE_RATES` (para `guaranteedUSD`).
- Helper `stripAccents` (verificar reuso antes de criar).

## Notas de Implementação (opcional)
- Novos arquivos sugeridos (architect confirma): `server/scoring/softnessConstants.ts`
  (regex + thresholds + allowlist + pesos), `server/scoring/softnessDetector.ts`
  (`detectSoftnessIndicators` + `computeSoftnessScore`). Aplicar no
  `handleTournamentSelector` no mesmo loop de `enrichWithTickets`/`applyTicketBoost`.
- NÃO tocar `scoringConstants.ts` nem `tournamentScorer.ts` (PROIBIDO mexer no
  scorer calibrado — espelha ADR-186 §2.4 do ticket boost).
- `guaranteed` raw: Suprema = string (`s.guaranteed`, BRL nativo); library = ver row
  shape (pode ter `guaranteed`). Normalizar para USD com `normalizeBuyInToUSD` na
  moeda nativa do torneio (`built.currency`).
- Pipeline TDD: spec → architect (ADR + diagrama; próximo nº ADR livre, NÃO 230-236
  já usados) → test-writer → implementer → /simplify → reviewer.
- **Verify browser** faz parte do "done": abrir `/coach`?/grade planner/selector,
  ver badge de softness + breakdown + nota "estimado por nome" num torneio real.

## Verificação Final (checklist pm-spec)
- [x] Cada RF tem critérios de aceitação verificáveis.
- [x] Cenários cobrem happy path, detecção individual, edge cases (sem gtd, nome
  ambíguo, site desconhecido, todos falsos, FX, regressão).
- [x] "Fora de Escopo" preenchido (inclui fronteira Coach).
- [x] Ambiguidade resolvida: eixo separado (D-1), fórmula travada (D-2), proxies
  marcados (D-7); calibração/sort/allowlist deferidos explicitamente.
- [x] Endpoints: nenhum novo (aditivo no GET existente).
- [x] Modelos: nenhuma tabela; só tipo TS aditivo + constantes.

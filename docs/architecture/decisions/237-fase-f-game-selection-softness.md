# ADR-237: Game Selection Score (Softness) como eixo separado/aditivo do Tournament Selector

## Status
Aceito

## Data
2026-06-02

## Numero do ADR
**237.** Verificado livre em LOCAL (`Docs/architecture/decisions/` vai ate `236-fase-d-brm-ror-ao-vivo.md`) E em `origin/main` (`git ls-tree -r origin/main` — ADRs 230-236 ja MERGED; 237+ inexistentes). 236 (BRM/RoR) e desta sessao paralela. A sessao Coach AI reservou **migrations 0092-0093** (esta fase NAO usa migration) e NAO criou ADRs 237+. Logo 237 e o proximo livre e nao colide.

## Contexto

O Tournament Selector atual (`server/scoring/tournamentScorer.ts` — `computeTournamentScore`)
pontua a **qualidade do torneio para AQUELE jogador** (ROI por site/buy-in/categoria/
velocidade/dia/horario/field, com shrinkage Bayesiano K=30, redistribuicao de peso e
cold start — ADR-015). Responde "esse torneio combina com o MEU historico?".

A Fase F #12 (curso "Antes das Cartas" F1 — game selection) introduz uma pergunta
**distinta**: "esse field esta MOLE?" — quao exploravel e a populacao, independente do
meu historico. A spec (`Docs/specs/sprint-fase-f-game-selection-2026-06-02.md`) trava 6
indicadores de softness e exige que o resultado seja um **eixo separado** ao lado do
score 0-100, sem tocar o scorer calibrado.

### Forcas em jogo
- O score 0-100 e **calibrado**: pesos somam 1.0 (`scoringConstants.WEIGHTS`), anchors de
  cold start fixos (ADR-015), dezenas de testes legados validam valores exatos. Injetar
  softness como 8o sinal quebraria a soma de pesos, os anchors e forcaria recalibracao de
  todos os testes do scorer — caro e irreversivel.
- Misturar "fit pessoal" e "softness do field" num numero so perde legibilidade.
- **Honestidade de dados (lesson #11):** o sistema NAO tem flag de satelite, contagem de
  qualifiers, flag de sportsbook, flag de multi-day, nem flag regional. 5 dos 6
  indicadores sao **proxy por nome (regex) ou heuristica de campo existente**. Inventar
  dado inexistente seria desonesto. Cada indicador carrega `confidence: 'strong' | 'weak'`.
- Ja existe um precedente arquitetural exato: o **ticket boost** (ADR-186) e uma camada
  ACIMA do scorer (`applyTicketBoost`/`enrichWithTickets` em `buildScoringInput.ts`),
  aplicada no loop de `handleTournamentSelector`, sem tocar `computeTournamentScore`.

## Decisoes (D-1 .. D-6)

### D-1 — Onde mora o calculo (eixo separado, camada ACIMA do scorer)

O calculo de softness vive em **helpers PUROS dedicados**, NAO em `computeTournamentScore`:

- **`server/scoring/softnessDetector.ts`**:
  - `detectSoftnessIndicators(input: SoftnessInput): SoftnessIndicator[]` — avalia os 6
    indicadores independentemente (presenca individual — lesson #8) e retorna apenas os que
    bateram.
  - `computeSoftness(input: SoftnessInput): SoftnessResult` — orquestra o detector + a soma
    ponderada (D-2) e devolve o shape final `{ score, tier, matchedCount, overallConfidence,
    indicators[] }`. (Internamente pode separar uma funcao `computeSoftnessScore(indicators)`
    como a spec sugere; o contrato publico exposto e `computeSoftness`.)
- **`server/scoring/softnessConstants.ts`** (D-2): pesos, thresholds, regex, allowlist.

**Ponto de chamada real (confirmado no codigo):** o loop em
`server/routes/tournament-selector.ts` (~linhas 326-417) monta dois `SelectorTournament`
(Suprema E library) logo apos `applyTicketBoost`. O softness e calculado **exatamente ali**,
no mesmo ponto onde `applyTicketBoost` ja roda — espelhando o padrao do ticket boost
(ADR-186). O resultado e anexado como campo `softness` no objeto que entra em `scored.push`.

`computeSoftness` recebe os valores **JA derivados** disponiveis no loop:
`built.sct.name`, `built.sct.site`, `built.buyInUSD`, `built.sct.timeOfDayBucket`, e
`guaranteedUSD` (normalizado de `s.guaranteed`/`l.guaranteed` raw via `normalizeBuyInToUSD`
com a moeda nativa `built.currency` + `exchangeRates` do user — lesson #6). NAO recebe o
bundle de analytics; e puro/determinístico, sem I/O.

`computeTournamentScore` e `tournamentScorer.ts` ficam **byte-identicos** (D-6).

### D-2 — Constantes em arquivo NOVO `softnessConstants.ts`

NAO tocar `scoringConstants.ts` (espelha ADR-186 §2.4 — proibido mexer no caminho
calibrado). Criar `server/scoring/softnessConstants.ts` com:

- **Pesos (soma maxima teorica = 100, sem renormalizacao, clamp 0-100 defensivo):**
  - overlay (strong): **30**
  - prime-time `noite-nobre` (strong): **25**
  - prime-time `noite-cedo` (weak): **10** (D-5: incluido como prime-time fraco)
  - sportsbook (weak): **15**
  - satelite (weak): **15**
  - multi-day (weak): **10**
  - regional (weak): **5**
  - `score = soma dos pesos dos indicadores que bateram` (overlay 30 + prime-nobre 25 +
    sportsbook 15 + satelite 15 + multi-day 10 + regional 5 = 100). Prime-time conta UMA vez
    (nobre OU cedo, mutuamente exclusivos pelo bucket).
- **Tiers:** `mole` se `score >= 50`, `medio` se `>= 25`, senao `duro`.
- **`SOFTNESS_OVERLAY_RATIO_THRESHOLD = 100`** (`guaranteedUSD / buyInUSD >= 100`). Proposta
  v1 sem ground truth — calibracao fina deferida.
- **`SOFTNESS_SPORTSBOOK_SITES`** (allowlist — D-3 confirmado): `['GGNetwork', 'GGPoker',
  'PokerStars', '888poker', '888', 'PartyPoker']`. Justificativa: redes com cross-sell de
  aposta esportiva conhecida (influxo recreacional). **Suprema NAO incluida** (rede BR de
  poker puro) — decisao de produto, marcada como ponto pendente de aval do founder. O match
  e contra `built.sct.site`; valores conferem com `PLATFORM_CURRENCY` em
  `shared/platform-currency.ts`. Inclui variantes (`GGPoker`/`GGNetwork`, `888`/`888poker`)
  porque o `site` cru varia por fonte. Site fora da lista ou vazio → indicador nao dispara.

> **Calibracao v1 (deferida — D-2-calibracao):** todos os numeros acima (pesos, thresholds,
> tiers, ratio, allowlist) sao PROPOSTAS sem ground truth real de softness. Esta fase aceita
> os numeros propostos como "calibracao v1"; ajuste fino fica para fase F.1 se surgir sinal.

### D-3 — Regex de nome (helper puro, case+acento-insensitive)

Tres regex em `softnessConstants.ts`, aplicados sobre o `name` **normalizado** (stripAccents
+ lowercase) por um helper puro testavel (`normalizeNameForSoftness(name)`):

- **Satelite/qualifier/step:** `/(satelit|satellite|\bsat\b|qualif|\bqualy\b|\bstep\b|\bseat\b|ticket|classificat)/`
- **Multi-day:** `/(day\s?1\b|\bd1\b|\b1[ab]\b|flight|multi.?day)/`
- **Regional:** `/(brasil|brazil|\bbr\b|latam|americas|nacional|regional|\bsa\b|sul.?americ)/`

**Risco de falso-positivo documentado (D-7):** o proxy regional e o mais ruidoso — `"BR"`
pode aparecer em contextos nao-regionais (ex: "Bradesco BR Series" bate por `\bbr\b`).
Idem multi-day (`"Day 1"` em nome casual). Por isso TODO proxy de nome carrega
`confidence: 'weak'` e a UI rotula "estimado por nome". Falsos positivos sao **aceitos** —
o eixo softness e informativo, nunca filtra/ordena nesta fase (D-1/escopo).

**`stripAccents`:** ja existe inline (NFD + remove diacriticos) em
`shared/hud-section-aliases.ts:148` e `server/services/news/titleFingerprint.ts:125`, mas
nao e exportado como helper compartilhado. **Recomendacao (nao-bloqueante):** o
implementer pode (a) extrair um `stripAccents` compartilhado em `shared/` e reusar nos 3
sitios, ou (b) inline o NFD-strip dentro de `softnessConstants.ts`/`softnessDetector.ts`
(mais barato, zero risco de regressao nos outros 2 callsites). Preferencia: (b) inline
agora, extracao DRY como follow-up se um 4o callsite surgir (regra das 2 ocorrencias do
hub — aqui ja sao 3, mas extrair toca codigo News/HUD fora do escopo desta fase). Decisao
final do implementer; ambas satisfazem a spec.

### D-4 — Shape `softness` no SelectorTournament + contrato `computeSoftness`

**Tipos novos em `shared/scoring.ts` (aditivos — lesson #7, consumidores antigos nao
quebram):**

```ts
export type SoftnessIndicatorKey =
  | 'satellite' | 'overlay' | 'sportsbook' | 'multiday' | 'primetime' | 'regional';
export type SoftnessTier = 'mole' | 'medio' | 'duro';
export type SoftnessConfidence = 'strong' | 'weak';

export interface SoftnessIndicator {
  key: SoftnessIndicatorKey;
  label: string;                 // PT-BR (ex: "Garantido alto vs buy-in")
  confidence: SoftnessConfidence;
  weight: number;                // peso aplicado (0-30)
  evidence?: string;             // ex: "gtd/buy-in = 200x" ou "site GGNetwork"
}

export interface SoftnessResult {
  score: number;                 // 0-100
  tier: SoftnessTier;
  matchedCount: number;
  overallConfidence: SoftnessConfidence;  // 'strong' se algum strong bateu; 'weak' se so weak
  indicators: SoftnessIndicator[];        // apenas os que bateram
}
```

**Campo novo em `SelectorTournament`:** `softness?: SoftnessResult | null;` — opcional (`?`),
aditivo. NAO afeta `score`/`grade`/`signals`/`confidence`/ordenacao/filtros/cache key.

**Contrato `computeSoftness`:**

```ts
export interface SoftnessInput {
  name: string;
  site: string;
  buyInUSD: number;              // ja em USD (lesson #6)
  guaranteedUSD: number;         // ja em USD; 0/ausente => overlay nao dispara
  timeOfDayBucket: TimeOfDayBucket | null;
}
// server/scoring/softnessDetector.ts
export function computeSoftness(input: SoftnessInput): SoftnessResult;
export function detectSoftnessIndicators(input: SoftnessInput): SoftnessIndicator[];
```

`overallConfidence`: `'strong'` se ao menos um indicador strong (overlay ou prime-nobre)
bateu; `'weak'` se apenas indicadores weak bateram. Sem matches → `score=0`, `tier='duro'`,
`indicators=[]`, `matchedCount=0` (a UI nao renderiza badge — D-badge na spec/RF-04).

### D-5 — UI (onde exibe)

Componente real confirmado: `client/src/components/tournament-selector/SelectorCard.tsx`
(card) + `SelectorDetailsModal.tsx` (modal de detalhes). `SelectorPanel.tsx` apenas lista
cards — nao precisa mudar. O `useQuery` do selector NAO muda: `softness` ja vem no payload
do `GET /api/tournament-selector`.

- **SelectorCard (RF-04):** badge `data-testid="softness-badge"` por tier
  (mole="Field mole"/verde, medio="Field medio"/ambar, duro=oculto por padrao para reduzir
  ruido — recomendacao D-4-spec) + breakdown `data-testid="softness-breakdown"` listando os
  indicadores que bateram com label PT-BR. Quando `overallConfidence === 'weak'` (ou por
  indicador weak), sufixo/icone `data-testid="softness-estimated-note"` = "estimado por
  nome". Sem botao/acao nova (lesson #11 — decorativo nao ganha acao). `softness == null` →
  nenhum elemento `softness-*` no DOM.
- **SelectorDetailsModal (RF-05):** secao "Softness do field" listando os **6** indicadores
  (batidos destacados, nao-batidos em cinza) + score 0-100 + legenda fixa de honestidade
  ("Indicadores marcados com * sao estimados pelo nome do torneio e podem ter falsos
  positivos/negativos."). Reusa o bloco `softness` do payload (sem fetch novo). `null` →
  "Nao calculado" (ou oculta), sem quebrar o modal.

A grade planner exibe o mesmo card via `SelectorPanel`, entao herda o badge sem trabalho
extra.

### D-6 — SEM migration; scorer byte-identico

- **Nenhuma migration.** Tudo deriva de campos existentes (`name`, `site`, `buyIn`/USD,
  `guaranteed`, `timeOfDayBucket`) + constantes em codigo. Zero coluna, zero tabela, zero
  back-fill. (Migrations 0092-0093 reservadas pela sessao Coach; esta fase nao usa nenhuma.)
- **`computeTournamentScore` + `tournamentScorer.ts` + `scoringConstants.ts` permanecem
  byte-identicos.** Eixo separado, camada acima. Regressao validada por teste: para um
  torneio fixo, `score`/`grade`/`signals` identicos com e sem o enriquecimento de softness.
- **Best-effort (lesson #9):** se `computeSoftness` lancar, o handler loga ANTES do fallback
  e seta `softness: null`. O selector nunca quebra (continua 200). Cache key inalterada
  (softness e derivado determinístico do mesmo input).

## Opcoes Consideradas

### Opcao 1: Softness como 8o sinal dentro de `computeTournamentScore` (REJEITADA)
- **Pros:** um numero unico; sort/filtro "de graca".
- **Contras:** quebra soma de pesos (1.0) + anchors cold start (ADR-015); forca
  recalibracao de TODOS os testes legados do scorer; mistura duas perguntas distintas (fit
  pessoal vs softness do field) num numero so, perdendo legibilidade; caro e dificil de
  reverter.

### Opcao 2: Eixo separado / camada ACIMA do scorer (ESCOLHIDA)
- **Pros:** reversivel e barato; NAO toca o caminho calibrado (zero regressao no scorer);
  precedente arquitetural identico (ticket boost ADR-186); honesto (dois sinais, dois
  propositos); campo opcional aditivo (clientes antigos ignoram).
- **Contras:** sort/filtro por softness exige trabalho extra futuro (deferido D-3b); dois
  numeros na UI exigem boa apresentacao para nao confundir.

### Opcao 3: Servico/endpoint dedicado de softness (REJEITADA)
- **Pros:** isolamento total.
- **Contras:** roundtrip extra; softness e O(1) puro derivado do mesmo input ja carregado —
  endpoint novo e over-engineering. Aditivo no payload existente e mais simples.

## Decisao

Adotar a **Opcao 2**. Softness e um eixo separado, calculado por helpers puros
(`softnessDetector.ts` + `softnessConstants.ts`), aplicado no loop de
`handleTournamentSelector` no mesmo ponto do `applyTicketBoost`, anexado como campo opcional
`softness` no `SelectorTournament`. Zero migration, zero alteracao no scorer calibrado,
proxies de nome marcados `confidence: 'weak'` + rotulo "estimado por nome" na UI.

## Consequencias

**Positivas:**
- Score 0-100 calibrado intocado; testes legados do scorer continuam verdes.
- Novo sinal de game selection (softness) entregue de forma honesta e legivel.
- Padrao replicavel (mesmo molde do ticket boost) — facil de manter.

**Negativas:**
- Cinco dos seis indicadores sao proxies fracos (regex de nome / heuristica) — falsos
  positivos/negativos conhecidos (ex: `\bbr\b` em "Bradesco BR Series"). Mitigado por
  `confidence: 'weak'` + rotulo "estimado por nome".
- Thresholds/pesos/allowlist sao "calibracao v1" sem ground truth — podem precisar de ajuste.

**Neutras:**
- Allowlist sportsbook (Suprema dentro/fora) e decisao de produto pendente de aval do
  founder; v1 deixa Suprema fora.
- Sort/filtro por softness deferido (fase F.1) — esta fase so EXIBE.

## Confianca
**Alta** quanto a arquitetura (eixo separado e o padrao certo, espelha ADR-186, zero risco
para o scorer). **Media** quanto a calibracao dos 6 indicadores (proxies fracos + numeros
v1 sem ground truth) — explicitamente marcado como calibracao v1 e exibido com honestidade.

## Referencias
- Spec: `Docs/specs/sprint-fase-f-game-selection-2026-06-02.md`
- Spec base do selector: `Docs/specs/tournament-selector.md`
- ADR-015 (scoring linear vs ML — pesos/cold start calibrados)
- ADR-186 (ticket boost — camada ACIMA do scorer; molde replicado aqui §2.4)
- Diagrama: `Docs/architecture/diagrams/fase-f-game-selection/softness-flow.mermaid`
- Codigo de referencia: `server/scoring/buildScoringInput.ts` (`applyTicketBoost`/
  `enrichWithTickets`), `server/routes/tournament-selector.ts` (loop ~326-417),
  `server/scoring/timeOfDayBucket.ts`, `shared/platform-currency.ts`,
  `shared/scoring.ts` (`SelectorTournament`).

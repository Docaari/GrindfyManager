# Research Variance Math 2026-05-29

Pesquisa pra calibracao matematica do simulador Monte Carlo MTT em
`B:\grindfy\server\services\varianceEngine.ts`. Output: dados/formulas — sem
sugerir mudancas de codigo. Cada item lista source + extract concreto + nota
operacional pra decisao do dev.

---

## 1. PrimeDope original

### Sources
- Calculator UI ativo: https://www.primedope.com/tournament-variance-calculator/
- Legacy: https://www.primedope.com/tournament-variance-calculator-legacy-version/ (so redireciona)
- About: https://www.primedope.com/about/
- Cash variance (mesma familia de algoritmo): https://www.primedope.com/poker-variance-calculator/
- GipsyTeam guide (anatomia dos inputs): https://www.gipsyteam.com/poker/poker-variance-calculator
- Repo "inspirado" (Python): https://github.com/nfolinsb/stochastic-poker-models
- Formula RoR usada pelo PrimeDope: https://www.primedope.com/poker-risk-of-ruin-formula/

### Constantes / parametros expostos
- Metodo: Monte Carlo puro (nao closed-form). Status oficial "ongoing beta".
- Inputs do calc de torneio:
  - `players` (field size)
  - `places_paid` (NUMERO absoluto, nao percentual — o user informa)
  - `buy_in`, `rake %`
  - `ROI %` (ROI medio do jogador)
  - `tournament_quantity` (N de torneios na carreira simulada)
  - `sample_size` (qtd simulacoes Monte Carlo; "higher numbers = more accurate")
  - `bankroll` (opcional, pra RoR)
  - Payout structure (Standard / Flat / Top-Heavy — preset, nao expoem o alpha
    numerico)
- Output: 70% / 95% / 99.7% confidence bands + 20 sample paths + best/worst.

### Skill calibration
- **PrimeDope NAO expoe skill calibration explicito.** O proxy de skill e o
  proprio `ROI %` informado pelo user. Internamente, o que existe e um
  "uniform placement probability scaling" (confirmado pela ficha tecnica do
  MTTDB que clona o algoritmo — secao 3 abaixo):
  - `cost = B * (1 + R/100)`
  - `alpha_skill = (1 + R/100) * (1 + r/100)` (R = ROI%, r = rake%)
  - `P(paid_position_k) = alpha_skill / N`
  - O resto da massa de probabilidade (`1 - places_paid * alpha_skill / N`)
    vai para "eliminated unpaid".
- **Implicacao:** o "skill" e modelado como inflar uniformemente a chance de
  cair em QUALQUER posicao paga — nao distingue "skill empurra pra final
  table" vs "skill empurra pra min-cash". E o jeito ingenuo. (binary search
  por skill como o varianceEngine.ts atual faz e mais sofisticado.)

### Min cash multiplier / alpha power-law
- **Nao publicado.** O calculator usa 3 presets ("Standard", "Flat",
  "Top-Heavy") sem expor o expoente numerico.
- Fonte cruzada (gamblingcalc generator citando convencao da industria):
  - Standard ≈ exponent 1.4 (resulta em ~50/30/20 para top-3)
  - Top-Heavy ≈ exponent 2.2
  - Flat ≈ exponent ~1.0 (linear-ish)
- **Min cash payout** convencionalmente = `1.5x` a `2.0x` o buy-in pra MTTs
  vanilla. Sem source unica autoritativa; consenso 2+2/PokerStrategy.

### Codigo aberto?
- PrimeDope: fechado.
- Alternativa open-source: https://github.com/nfolinsb/stochastic-poker-models
  (Python, jupyter + streamlit). Foca em cash + BBJ + stake movement; tem
  modulo MTT mas a descricao publica nao detalha alpha/skill model — precisa
  abrir o `stochastic_poker_models.ipynb` direto pra inspecionar constantes.

---

## 2. ITM% real por site/buyin tier

### Sources
- GTO Wizard "How Payout Structures Impact ICM":
  https://blog.gtowizard.com/how-payout-structures-impact-icm/
- PokerStars Help "Tournament payout structures":
  https://www.pokerstars.net/help/articles/trn-payout-structure/10786/
- BeastsOfPoker 101 guide:
  https://beastsofpoker.com/poker-tournament-payout-structure/
- PokerScript framework:
  https://framework.pokerscript.net/quickstart-guide/mtt-payouts
- PokerStrategy MT-SNG payout:
  https://www.pokerstrategy.com/strategy/mtt/payout-structures-mt-sngs/

### Numeros concretos extraidos
- **PokerStars oficial (vago, sem tabela):** "varies by tournament type and
  number of entrants". Estrutura embedded no client lobby. Top-1 recebe
  "12-20% do prize pool" (NAO do field — atencao).
- **Industria — consenso multi-fonte:**
  - **Range tipico ITM:** **15-20% do field** (Standard structure)
  - **Range extremo:** **10-30% do field** (Flat structure ate 30%; Steep ate
    minimo de 10%)
  - **Bottom 30-40% do prize pool** vai pros 3 finalistas
- **PKO / Progressive KO / Bounty Hunter:** convencao = aproximadamente
  metade do prize pool vira bounty + metade vira pool tradicional. ITM% do
  pool tradicional cai pra ~10-15% (porque metade do dinheiro ja foi
  distribuido como bounty). Bounty Builder (PokerStars) e Bounty Hunters
  Series (GGPoker) seguem esse padrao 50/50.
- **Mystery Bounty:** estrutura ainda mais distorcida — top bounty pode ser
  >100x o avg. Distribuicao Pareto pura no bounty pool, alem do ITM% normal
  no regular pool. Ver
  https://worldpokerdeals.com/blog/mystery-bounty-tournaments

### Recomendacao operacional
- Hipotese atual hardcoded **15% e razoavel como default**, mas e o piso da
  banda Standard. Realista:
  - Default global: **15%**
  - Override por estrutura: **Flat=20-25%, Standard=15%, Steep/Hyper=10-12%**
  - Override PKO/Bounty: usar **half-pool ITM = ~10-12%** + tratar bounty
    como side-pool separada (variance distinta)
- Nao foi possivel achar tabela "field-size -> ITM%" publica. PokerStars
  internamente parece interpolar mas nao publica curva.

---

## 3. Risk of Ruin (RoR) formula pra MTT

### Sources
- Primedope formula page (Malmuth, single most-cited source):
  https://www.primedope.com/poker-risk-of-ruin-formula/
- MTTDB (clona algoritmo do PrimeDope):
  https://mttdb.com/poker-tools/mtt-variance-calculator/
- GamblingCalc scientific RoR (Malmuth formula):
  https://gamblingcalc.com/poker/scientific-risk-of-ruin-calculator/
- VIP-Grinders MC simulator:
  https://www.vip-grinders.com/poker-calculators/poker-variance-simulator/

### Formula closed-form (Malmuth 1987, derivada de Brownian motion)
```
RoR = exp(-2 * WR * BR / SD^2)
```
- `WR` = win rate em bb/100 (cash) OU ROI por torneio expresso como fracao
  do buy-in (MTT)
- `BR` = bankroll em bb (cash) OU em buy-ins (MTT)
- `SD` = std deviation em bb/100 (cash) OU std dev em buy-ins por torneio
  (MTT)
- Inverso (bankroll required pra ruin <= alpha): `BR = -SD^2 * ln(alpha) / (2*WR)`

### Examples publicados (Primedope, cash):
| Cenario | WR | BR | SD | RoR |
|---------|----|----|----|----|
| NL50 solid winner | 3 bb/100 | 5000 bb | 85 bb/100 | exp(-4.15) = **1.6%** |
| NL100 marginal | 1.5 bb/100 | 3000 bb | 90 bb/100 | exp(-1.11) = **32.9%** |
| PLO grinder | 4 bb/100 | 5000 bb | 140 bb/100 | exp(-2.04) = **13.0%** |

### Assumptions / Limitations
- **Tempo infinito** (steady-state Brownian)
- **WR e SD constantes** (sem skill drift, sem stake movement)
- **Distribuicao gaussiana** das observacoes — falso pra MTT (long-tail)
- WR <= 0 implica RoR = 100% (degenerado)

### Para MTT especificamente
- **PrimeDope, MTTDB, VIP-Grinders todos afirmam: closed-form e inadequada
  pra MTT.** Razoes:
  1. Distribuicao de retorno por torneio e fortemente skewed (long-tail no
     top, mass no zero) — viola gaussian assumption.
  2. SD em MTT e tipicamente **3-5x maior que cash games em buy-in units**
     (citacao Primedope).
  3. Bankroll discreto (buy-in steps) e nao continuo.
- **Padrao da industria pra MTT: Monte Carlo empirico:**
  ```
  RoR_MTT = (# simulacoes onde min(cumulative_profit) <= -BR) / N_sims
  ```
  Tipicamente N_sims >= 5000 (PrimeDope) ate 20000 (MTTDB) pra estabilidade.
- **Bill Chen / Jerrod Ankenman "Mathematics of Poker" (ConJelCo 2006), Cap
  22**: derivacao rigorosa from-first-principles. Confirma que o Malmuth
  closed-form e aproximacao Brownian e que MTT pede MC. Nao expoe alternativa
  closed-form especifica pra MTT.
- Termo "Sileo Chen" do prompt original: **nao achei tracos. Provavel
  confusao com "Bill Chen" (Chen formula = ranking de starting hands, nao
  RoR). Recomendo descartar a referencia.**

### Recomendacao operacional
- Manter Monte Carlo empirico (varianceEngine.ts ja faz).
- **Sanity check opcional:** computar tambem o Malmuth closed-form usando
  `EV_per_tourney = ROI * buy_in` e `SD_per_tourney = sigma_observado`.
  Comparar com MC — se divergencia > 30%, sinaliza que o skew distorceu o
  resultado (esperado, e ok); reportar so o MC.

---

## 4. Percentile interpolation methods

### Sources
- NIST handbook canonico: https://www.itl.nist.gov/div898/handbook/prc/section2/prc262.htm
- Analyse-it comparativo: https://analyse-it.com/blog/2013/2/quantiles-percentiles-why-so-many-ways-to-calculate-them
- Axibase: https://axibase.com/use-cases/workshop/percentiles.html
- Hyndman & Fan 1996 (canonico academico — citado no NIST e no Analyse-it)
- Excel docs: PERCENTILE.INC == R-7

### Formulas exatas

**Type 7 (R7) — Excel `PERCENTILE.INC`, numpy default, R default, pandas
default:**
```
h = (n - 1) * p + 1               // rank position, 1-based
k = floor(h)
d = h - k
Q(p) = x[k] + d * (x[k+1] - x[k]) // linear interpolation
```
- Bordas: p=0 -> x[1], p=1 -> x[n]. Sempre dentro do range observado.

**Type 6 (R6) — Minitab, SPSS, Excel `PERCENTILE.EXC`:**
```
h = (n + 1) * p
k = floor(h)
d = h - k
Q(p) = x[k] + d * (x[k+1] - x[k])
```
- Bordas: p < 1/(n+1) ou p > n/(n+1) -> indefinido (precisa extrapolar).

**Type 8 (R8) — Hyndman & Fan recomendam (median-unbiased):**
```
h = (n + 1/3) * p + 1/3
// resto identico
```

### Qual e o padrao
- **Finance / poker analytics / data science 2026: R7 dominante.** Razoes:
  1. E o default do Excel (PERCENTILE.INC), numpy.percentile, R quantile(),
     pandas .quantile(), Postgres percentile_cont. Compatibilidade.
  2. Sempre devolve valor no range observado (bom pra visualizacao).
- **Academia stat puro: R8.** Median-unbiased pra distribuicoes continuas.
- **NIST default oficial: R6**, mas o proprio handbook nota que R6/R7/R8 sao
  "fairly similar" pra uso pratico e advoga R8 como melhor teoricamente
  (Hyndman & Fan 1996).

### Recomendacao operacional
- Usar **R7** (PERCENTILE.INC). Justificativas: paridade com Excel/numpy
  (qualquer dev/founder validando no Excel obtem mesmo numero), simplicidade
  de impl, dentro-do-range (sem extrapolacao surpresa pra p=0 ou p=1).
- Fixar no codigo um teste de regressao: `quantile([1,2,3,4,5], 0.25) == 2.0`
  (R7) — distingue de R6 que daria 1.5.

---

## 5. Power-law alpha pra payout distribution MTT

### Sources
- Universal statistical properties of poker tournaments (Sire, 2007):
  https://arxiv.org/abs/physics/0703122 (PDF binario nao parseou via
  WebFetch; abstract acessivel)
- GamblingCalc payout structure generator (industria):
  https://gamblingcalc.com/poker/tournament-payout-structure-calculator/
- BeastsOfPoker guide: https://beastsofpoker.com/poker-tournament-payout-structure/
- USPTO patente "Increasing tournament pools and payout positions"
  (US 8449365): https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/8449365

### O que existe publicamente
- **Power-curve generator (GamblingCalc / convencao industria):**
  `payout(rank k) ∝ k^(-alpha)` com:
  - Standard: **alpha ≈ 1.4** (resulta em ~50/30/20 top-3)
  - Top-Heavy: **alpha ≈ 2.2**
  - Flat: **alpha ≈ 1.0** (linear-ish)
- Sire (2007) arxiv: documenta scaling universal da distribuicao de stacks
  durante MTT (independente do tempo durante most of the tournament),
  conexoes com "persistence problem" e "extreme value statistics". **Mas o
  paper foca em STACK distribution, nao PAYOUT distribution.** Nao extraiu
  alpha numerico pra payout. PDF binario nao parseou.

### Hipotese atual do projeto (do prompt do user)
- alpha=2.0 pra field<300
- alpha=1.7 pra 300-1000
- alpha=1.5 pra 1000-3000
- alpha=1.3 pra >3000

### Avaliacao critica
- **A direcao esta correta (alpha decresce com field size).** Razao
  intuitiva: fields maiores tem mais ITM positions, prize pool dilui mais
  uniformemente; fields menores concentram tudo no top.
- **Os numeros sao plausiveis mas NAO ha source publico que confirme essa
  curva especifica.** O range esta dentro do "1.0-2.2" empirico da industria.
- **Calibracao sugerida** (sem source que prove, e judgment call):
  - field<180 (SNG-MTT, low-stakes turbo): alpha ≈ 2.0-2.2 (top-heavy de
    fato)
  - 180-1000: alpha ≈ 1.6-1.8 (Standard PokerStars-ish)
  - 1000-3000: alpha ≈ 1.4-1.6
  - 3000-10000: alpha ≈ 1.2-1.4 (Sunday Million scale)
  - >10000 (WCOOP main, Bounty Builder massive): alpha ≈ 1.0-1.2 (quase
    linear na cauda paga)
- **PKO/Progressive KO impact:** half pool e bounty (distribuicao Pareto
  proxima alpha=1.0-1.5 nos bounties acumulados), half pool e regular ITM
  com **alpha tipicamente reduzido em ~0.2-0.4 vs vanilla equivalente**
  (porque metade do dinheiro ja saiu como bounty progressive, achata o
  resto). Sem source unico — judgment baseado em 2+2 threads + analise GTO
  Wizard.

### Recomendacao operacional
- Manter os 4 buckets atuais. Considerar adicionar bucket "<180" com
  alpha=2.0+.
- **Adicionar flag `isPKO` que aplica `alpha_effective = alpha - 0.3` no
  regular pool e modela bounty pool separado** (lognormal com mu calibrado
  pra avg_bounty, sigma alta).
- Documentar que valores sao "industry consensus, no peer-reviewed source"
  — ADR justifica.

---

## 6. Histogram bucket sizing pra long-tail MTT P&L

### Sources
- Wikipedia Histogram (formulas canonicas):
  https://en.wikipedia.org/wiki/Histogram
- Statology comparativo:
  https://www.statology.org/choosing-the-optimal-bin-size-for-your-histogram/
- Freedman-Diaconis deep dive:
  https://leanoutsidethebox.com/freedman-diaconis-rule/
- Grokipedia: https://grokipedia.com/page/Freedman%E2%80%93Diaconis_rule

### Formulas exatas
- **Sturges:** `k = ceil(log2(n)) + 1` (so bin count)
- **Square-root:** `k = ceil(sqrt(n))`
- **Rice:** `k = ceil(2 * n^(1/3))`
- **Scott (bin WIDTH):** `h = 3.49 * sigma_hat / n^(1/3)`
  - depois: `k = ceil((max-min) / h)`
- **Freedman-Diaconis (bin WIDTH):** `h = 2 * IQR(x) / n^(1/3)`
  - depois: `k = ceil((max-min) / h)`
- **Doane (Sturges com correcao de skew):**
  `k = 1 + log2(n) + log2(1 + |g1| / sigma_g1)` onde `g1` = skewness amostral
  e `sigma_g1 = sqrt(6*(n-2) / ((n+1)*(n+3)))`

### Performance em distribuicao skewed (consenso multi-fonte)
- **Sturges:** ruim. "Performs poorly with skewed data" (Wikipedia). Assume
  normal binomial. Pra n>200 subestima k mesmo em gaussiana. **NAO usar pra
  MTT.**
- **Scott:** otima sob gaussian; em skewed produz bins muito largos (porque
  sigma e inflado por outliers), perde detalhe no centro. **Marginal pra
  MTT.**
- **Freedman-Diaconis:** **vencedora pra MTT.** Razoes:
  1. Usa IQR (robusto a outliers — long-tail nao infla IQR)
  2. Convergencia teorica boa pra distribuicoes nao-normais
  3. Default do numpy.histogram_bin_edges
- **Doane:** boa segunda opcao se a impl precisar de bin count direto (sem
  IQR computation). Aplica correcao explicita de skewness.

### Edge cases pra MTT
- **n pequeno (<100 simulacoes):** todos os metodos sao instaveis. Fallback
  Sturges (`log2(n)+1`) ou Square-root (`sqrt(n)`).
- **n muito grande (>50000 MC samples) + extreme skew (bounty hits):** FD
  pode gerar 200+ bins, virando inutilizavel pra UI. Considerar cap em
  `k_max = 60` (UI-friendly) com fallback a Rice ou Sturges quando FD
  excede.
- **Bimodal/multimodal (caso PKO com bounty pool + regular pool):** FD
  ainda funciona melhor; nenhum classico lida bem. Astropy oferece Knuth /
  Bayesian Blocks (overkill pra UI MTT, mencionar so como follow-up).

### Recomendacao operacional
- **Default: Freedman-Diaconis** com:
  ```
  h = 2 * IQR / n^(1/3)
  k_raw = ceil((max - min) / h)
  k = clamp(k_raw, 10, 60)  // bounds pra UI
  ```
- **Fallback Sturges** se `n < 100` OU `IQR == 0` (degenerado).
- **NUNCA Scott como primario** em MTT — long-tail destroi o assumption.

---

## Resumo executivo (TL;DR)

| Topico | Decisao recomendada | Confianca |
|---|---|---|
| 1. PrimeDope alpha/skill | Sem source — manter binary-search atual (mais sofisticado que PrimeDope) | Alta |
| 2. ITM% default | 15% (Standard), parametrizar 10-25% por estrutura; -3-5pp pra PKO | Media |
| 3. RoR | Monte Carlo empirico (atual). Malmuth closed-form so como sanity check | Alta |
| 4. Percentile | R7 (PERCENTILE.INC / numpy default) | Alta |
| 5. Power-law alpha | Manter 4 buckets, considerar bucket <180 com alpha=2.0+, flag PKO `alpha -= 0.3` | Media-baixa (sem source acad) |
| 6. Histogram | Freedman-Diaconis `h = 2*IQR/n^(1/3)` com clamp [10, 60], fallback Sturges se n<100 | Alta |

### Notas finais
- **"Sileo Chen formula" mencionada no prompt: nao existe.** Provavel
  confusao com Bill Chen (Mathematics of Poker, ConJelCo 2006) — esse de
  fato discute RoR rigorosamente mas confirma Malmuth Brownian + endossa MC
  pra MTT.
- **PrimeDope nao publica suas constantes.** Qualquer "calibracao pra
  paridade com PrimeDope" e ingenharia reversa via inputs/outputs do site
  publico — viavel mas custoso. O varianceEngine.ts ja diverge
  intencionalmente (binary search skill, mais sofisticado).
- **Maior gap de dados: tabela "field size -> ITM% real" por site.** Nem
  PokerStars nem GGPoker publicam. Workaround: scrape do client lobby ou
  manter override manual por torneio.
- **PDF do Sire 2007 (arxiv physics/0703122) nao parseou via WebFetch
  (corrupted FlateDecode).** Pra extrair alpha de stack distribution
  empirico, baixar PDF manualmente e ler. Mas paper foca em STACK nao
  PAYOUT — utilidade marginal pro engine atual.

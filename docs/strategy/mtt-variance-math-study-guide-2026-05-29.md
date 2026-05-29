# Guia de Estudo — Matematica de Variancia MTT

**Data:** 2026-05-29
**Contexto:** Pesquisa feita pra ADR-215 (calibracao matematica do
`varianceEngine.ts`). Documento auto-contido para estudo posterior do founder.
**Referencias internas:**
- ADR completa: `Docs/architecture/decisions/215-variance-engine-math-calibration.md`
- Raw research: `memory/research_variance_2026-05-29.md`
- Engine: `server/services/varianceEngine.ts`

---

## Como ler este doc

1. **Se quer entender O QUE mudou no Grindfy** → pula pra §10 "Decisoes ADR-215 em 1 paragrafo cada"
2. **Se quer estudar fundamentos** → comeca §1 e segue ordem
3. **Se quer validar numeros no Excel** → §5 (percentiles) + §6 (histograma) tem formulas exatas
4. **Se quer ler papers/sources** → §11 lista todas as fontes

---

## §1. O que e Monte Carlo simulation pra MTT?

**Conceito:** rodar a sua grade simulada **N vezes** (10.000+), cada vez
sorteando aleatoriamente em que posicao voce termina em cada torneio (com
distribuicao calibrada pelo seu ROI alvo), e olhar a distribuicao dos
resultados.

**Por que MC, e nao formula fechada?**
- A distribuicao de profit/loss em MTT e **fortemente skewed** (long-tail no
  top: vitorias raras mas enormes; massa no zero/negativo: bustar antes do
  ITM eh o caso comum).
- Formulas fechadas (ex: Risk of Ruin Brownian) assumem **distribuicao
  gaussiana** — falsa pra MTT. Underestimate de cauda.
- MC e a maneira honesta de simular: cada torneio individual eh sorteado,
  somado, e a distribuicao emerge naturalmente.

**O que voce paga em troca:** custo computacional. 10K sims × 12 semanas ×
~1500 torneios = ~180M sorteios. Compensa: roda em ~500ms no server.

---

## §2. Os 5 inputs criticos do simulador

| Input | Significado | Sensibilidade |
|---|---|---|
| **buyIn** (USD) | Quanto custa cada torneio | Linear — escala tudo proporcionalmente |
| **field** (jogadores) | Tamanho medio do torneio | Quanto maior, mais skewed (top fica mais raro porem maior) |
| **ROI** (decimal) | Edge do jogador no longo prazo (0.10 = 10%) | Determina o "skill factor" calibrado |
| **count** | Quantos torneios desse bucket no periodo | Volume — variancia cai com √N (lei dos grandes numeros) |
| **isPKO** | Progressive Knockout? | Achata payout, reduz variancia geral |

**Insight #1:** dobrar o volume NAO dobra a variancia em USD. Variancia
escala com `sqrt(N)`. Por isso jogador profissional joga 1500 torneios/mes —
pra fazer o long-run "chegar mais rapido".

**Insight #2:** ROI declarado eh um **alvo** que o engine usa pra calibrar
um "skill factor" via binary search. Se ROI=15%, o engine acha qual skill `s`
faz a distribuicao convergir pra `EV = 1.15 × buyIn`. Se sua ROI real eh
diferente, a simulacao mente — entrada do GIGO ("garbage in, garbage out").

---

## §3. Power-law payout distribution — por que MTT eh top-heavy

**Padrao da industria:** o payout do torneio segue uma curva de potencia
(power-law) decaindo com a posicao:

```
payout(rank k) ∝ k^(-alpha)
```

Onde `alpha` controla quao "top-heavy" eh a distribuicao:

| Alpha | Nome | Top 1 / Top 3 / Min cash |
|---|---|---|
| **1.0** | Flat | distribuicao quase linear (raro) |
| **1.4** | Standard (PokerStars-default) | top1 ~ 18% pool, top3 ~ 40% |
| **2.2** | Top-Heavy (WSOP/turbo) | top1 ~ 25% pool, top3 ~ 50%+ |

**Calibracao no Grindfy** (varianceEngine.ts, sem source academico
peer-reviewed mas plausivel pelo consenso 2+2/PokerStrategy):

| Field size | Alpha base | Justificativa |
|---|---|---|
| <300 | 2.0 | Field pequeno = pool concentrado no top |
| 300-1000 | 1.7 | Standard "Sunday Million scale" |
| 1000-3000 | 1.5 | Standard MTT padrao |
| >3000 | 1.3 | Mass MTT — pool dilui mais |

**Ajuste PKO:** `alpha_PKO = max(0.8, alpha - 0.3)`. Metade do prize pool
vira bounty progressive (distribuicao Pareto pura), achata o regular pool em
~0.3 no expoente.

**Min cash piso:** todo payout >= **1.5x buy-in**. Garantia de que ITM nao
paga "praticamente nada" (irrealistico — todo site paga pelo menos 1.5-2x).

---

## §4. ITM% — quem entra no dinheiro

**Default Grindfy:** 15% do field (`placesPaid = round(field * 0.15)`).

**Range realista da industria:**
- **Standard:** 15-20% do field (PokerStars default, GGPoker default)
- **Flat structure:** 20-25% (mais ITM, payouts menores em media)
- **Steep/Turbo:** 10-12% (menos ITM, mais top-heavy)
- **PKO/Bounty:** ~10-12% no pool regular (metade ja virou bounty)
- **Mystery Bounty:** ITM% normal + bounty pool com **distribuicao Pareto
  pura** (top bounty pode ser 100x o avg).

**No engine (ADR-215 D6):** parametrizavel por bucket via `placesPaidPct`
opcional. Default 0.15 mantem back-compat.

**Maior gap de dados que NAO existe publicamente:** tabela "field-size → ITM%
real" por site. Nem PokerStars nem GGPoker publicam.

---

## §5. Percentiles — entendendo P15, P85, P99.85

**Definicao:** o **P-esimo percentile** eh o valor abaixo do qual P% das
simulacoes caem.

| Percentile | Significado pratico |
|---|---|
| P50 (mediana) | Cenario tipico — metade dos sims pior, metade melhor |
| P15 / P85 | Faixa onde 70% dos sims caem (1σ se gaussian) |
| P2.5 / P97.5 | Faixa onde 95% dos sims caem (2σ) |
| P0.15 / P99.85 | Faixa onde 99.7% dos sims caem (3σ) — extremos |

**Formula NIST R7 (ADR-215 D1, igual a Excel `PERCENTILE.INC` e numpy):**

```
Dado: array ordenado x[0..n-1], p ∈ [0, 100]

h = (n - 1) * p / 100
k = floor(h)
d = h - k

Q(p) = x[k] + d * (x[k+1] - x[k])   // interpolacao linear
```

**Exemplo:** `percentile([1,2,3,4,5], 25)`:
- h = (5-1) * 0.25 = 1.0
- k = 1, d = 0
- Q = x[1] + 0 * (x[2] - x[1]) = 2

**Por que NAO usar `Math.floor` simples?** Em N=10K sims, p99.85 = idx 9985.
Floor pega exatamente esse valor; interpolacao R7 retorna media ponderada
entre 9984 e 9985. Diferenca pequena em magnitude mas critica em compatibilidade
com Excel/numpy (founder pode validar manualmente).

**Mediana ROI (ADR-215 D4):**
- `mean ROI = ev / totalInvested`
- `median ROI = p50 / totalInvested`
- Em distribuicao skewed (MTT), **mean > median sempre**. Mediana revela
  cenario tipico; mean revela esperanca matematica.

---

## §6. Risk of Ruin (RoR) — quando bankroll quebra?

**Definicao:** probabilidade de em algum momento durante o periodo simulado,
o seu profit cumulativo cair abaixo de **-bankroll** (i.e., voce vai a zero).

**Formula closed-form de Malmuth (1987):**

```
RoR = exp(-2 * WR * BR / SD²)
```

Onde:
- WR = win rate (ROI por torneio, em USD)
- BR = bankroll em USD
- SD = desvio padrao por torneio, em USD

**Exemplo (cash games, Malmuth):**

| Cenario | WR | BR | SD | RoR |
|---|---|---|---|---|
| NL50 solid winner | 3 bb/100 | 5000 bb | 85 bb/100 | exp(-4.15) = **1.6%** |
| NL100 marginal | 1.5 bb/100 | 3000 bb | 90 bb/100 | exp(-1.11) = **32.9%** |

**Por que NAO usar essa formula pra MTT?**
1. Assume distribuicao **gaussiana** — MTT eh long-tail (viola)
2. Assume **tempo infinito** — voce so joga 10K torneios na vida (finito)
3. SD em MTT eh **3-5x maior** que cash em buy-in units (Primedope)
4. Bankroll discreto (buy-in steps), nao continuo

**Padrao da industria pra MTT (Primedope, MTTDB, Chen-Ankenman):**

```
RoR_MTT = (# simulacoes onde min(cumulative_profit) <= -BR) / N
```

Conta empiricamente quantas das N simulacoes tocaram o piso `-BR` em algum
momento. Sem assumption gaussian. Captura long-tail naturalmente.

**No Grindfy (ADR-215 D2):** opt-in via `bankrollUsd` no input. Engine
rastreia `minCum` por simulacao, conta ruin. Reporta `pct` + `ruinSims /
totalSims` no card UI.

**Nota:** "Sileo Chen formula" mencionada em uma pesquisa anterior **nao
existe**. Provavel confusao com **Bill Chen** (Mathematics of Poker, 2006,
ConJelCo). Bill Chen confirma Malmuth Brownian e endossa MC pra MTT.

---

## §7. Histograma — como visualizar a distribuicao

**Problema:** dado 10K resultados, em quantos baldes (buckets) quebra pra
plotar?

**Regras canonicas:**

| Regra | Formula | Quando usar |
|---|---|---|
| **Sturges** | `k = ceil(log2(n)) + 1` | n<100 (small sample) |
| **Square-root** | `k = ceil(sqrt(n))` | rule-of-thumb generico |
| **Scott** | `h = 3.49σ / n^(1/3)` | gaussian distribution |
| **Freedman-Diaconis** | `h = 2·IQR / n^(1/3)` | **skewed (MTT!) — robusto a outliers** |
| **Doane** | sturges + correcao skewness | alternativa FD pra small n |

**Por que Freedman-Diaconis (FD) vence em MTT?**
- Usa **IQR** (interquartile range), nao sigma — IQR e robusto a outliers
- Long-tail nao infla IQR (so move os percentiles extremos), entao bin
  width fica realista
- Default do `numpy.histogram_bin_edges`

**No Grindfy (ADR-215 D5):**
```
h = 2 * IQR / n^(1/3)
k_raw = ceil(range / h)
k = clamp(k_raw, 10, 60)   // UI-friendly
```

Clamp [10, 60] evita extremos: FD pode gerar 200+ buckets em N=50K com
extreme skew (bounty hits) — vira inutilizavel pra UI.

---

## §8. Variance scaling — lei dos grandes numeros aplicada

**Insight central:** variancia em USD escala com `sqrt(N)`. Volume eh o
amigo do jogador profissional.

**Exemplo:**
- 1 torneio: SD = $200, EV = $30 → SD/EV = 6.7 (variancia domina)
- 100 torneios: SD = $200·sqrt(100) = $2000, EV = $30·100 = $3000 → SD/EV = 0.67
- 1500 torneios/mes: SD = $200·sqrt(1500) ≈ $7700, EV = $3000·1500 = $45K →
  SD/EV = 0.17

Por isso pros jogam alto volume: nao melhora o ROI, **melhora a
confiabilidade do ROI realizado vs ROI teorico**.

**No engine:** EV CI95 (ADR-215 D3) mostra exatamente isso:
```
stdErr = SD / sqrt(N)
EV ± 1.96 * stdErr   (95% CI normal — CLT)
```

Quanto mais sims (N), menor o intervalo de incerteza no EV reportado.

---

## §9. Drawdown — pior queda no caminho

**Definicao:** `drawdown(t) = peak(0..t) - profit(t)`. Maior gap entre o
maior valor ja atingido e o valor atual.

**Por que importa:** EV+30K no final do mes nao adianta se voce **passou
por -15K na semana 2** e teve que parar de jogar/pegar emprestimo.

**No engine atual:** rastreia drawdown **semanal** (granularidade dos
`weekProfits[]`). Calcula:
- `drawdown.median`: queda tipica
- `drawdown.p95`: caso ruim 1-em-20
- `drawdown.p99`: caso ruim 1-em-100
- `drawdown.worst`: pior caso entre todas as sims

**Limitacao (ADR-215 D9, DEFERIDA):** sessao real intra-semana pode ter
swings de 5-10 buy-ins em horas. Granularidade semanal subestima DD real.
Implementacao futura: split count em sessoes via `sessionsPerWeek`.

---

## §10. Decisoes ADR-215 em 1 paragrafo cada

| ID | Decisao | Por que |
|---|---|---|
| **D1** | Percentile NIST R7 (linear interp) | Paridade Excel/numpy; founder valida manualmente |
| **D2** | Risk of Ruin = MC empirico (opt-in via bankrollUsd) | Malmuth closed-form invalida pra MTT (long-tail) |
| **D3** | EV CI95 = ±1.96·σ/√N | EV eh estimativa MC, comunicar precisao real |
| **D4** | ROI mean + median lado a lado | Skew revelado; mediana eh cenario tipico |
| **D5** | Histogram Freedman-Diaconis com clamp [10,60] | IQR robusto a outliers MTT long-tail |
| **D6** | placesPaidPct override por bucket (default 0.15) | Estruturas variam 10-25% por site |
| **D7** | rakePct informativo por bucket (totalRakeUsd no output) | Transparencia; calibration futura |
| **D8** | PKO alpha -= 0.3 (com floor 0.8), nao *= 0.65 | Convencao industria; 0.65 colapsava demais |
| **D9** | Intra-week drawdown — **DEFERIDA sprint VR-4** | Mudanca de schema + UI nova, escopo separado |

---

## §11. Sources — bibliografia primaria

### Calculadoras e papers
- [PrimeDope variance calculator](https://www.primedope.com/tournament-variance-calculator/) — referencia da industria, codigo fechado
- [PrimeDope RoR formula (Malmuth)](https://www.primedope.com/poker-risk-of-ruin-formula/)
- [MTTDB MTT Variance Calculator](https://mttdb.com/poker-tools/mtt-variance-calculator/) — clone PrimeDope, **expoe formulas**
- [Sire 2007 — Universal statistical properties of poker tournaments (arxiv)](https://arxiv.org/abs/physics/0703122) — stack distribution
- [stochastic-poker-models (GitHub, Python)](https://github.com/nfolinsb/stochastic-poker-models) — open-source alternativa

### Statistics canonicos
- [NIST handbook — Percentile types](https://www.itl.nist.gov/div898/handbook/prc/section2/prc262.htm)
- [Hyndman & Fan 1996 — Sample quantiles in statistical packages](https://www.tandfonline.com/doi/abs/10.1080/00031305.1996.10473566)
- [Wikipedia — Histogram (Freedman-Diaconis, Sturges, Scott)](https://en.wikipedia.org/wiki/Histogram)

### Poker industry primers
- [GTO Wizard — How Payout Structures Impact ICM](https://blog.gtowizard.com/how-payout-structures-impact-icm/)
- [BeastsOfPoker payout 101](https://beastsofpoker.com/poker-tournament-payout-structure/)
- [PokerScript framework MTT payouts](https://framework.pokerscript.net/quickstart-guide/mtt-payouts)
- [PokerStrategy MT-SNG payouts](https://www.pokerstrategy.com/strategy/mtt/payout-structures-mt-sngs/)

### Livros
- Bill Chen & Jerrod Ankenman — **Mathematics of Poker** (ConJelCo 2006), cap 22 (RoR rigoroso)
- Mason Malmuth — **Gambling Theory and Other Topics** (1987) — formula RoR original

---

## §12. Glossario rapido

| Termo | Definicao curta |
|---|---|
| **Bankroll** | Capital total dedicado a poker |
| **Bust** | Eliminacao do torneio (zero stack) |
| **EV** (Expected Value) | Valor esperado matematico no longo prazo |
| **Edge** | Vantagem do jogador sobre o field |
| **Field** | Numero total de jogadores no torneio |
| **ITM** (In The Money) | Posicoes pagas (top 15% tipico) |
| **Knockout / Bounty** | Recompensa por eliminar um jogador (pool separado) |
| **Long-tail** | Distribuicao com cauda longa e fina (raros eventos extremos) |
| **MC** (Monte Carlo) | Simulacao por amostragem aleatoria repetida |
| **MTT** (Multi-Table Tournament) | Torneio multi-mesa com prize pool centralizado |
| **PKO** (Progressive KO) | Bounty que cresce a cada eliminacao acumulada |
| **RoR** (Risk of Ruin) | Prob. de quebrar a bankroll antes do longo prazo chegar |
| **ROI** (Return on Investment) | (Profit / Buy-in) × 100% |
| **SD** (Standard Deviation) | Sigma, dispersao tipica em torno do EV |
| **Skewness** | Assimetria da distribuicao (MTT eh positively skewed) |

---

## §13. Proximos passos sugeridos pra estudo

1. **Validar percentile R7 no Excel** — abrir uma sim no Grindfy, exportar
   os resultados raw (futuro: feature export CSV), rodar `PERCENTILE.INC` no
   Excel, comparar com o que o engine reporta. Devem casar 6+ casas
   decimais.

2. **Sensibilidade do PKO alpha (D8)** — comparar duas sims identicas mas
   uma vanilla outra PKO, ver gap nos percentiles + EV. Calibrar contra
   torneios reais que voce ja jogou (analise post-hoc).

3. **Risk of Ruin tuning** — testar bankroll = 50, 100, 200 buy-ins
   medios. Industria sugere **100 BIs pra MTT regular**, **200 BIs pra alto
   stake**. Ver RoR pelo engine, confirmar/desafiar.

4. **Intra-week DD (D9 deferida)** — quando schedule for plano,
   implementar `sessionsPerWeek`. Comparar antes/depois: provavelmente
   `drawdown.p95` vai aumentar 30-50% (subestimacao real do engine atual).

5. **Calibracao ITM% real** — coletar dados de 50 torneios reais (PokerStars
   Sunday Million + GGPoker Bounty Hunters + WPN Venom). Verificar se ITM%
   real bate 15% ou se precisa override no engine.

6. **Ler Bill Chen cap 22** — Mathematics of Poker, ConJelCo 2006. Material
   denso mas eh O texto de referencia pra RoR rigoroso. Vale como base
   teorica.

---

## Notas finais

- Este doc cobre a matematica do **simulador de variancia**, nao o solver
  GTO nem o ICM. Sao 3 ferramentas matematicas distintas no ecossistema
  poker.
- Toda decisao "judgment call" esta marcada com confidence low/medium —
  futuras revisoes podem refinar com dados reais do Grindfy (post-AI-2A,
  quando temos `analyze_variance` tool rodando sobre o historico de
  uploads).
- "Mais entendimento matematico" pedido pelo founder foi traduzido em **8
  decisoes especificas (D1-D8) + 1 deferida (D9)**, todas justificadas e
  testadas.

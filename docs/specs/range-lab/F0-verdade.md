# F0 — Verdade

> Frente 0 de 5 do [Range Lab](00-INDICE.md). Uma frente por sessao.

## Cabecalho
| | |
|---|---|
| **Modelo** | Opus 5 — Alto |
| **Depende de** | nada |
| **Entrega** | 7 correcoes na Calculadora de Combos |
| **Migration** | nao |
| **Feature nova** | nenhuma |
| **Status** | **Concluida** 2026-08-16 — 201/201 verdes, `tsc` 0 |

Esforco `Alto` e nao `Extra` porque o diagnostico ja esta feito e cada sintoma
esta medido. Se aparecer divergencia nao prevista durante a implementacao, subir
para `Extra` antes de reescrever o prompt (`04-modelo-e-esforco.md`).

## Contexto minimo (para abrir a frio)
A Calculadora de Combos (`/calculadoras` aba "Combos") calcula, dado bordo + mao
do heroi + range do vilao + aposta, se pagar no river e +EV. O nucleo matematico
esta correto — card removal exato, avaliador proprio, pot odds. O que esta
quebrado sao seis pontos perifericos, dois deles mostrando **numero errado com
cara de certo**.

Arquivos que importam:
- [`client/src/lib/combo-calc/`](../../../client/src/lib/combo-calc/) — nucleo puro, client-only.
- [`CombosCalculator.tsx`](../../../client/src/components/calculators/CombosCalculator.tsx) — UI, 955 linhas.
- `tests/unit/combo-calc/` — 85 testes verdes. Rodar: `npx vitest run tests/unit/combo-calc`.

Regra que rege esta frente: `00-produto.md` — **numero errado perde para numero
ausente**. Onde nao da para acertar, some com o numero; nao chuta.

---

## RF-00.1: Slider de sensibilidade correto em turn e flop
**Sintoma medido.** Bordo `Ad 8h 4h 2c`, heroi `As 6s`, range `A7s, 76s, KK`:

```
evaluateSpot(spot).heroEquity        = 77,38%
heroEquityAtMultiplier(spot, k = 1)  = 82,45%
```

O multiplicador `k = 1` e neutro — os dois numeros tem que ser identicos. Sao
5,07 pontos percentuais de diferenca com o slider parado no meio.

**Causa.** [evaluateSpot.ts:148-156](../../../client/src/lib/combo-calc/evaluateSpot.ts#L148)
acumula `w * equity` so no bucket `win` e `w * (1 - equity)` so no bucket `lose`.
Fora do river a equity de um combo nao e 0/0,5/1, entao a fracao perdida de um
combo vencedor e a fracao ganha de um combo perdedor somem da conta, e o
denominador deixa de ser a massa total.

**Regras:**
- Equity ponderada e sempre `soma(w * eq) / soma(w)`, em qualquer street.
- `heroEquityAtMultiplier(spot, 1)` devolve exatamente
  `evaluateSpot(spot).heroEquity` nos tres streets. **Este e o teste que blinda a
  regressao.**
- A funcao passa a receber o `Verdict` ja calculado em vez de chamar
  `evaluateSpot` internamente ([evaluateSpot.ts:143](../../../client/src/lib/combo-calc/evaluateSpot.ts#L143)),
  eliminando a reexecucao do pipeline inteiro a cada tick do slider.

## RF-00.2: Range sem massa nao produz veredito
**Sintoma medido.** Range com uma unica classe `KK` em frequencia 0:

```
{ heroEquity: 0, decision: "fold", totalCombos: 0, emptyEntries: [] }
```

A tela mostra banner vermelho "FOLD (-EV) / 0.0% / EV do call: -13.8 fichas". O
aviso de classes zeradas nao dispara, porque os combos existem — so tem peso 0.

**Regras:**
- Massa total ponderada zero: `evaluateSpot` devolve veredito sem decisao e com
  razao nomeada `empty_range`. Nunca `fold` com equity 0.
- UI troca o banner por empty state: "Range sem combos com peso — ajuste as
  frequencias". Padrao da secao 6 do `Docs/conventions/ui-patterns.md`.
- Vale tambem quando o card removal mata tudo (todas as classes em
  `emptyEntries`).
- O spot deixa de ser considerado valido enquanto isso durar
  ([CombosCalculator.tsx:332](../../../client/src/components/calculators/CombosCalculator.tsx#L332)
  hoje so checa `entries.length > 0`).

## RF-00.3: Notacao `+` com carta adjacente sobe o gap
**Sintoma medido.**
```
expandRangeToken("98s+") -> ["98s"]
expandRangeToken("54s+") -> ["54s"]
expandRangeToken("T9o+") -> ["T9o"]
```

Quem cola um range de solver com conectores perde parte do range **em silencio** e
o veredito sai errado.

**Causa.** [combos.ts:188-199](../../../client/src/lib/combo-calc/combos.ts#L188)
so implementa "carta alta fixa, kicker sobe". Quando o kicker ja e `alta - 1`, o
laco produz um unico elemento.

**Regras:**
- Convencao PokerStove/Equilab: `XYs+` com `Y = X - 1` (conector) sobe **as duas
  cartas** preservando o gap. `98s+` = `98s, T9s, JTs, QJs, KQs, AKs`.
- `XYs+` com gap maior mantem o comportamento atual. `ATs+` = `ATs, AJs, AQs,
  AKs`. **Nao regride** — ha teste existente.
- Vale para `s` e `o`.
- `AKs+` continua devolvendo `["AKs"]` (nao gera par). Teste existente.
- Adicionar `AXs` / `KXo` (qualquer kicker) e `XX` (todos os pares). Hoje `AXs`
  devolve `[]` sem avisar.

**Gramatica alvo (emenda A11, [F5](F5-mindriver.md)).** O MindRiver aceita, num
parser so: `AA`, `AKs`, `AKo`, `AK`, `77+`, `A5s+`, `55-TT`, `T9s-54s`, `AsKh`,
`AQo:0.5`, `AQo:50%`, `top 25%`. A F0 entrega o `+` correto e o percentual
(RF-00.6); **intervalo** (`55-TT`, `T9s-54s`), **combo especifico** (`AsKh`) e
**`top X%` como token** ficam para a F2 (RF-02.4 / RF-02.5). Quem tocar no parser
aqui deixa o caminho aberto para eles em vez de fechar a gramatica em volta do
que a F0 precisa.

## RF-00.4: Spots salvos sanitizados por item
**Sintoma.** [persistence.ts:112](../../../client/src/lib/combo-calc/persistence.ts#L112)
valida so `Array.isArray` do conjunto; item nenhum e checado. O render faz
`s.board.join(" ")` em [CombosCalculator.tsx:742](../../../client/src/components/calculators/CombosCalculator.tsx#L742).
Um item corrompido com `board` string derruba a pagina (TypeError). Mesma classe
do HIGH-1 ja corrigido para o rascunho, esquecida nos spots salvos.

**Regras:**
- `loadSavedSpots` valida item a item e descarta invalidos, reaproveitando
  `sanitizeEntry` / `deserializeState`.
- `loadSpot` usa os campos **saneados** (`r.potInput`), nao os crus
  ([CombosCalculator.tsx:315-317](../../../client/src/components/calculators/CombosCalculator.tsx#L315)).
- Estado ilegivel some em silencio; nao derruba a tela.

## RF-00.5: "Combos vencedores necessarios" coerente fora do river
**Sintoma medido (turn).** A tela mostra `W = 9` (bucket discreto) ao lado de
`wNeeded = 0,95` (massa efetiva), e o texto "vilao precisa estar blefando ~11% da
frequencia atual". Tres numeros de bases diferentes na mesma linha.

**Regras:**
- Fora do river, o bloco "Quanto falta" e o texto de break-even usam a **mesma
  base** do veredito: massa efetiva. O `W` exibido no bloco tambem.
- O bucket discreto continua existindo para a contagem de combos, rotulado como
  contagem — nao como base de calculo.
- Fora do river a UI declara: "equity por enumeracao de runouts — ganha/perde/chop
  e a categoria dominante, nao o resultado final".

## RF-00.6: Frequencia importada normalizada
**Sintoma.** `AKo:50` no import guarda `frequency = 50`. A tela exibe "5000%" e a
opacidade da celula estoura. O clamp so acontece la no fundo, em
`comboFrequency`.

**Regras:**
- Normalizar na fronteira do import
  ([CombosCalculator.tsx:271](../../../client/src/components/calculators/CombosCalculator.tsx#L271)):
  valor `> 1` e lido como percentual e dividido por 100; `> 100` e recusado com
  aviso visivel, nao truncado em silencio.
- `clampFreq` continua como ultima linha de defesa.

## RF-00.7: Estados mudos ganham voz
- Carta duplicada (`DuplicateCardError`) hoje zera o veredito sem dizer nada
  ([CombosCalculator.tsx:349](../../../client/src/components/calculators/CombosCalculator.tsx#L349)).
  Passa a dizer qual carta esta repetida.
- Clique em carta com bordo cheio nao faz nada
  ([CombosCalculator.tsx:199-213](../../../client/src/components/calculators/CombosCalculator.tsx#L199)).
  Passa a alternar o alvo ou informar "bordo completo".

---

## Criterios de aceite
1. `heroEquityAtMultiplier(spot, 1) === evaluateSpot(spot).heroEquity` nos tres
   streets, tolerancia `1e-9`.
2. Range com massa zero nunca produz `decision: "fold"`.
3. `98s+` -> 6 notacoes, `54s+` -> 10, `T9o+` -> 5. `ATs+` -> 4 (inalterado).
   (O rascunho dizia `T9o+ -> 4`; contradizia a regra declarada logo acima. Pela
   convencao "conector sobe as duas cartas ate o topo" a contagem e sempre
   `13 - idx(carta alta)`: `98s+` = 13-7 = 6, `54s+` = 13-3 = 10, `T9o+` =
   13-8 = 5 — `T9o, JTo, QJo, KQo, AKo`. Corrigido em 2026-08-04.)
4. `loadSavedSpots` com item corrompido devolve os validos e nao lanca.
5. `npx vitest run tests/unit/combo-calc` verde (85 atuais + novos).
6. `npm run check` limpo.

## O que de fato saiu (2026-08-16)

Os 7 RFs entraram inteiros. Contratos novos que a F1 herda:

| Onde | O que mudou |
|---|---|
| `types.ts` | `Verdict.decision: Decision \| null` + `degradedReason: "empty_range" \| null` + `totalWeight` / `wEff` / `lEff` |
| `evaluateSpot.ts` | `heroEquityAtMultiplier(Spot \| Verdict, k, subset?)` — equity ponderada e sempre `soma(w*eq)/soma(w)`; aceita o `Verdict` pronto para nao reexecutar a enumeracao de runouts a cada tick |
| `evaluateSpot.ts` | `verdictCalcBasis(verdict)` — `discrete` no river, `effective` fora dele (D10) |
| `evaluateSpot.ts` | `tryEvaluateSpot(spot)` — `{ verdict, error }`; erro que nao e carta duplicada continua subindo |
| `combos.ts` | `RANGE_TOKEN_RULES` — tabela ordenada, aberta para a F2 (D9) |
| `persistence.ts` | `sanitizeSavedSpot` / `hydrateSpot`; `loadSavedSpots` saneia item a item |
| `uiRules.ts` (novo) | `parseImportedFrequency`, `resolveCardClick`, `describeSpotReadiness` — regras de tela como funcoes puras |

### Divergencia nao prevista, achada durante a F0 — `breakevenFrequency`

O RF-00.5 corrigiu a **base** (massa efetiva em vez do bucket discreto), mas o
`breakevenFrequency` vem de outro **modelo**, e fora do river os dois nao sao a
mesma funcao de `k`:

- fechado (`computeEv`): `E(k) = k*wEff / (k*wEff + lEff)`
- slider (real): `E(k) = (k*wEffVenc + wEffOutros) / (k*Wvenc + Woutros)`

Escalar o peso de um combo vencedor move o numerador **e** o denominador, porque
esse combo carrega a propria fracao perdedora. No river a equity de cada combo e
0/0,5/1 e as duas expressoes coincidem exatamente. Fora dele, nao:

| street | break-even mostrado | k real do slider | equity no k mostrado (alpha 52,56%) |
|---|---|---|---|
| flop | 0,4185 | **0,1958** | 63,14% |
| turn | 0,3240 | **0,2294** | 59,38% |
| river | 0,9234 | 0,9234 | 52,56% (exato) |

**O que a F0 fez:** o valor de `breakevenFrequency` esta fixado pelo teste
(`f0-combos-basis.test.ts` exige `wNeeded / basis.W` nos tres streets) e o
implementer nao mexe em teste. Entao a F0 **tirou o numero da tela fora do
river** e mandou o jogador no slider, que agora e exato — numero ausente vence
numero errado. No river a frase continua igual.

**O que fica para a F2** (dona das ferramentas de range/frequencia): um solver
numerico do ponto de virada — bissecao sobre `heroEquityAtMultiplier`, que ja
recebe o `Verdict` pronto e nao reenumera runout. Oraculo de validacao de graca:
no river o resultado tem que bater com o `breakevenFrequency` fechado ate `1e-9`
(medido: 0,9234 nos dois). Ver [F2 RF-02.6](F2-range-builder.md).

Duas observacoes que valem para quem abrir a F1 a frio:

1. **`T9o+` sao 5 mãos, nao 4.** O criterio de aceite 3 ja tinha sido corrigido no
   texto em 2026-08-04; o test-writer chegou na mesma conclusao por conta propria
   e travou a regra (`13 - idx(carta alta)`), nao o numero solto.
2. **Massa zero nao apaga `evCall`.** O `Verdict` continua carregando `evCall` e
   `equityGap` calculados — um teste do baseline exige `Number.isFinite(evCall)`.
   O portao e `decision: null` + `degradedReason`, e e ele que a UI le. Quem
   consumir `evCall` sem olhar `decision` volta a exibir o numero fantasma.

## Fora de escopo desta frente
Qualquer feature nova. Sem pagina nova, sem heroi-como-range, sem atalhos, sem
ICM. F0 so devolve a verdade ao que ja existe.

---

## HANDOFF — ao concluir a F0

### Confira voce mesmo (5 min, no `:3000` reiniciado)
Aba `/calculadoras` -> **Combos**.

1. **Slider nao pula mais.** Monte um bordo de **4 cartas** (turn), sua mao e um
   range qualquer. Olhe a equity do banner. Agora arraste o slider de
   sensibilidade ate `100%`. O numero embaixo tem que bater **exatamente** com o
   do banner. Antes pulava ~5 pontos.
2. **Range vazio nao manda foldar.** Coloque uma unica mao no range e puxe a
   frequencia dela para **0%**. Tem que aparecer "range sem combos com peso" —
   nao um FOLD vermelho de 0%.
3. **Conector importa inteiro.** Cole `98s+` no campo de importar. Tem que entrar
   **6 mãos** (98s ate AKs). Antes entrava 1. Cole `ATs+` tambem: 4 mãos, como
   sempre foi.
4. **Percentual no import.** Cole `AKo:50`. Tem que virar 50%, nao 5000%.
5. **Nada quebrou.** Salve um spot, recarregue a pagina, abra o spot salvo. Tudo
   volta igual.
6. **Break-even nao contradiz o slider** (item novo — o reviewer notou que os 5
   acima passavam mesmo com o defeito). No **river**, arraste o slider ate o
   percentual que o texto de break-even anuncia: a equity ali tem que encostar no
   alpha. No **turn e no flop**, o numero fechado nao deve mais aparecer — no
   lugar dele fica a frase mandando usar o slider. Se um numero de break-even
   reaparecer fora do river, algo regrediu.
7. **Frequencia com virgula.** Cole `AKo:0,5`. Tem que entrar como 50%, nao como
   0% com um aviso solto de "5".

Se qualquer um falhar, nao siga para a F1.

### Pendencias conhecidas ao fechar a F0 (nao bloqueiam a F1)
- **Sem teste de wiring.** Os 201 testes cobrem as funcoes puras; nao ha nenhum
  `.test.tsx` para `CombosCalculator`. Os `data-testid` ja estao plantados
  (`combos-empty-state`, `combos-empty-range`, `combos-duplicate-card`,
  `combos-import-warnings`, `combos-card-notice`) — falta o test-writer usar.
  Risco ja conhecido do projeto (`memory/session_2026-04-27-tts-wiring`: unit
  verde + zero integracao = quebrado em producao). Vai para a F2, que reabre a UI.
- **`Verdict` degradado carrega numeros mortos.** Ver D8 no indice: e decisao
  consciente (teste do baseline exige `evCall` finito), nao esquecimento. A F1 e a
  F4, que levam o `Verdict` para worker/export/Coach, tem que checar
  `decision != null` antes de ler qualquer numero.

### Prompt da proxima sessao

Frente seguinte: **F1 — Motor**.
Modelo: **Opus 5 — Extra**.

```
Frente F1 do Range Lab. Leia Docs/specs/range-lab/00-INDICE.md e
Docs/specs/range-lab/F1-motor.md antes de qualquer coisa.

F0 esta concluida e verificada. Comece pelo ADR da F1 (avaliador bitmask,
contrato do worker, modelo v2 de Spot com heroRange), depois siga o pipeline
TDD: system-architect -> test-writer -> implementer -> reviewer.

Nao delete o avaliador atual: ele e o oraculo de teste (decisao D4).
```

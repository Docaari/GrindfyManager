# F3b — Aritmetica da decisao

> Sub-frente da [F3](F3-leitura.md), no [Range Lab](00-INDICE.md). Uma frente por
> sessao. O **porque** de cada decisao esta em
> [F3-detalhamento.md](F3-detalhamento.md); este documento e o **o que fazer**.

## Cabecalho
| | |
|---|---|
| **Modelo** | Opus 5 — Alto |
| **Depende de** | F1 (motor). **Nao** depende da F3a — nenhum RF daqui usa `classify.ts` |
| **Entrega** | Tres paineis que respondem "de onde veio esse numero" e "quanto ele precisa blefar" |
| **Migration** | nao |
| **Status** | Nao iniciada |

Zona critica: **nenhuma** das sete de `.claude/rules/04-modelo-e-esforco.md`. Mas
o achado F-1 (abaixo) e do tipo "numero errado que nao parece errado", que a
`00-produto.md` poe acima de tudo — por isso `Alto` e nao `Medio`.

---

## Contexto minimo (para abrir a frio)

`/range-lab` calcula a equity do range do heroi contra o do vilao e diz
call/fold. O que falta e a **conta por tras**: quanto do range do vilao morreu
por causa das suas cartas, o que suas cartas especificamente bloqueiam, e quantos
blefes ele precisaria ter para a aposta dele fazer sentido.

O que ja existe:

| Peca | Onde | Serve para |
|---|---|---|
| `requiredEquity(pot, call)` | `client/src/lib/combo-calc/ev.ts:26` | alpha do **heroi** (`call / (pot + call)`) |
| `expandRangeV2` -> `totalWeight` | `engine/expand.ts` | massa do range depois do card removal do bordo |
| `HeroComboResult.pairMass` | `engine/types.ts` | massa que cada combo do heroi realmente enfrenta |
| `EngineResultOk.callThresholdIndex` | idem | quantas maos do heroi pagam |
| `verdictCalcBasis` | `client/src/lib/combo-calc/uiRules.ts` | qual base alimenta o numero (D10 da F0) |
| `Verdict.wEff` / `lEff` | `types.ts` | massa efetiva fora do river |

---

## O achado que rege esta sub-frente

### F-1: `MDF = 1 - alpha` esta ERRADO com o `alpha` que ja existe no codigo

`requiredEquity` usa `potCurrent` **ja incluindo** a aposta do vilao. Com aposta
`B` e pote antes dela `P`:

```
alpha_heroi  = B / (P + 2B)     <- ja existe. "quanta equity EU preciso pra pagar"
alpha_defesa = B / (P + B)      <- novo.     "quanto o BLEFE DELE precisa funcionar"
MDF          = P / (P + B) = 1 - alpha_defesa
```

Pote 20, aposta 10: `alpha_heroi = 25%`, `alpha_defesa = 33%`, `MDF = 67%`.
`MDF + alpha_heroi = 92%` — nao significa nada. O criterio de aceite da F3
(`MDF + alpha = 1`) e a formula de blefes so fecham com `alpha_defesa`.

**Portanto:** grandeza com **nome proprio** em modulo proprio (`mdf.ts`), e
`requiredEquity` **nunca** e reusado para MDF. Os dois numeros vao aparecer na
mesma tela; nome compartilhado e como um vira o outro seis meses depois. Mesmo
modo de falha que a D8 e a D11 da F0 documentaram nesta frente.

---

## Decisoes herdadas (fechadas — nao reabrir)

| # | Decisao |
|---|---|
| D-F3-12 | `mdf.ts` com `defenseAlpha` proprio. **Nao** importa `ev.ts` |
| D-F3-13 | Bloqueador: contagem de combos removidos **sempre**; delta em pp direto so no river (analitico). Fora do river, botao explicito "calcular efeito" que dispara as 2 corridas |
| D-F3-16 | Painel de MDF: numero nunca aparece solto. Sempre em frase, com sujeito (`voce` / `ele`) e com a consequencia escrita. Formula so em tooltip |
| F-4 | Cascata muda de base fora do river: massa **efetiva** (`w * equity`), declarada no rotulo. Mesmo principio da D10 da F0 |
| F-5 | Bloqueador nao tem definicao com heroi-como-range: painel **desabilitado** no modo range, com o motivo escrito na tela |

---

## RF-03.2: Cascata da equity

Barra que explica de onde saiu o numero. Cinco degraus, cada um com **contagem e
massa**:

| Degrau | Valor | Fonte |
|---|---|---|
| Range nominal | 1326 | constante |
| Range declarado | combos das entradas x frequencia | soma das entradas |
| Apos card removal do bordo | idem, sem as cartas do bordo | `expandRangeV2().totalWeight` |
| Apos card removal **mutuo** | `sum(pairMass)` do lado do vilao | e o degrau que mostra o seu bloqueador operando |
| Perde para voce / chop | river: contagem discreta · fora do river: massa efetiva | base declarada (F-4) |

O total do ultimo degrau tem que bater com o total do bloco de maos feitas da
[F3a](F3a-leitura-categorias.md), quando as duas estiverem na tela.

Fora do river, o rotulo diz `massa efetiva` — nao `combos que perdem`. No flop
nao existe "combo que perde", existe combo com equity. Foi assim que o
`breakevenFrequency` da F0 anunciou 0,42 contra 0,20 real (D11).

---

## RF-03.3: Analise de bloqueadores

Para cada carta da mao do heroi: quantos combos de **value** e de **blefe** do
vilao ela remove, e o efeito liquido em pontos percentuais de equity.

- **So no modo heroi = mao unica** (F-5). No modo "meu range" o painel fica
  desabilitado com o motivo na tela — nao um numero sobre a carta mais frequente.
- Metodo: comparar o spot real contra o **contrafactual** em que aquela carta
  esta viva.
- `value` / `blefe` sao **classificacao derivada do confronto**: combo que bate o
  heroi = value, que perde = blefe. A tela declara isso com essas palavras — nao
  e a intencao do vilao, e o resultado contra a sua mao. Chop e uma terceira
  contagem, nao distribuida entre as duas.
- **Custo** (D-F3-13): contagem de combos removidos sempre (barata, local). Delta
  em pp direto so no river, onde bate/perde e deterministico e a conta e
  analitica. Fora do river, botao "calcular efeito" que dispara as duas corridas
  — duas corridas escondidas atras de cada tecla matariam a pagina.

Nenhuma ferramenta do benchmark entrega isso mastigado. E o coracao do river.

---

## RF-03.4: MDF, razao value/blefe e indiferenca

```
P = potCurrent - callAmount     // pote antes da aposta
B = callAmount
defenseAlpha = B / (P + B)
MDF          = P / (P + B) = 1 - defenseAlpha
blefesNecessarios = valueCombos * defenseAlpha / (1 - defenseAlpha)
```

- `P <= 0` (input incoerente): tudo `null` com razao `invalid_pot_before_bet`. O
  cartao vira frase de estado, sem numero. Zero seria pior que vazio.
- "Faltam N combos de blefe" = `blefesNecessarios - blefeCombos`, em **massa
  ponderada**. Arredonda para exibir, nunca para calcular.
- Com heroi como range: "sua mao e o k-esimo melhor bluffcatcher de N; o corte de
  EV zero esta no j-esimo". `j` e o `callThresholdIndex` que a F1 ja entrega — se
  divergir, e bug.

### A tela (D-F3-16)

Sao tres porcentagens parecidas no mesmo cartao. Numero solto ao lado de rotulo
curto (`alpha 25% · MDF 67%`) e por onde a confusao entra. Cada linha e uma
**frase com sujeito**:

```
Ele apostou 10 num pote de 20.

  Pra pagar, VOCE precisa de ................. 25% de equity
  O blefe DELE precisa funcionar ............. 33% das vezes
  Entao voce nao pode foldar mais que ........ 33% do seu range   (MDF: defende 67%)

  Ele tem 18 combos de value.
  Pra te deixar indiferente, precisaria de 9 combos de blefe.
  Tem 4.  ->  FALTAM 5.  Ele blefa de menos: da pra foldar mais que o MDF manda.
```

Regras de copy — requisito, nao decoracao:

- Nenhuma porcentagem sem a frase que diz de quem ela e.
- A formula (`B / (P + B)`) vive em tooltip, nunca na face do cartao.
- O veredito final e frase de acao ("da pra foldar mais", "ele tem blefe demais:
  pague mais largo"), nao um numero.

---

## Modulos novos

```
client/src/lib/combo-calc/
  mdf.ts          defenseAlpha, mdf, bluffsNeeded   (NAO importa ev.ts)
  blockers.ts     contrafactual por carta
  cascade.ts      os cinco degraus
client/src/components/range-lab/
  CascadeBar.tsx
  BlockerPanel.tsx
  MdfPanel.tsx
```

---

## Criterios de aceite

1. `MDF + defenseAlpha == 1` em toda a faixa de aposta (varredura de 0,1x a 5x
   pote).
2. **`defenseAlpha != requiredEquity`** fora do caso degenerado — teste explicito,
   que trava o achado F-1 para sempre.
3. `P <= 0` produz `null` + `invalid_pot_before_bet`, e a tela nao mostra numero.
4. Bloqueador: remover manualmente do range os combos que contem a carta do heroi
   produz o mesmo delta de equity que a analise reporta.
5. Bloqueador no modo "meu range": painel desabilitado, motivo na tela, sem
   numero.
6. Cascata: o total do ultimo degrau bate com a massa do range; fora do river o
   rotulo diz `massa efetiva`.
7. `npm run check` limpo; suite da area verde, placar nao caiu.

---

## Fora de escopo desta sub-frente

- Categorias, textura, filtros e mao explicada por combo:
  [F3a](F3a-leitura-categorias.md).
- Runout e curva de distribuicao: [F5a](F5-mindriver.md).
- ICM / risk premium, persistencia server-side, Coach: **F4 cancelada**.

---

## HANDOFF — ao concluir a F3b

### Confira voce mesmo (10 min, no `:3000` reiniciado)

1. **MDF fecha.** MDF + a frequencia de defesa = 100%, em qualquer tamanho de
   aposta. E o outro numero (a equity que voce precisa pra pagar) **nao** soma
   com o MDF — sao coisas diferentes e a tela deixa isso claro.
2. **Blefes que faltam.** Com o vilao so com value, tem que dizer "faltam N
   combos de blefe". Adicione blefes ate o veredito virar call.
3. **Cascata faz sentido.** A barra mostra quanto do range dele morreu por causa
   das suas cartas. Fora do river o rotulo diz `massa efetiva`.
4. **Bloqueador confere na mao.** Tire a carta do bordo/mao e refaca: a equity
   tem que mexer no tamanho que ele disse.
5. **Modo range.** Troque o heroi para "meu range": o painel de bloqueadores
   desabilita e diz por que.

### Prompt da proxima sessao

Frente: **F5a — Graficos**. Modelo: **Opus 5 — Extra**.
```
Frente F5a do Range Lab. Leia Docs/specs/range-lab/00-INDICE.md e
Docs/specs/range-lab/F5-mindriver.md antes de qualquer coisa.

F1, F3a e F3b estao concluidas e verificadas. F4 foi cancelada — nao depende
dela. Esta frente e so leitura visual — nao muda motor nem modelo. Comece pelo
passe de detalhamento dos quatro RFs (05.1 a 05.4), com foco em: normalizacao
do eixo X quando os dois ranges tem tamanhos diferentes, e como o seletor
equity/decisao do hotness reaproveita uma corrida so. Me mostre o detalhamento
antes do TDD.
```

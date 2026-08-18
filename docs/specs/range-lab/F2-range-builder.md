# F2 — Range builder

> Frente 2 de 5 do [Range Lab](00-INDICE.md). Uma frente por sessao.

## Cabecalho
| | |
|---|---|
| **Modelo** | Sonnet 5 — Alto |
| **Depende de** | F0 (pode correr em paralelo com F1; se a F1 ja tiver rodado, integrar na `/range-lab`) |
| **Entrega** | Velocidade de construcao de range |
| **Migration** | nao |
| **Matematica nova** | nenhuma |
| **Status** | Nao iniciada |

**Primeiro passo desta sessao:** passe de detalhamento. Os RFs abaixo estao em
nivel de arquitetura. Detalhar comportamento de cada gesto, estados visuais e
casos de borda, mostrar ao founder, e so entao abrir o pipeline TDD.

## Contexto minimo (para abrir a frio)
Hoje o unico gesto e clicar/arrastar na matriz 13x13
([CombosCalculator.tsx:547-576](../../../client/src/components/calculators/CombosCalculator.tsx#L547)),
com `onMouseDown` + `onMouseEnter` — nao funciona em toque. Nao existe desfazer,
nao existe selecao por linha, nao existe peso por combo, nao aparece a contagem
total do range.

Benchmark: Equilab e GTO Wizard resolvem isso com modificadores de teclado. E o
que separa "montar um range em 4 segundos" de "montar em 40".

---

## RF-02.1: Atalhos da matriz
| Gesto | Efeito |
|---|---|
| Clique | Alterna a celula (ja existe) |
| Arrastar | Pinta (ja existe) |
| **Ctrl + clique** | "Esta e as melhores" no eixo natural: par sobe ate `AA`; `A9s` sobe kicker ate `AKs`; conector sobe o gap ate `AKs` |
| **Shift + clique** | Retangulo desde a ultima celula clicada |
| **Clique no cabecalho** do rank | Linha ou coluna inteira |
| **Alt + arrastar** | Pinta naipe em vez de classe |
| **Scroll do mouse sobre a celula** | Ajusta a frequencia da classe em passos de 5% (emenda A7 — substitui o "arrastar vertical" do rascunho: e mais preciso e nao briga com o gesto de pintar) |
| `Ctrl+Z` / `Ctrl+Y` | Desfaz / refaz no range |
| `Ctrl+A` | Range completo; `Delete` limpa |

**Peso rapido global (emenda A9, [F5](F5-mindriver.md)).** Um controle unico
(passo de 5%) define o peso do **proximo pincel**. Pintar um range inteiro a 50%
vira um gesto so, em vez de ajustar classe por classe depois.

Pedido explicito do founder: **Ctrl + clique no `22` seleciona `22` ate `AA`**.

- Migrar para pointer events. `onMouseEnter` nao existe em toque
  ([CombosCalculator.tsx:556](../../../client/src/components/calculators/CombosCalculator.tsx#L556)).
- O encerramento de drag ja e robusto (pointerup/blur/mouseleave) — preservar.

## RF-02.2: Selecao de naipe em grade
- Substituir a lista linear de chips
  ([CombosCalculator.tsx:652-670](../../../client/src/components/calculators/CombosCalculator.tsx#L652))
  por popover com grade 4x4 (naipe x naipe), padrao Equilab.
- Atalhos no popover: todos, nenhum, inverter, "so o naipe do flush do bordo",
  "so os que bloqueiam o naipe X".
- A celula da matriz mostra `9/12c` e pinta proporcional ao selecionado.
- **Forma validada (emenda A8, [F5](F5-mindriver.md)).** Um botao por combo com o
  simbolo do naipe colorido (nao uma lista de texto), presets de frequencia
  `25 / 50 / 75 / 100` e `Limpar` no rodape do popover. Combo impossivel pelo
  bordo **nao aparece** no popover — some, em vez de ficar desabilitado ocupando
  espaco.

## RF-02.3: Frequencia por combo
`comboFreqOverrides` ja existe em [types.ts:23](../../../client/src/lib/combo-calc/types.ts#L23),
e lido em `comboFrequency` e persistido em `persistence.ts` — **nenhum ponto da
UI escreve**. Capacidade morta desde a sprint original.

- Abrir a superficie: slider por combo dentro do popover de naipes.
- Indicacao visual na celula de que a classe tem override.
- Limpar override volta para a frequencia da classe.
- Escrita tambem pelo scroll na celula (RF-02.1) e pelos presets do popover
  (RF-02.2) — tres portas para o mesmo campo, nenhuma delas nova no modelo.

## RF-02.4: Top X% e contagem
- Slider "top X% do range" com ordenacao por forca pre-flop.
- **Fonte da tabela de ranking — pendencia do indice, agora fechada (emenda A5,
  [F5](F5-mindriver.md)).** Nao e heuristica: e **equity de cada uma das 169 maos
  contra mao aleatoria**, medida por Monte Carlo com **60.000 amostras por mao** e
  semente fixa, calculada **uma vez** e versionada como dado do repositorio (nao
  recalculada na maquina do jogador). O motivo esta escrito no codigo do
  MindRiver: com poucas amostras o ruido estatistico fazia o "top X%" pegar mao
  fora do padrao ao arrastar o slider. A tela declara o metodo e o numero de
  amostras — o dado e medido, mas continua sendo equity contra mao aleatoria, que
  nao e forca posicional.
- **Peso fracionado na ultima mao (emenda A6).** O preenchimento vai na ordem de
  forca ate cobrir a porcentagem pedida, e a **ultima mao entra com peso
  fracionado** para bater a porcentagem exata. Sem isso, "top 23%" nunca da 23%.
- Exibir sempre: combos totais, `% de 1326`, e quanto o card removal removeu.
  Hoje nem a contagem total aparece.
- **Por celula tambem (emenda A10).** A celula mostra a fracao selecionada, pinta
  com opacidade reduzida a parte morta pelo bordo, e o tooltip traz
  `X/Y combos · media N%` mais `Z% bloqueado pelo bordo`. E onde o card removal
  fica visivel — o total global esconde de qual classe ele comeu.

## RF-02.5: Biblioteca de ranges local
- Salvar range nomeado (separado do spot), aplicar, duplicar.
- Export e import em formato solver / GTO Wizard, colavel.
- **Serializador que colapsa (emenda A12, [F5](F5-mindriver.md)).** Copiar o range
  devolve notacao curta — `22+`, `A2s+`, `T9s-54s` — reagrupando classes cheias
  em vez de listar combo a combo. Classe parcial sai com peso (`AQo:50%`); combo
  solto sai como combo (`AsKh`). Sem isso, "copiar" produz um paredao que nao
  cabe em lugar nenhum.
- Sanitizacao por item herdada da RF-00.4 — nao repetir o bug dos spots salvos.

## RF-02.6: Ponto de virada do slider fora do river (herdado da F0, 2026-08-16)
A F0 mediu que o `breakevenFrequency` fechado (`W*/W`, em `ev.ts`) so descreve o
slider **no river**. Fora dele, escalar o peso de um combo vencedor mexe tambem
no denominador — o combo carrega a propria fracao perdedora — e o numero erra por
mais do que o dobro:

| street | fechado | k real do slider | equity no k fechado (alpha 52,56%) |
|---|---|---|---|
| flop | 0,4185 | **0,1958** | 63,14% |
| turn | 0,3240 | **0,2294** | 59,38% |
| river | 0,9234 | 0,9234 | 52,56% (exato) |

A F0 **removeu o numero da tela fora do river** (numero ausente vence numero
errado) e deixou o slider, que agora e exato, como a ferramenta do ponto de
virada. A F2 devolve o numero, calculado do jeito certo.

**Regras:**
- `solveBreakevenMultiplier(verdict, subset?)`. Nao precisa de bissecao: a conta
  fecha em forma **exata**, com quatro acumuladores em uma passada por `perCombo`,
  separando o subconjunto escalado do resto —

  ```
  A = soma_escalado(w * eq)     B = soma_escalado(w)
  C = soma_resto(w * eq)        D = soma_resto(w)
  k* = (alpha * D - C) / (A - alpha * B)
  ```

  Sai direto de `E(k) = (kA + C) / (kB + D) = alpha`. Recebe o `Verdict` pronto
  (a F0 ja permite isso), entao **nao** reenumera runout.
- Devolve `null` quando o denominador zera ou quando `k* < 0` (spot que nunca
  vira), com razao nomeada — nao satura silenciosamente no extremo.
- Valores conferidos na F0 para o spot de referencia (`f0-fixtures.ts`, pote 36,1
  / call 13,8): flop `0,00762`, turn `0,05437`, river `0,31856`. O river bate com
  o `breakevenFrequency` fechado atual.
- `ev.ts` **nao muda**: `breakevenFrequency` fechado continua como esta, e o teste
  `f0-combos-basis.test.ts` que o fixa continua verde. O solver e um numero novo,
  ao lado, nao uma reescrita do antigo.
- A tela volta a mostrar a frase do ponto de virada nos tres streets, a partir do
  solver.

---

## Detalhamento (2026-08-17, passe de arquitetura antes do TDD)

**Correcao no criterio de aceite 6.** O numero `0,9234` la embaixo e resto do
D11 (spot com alpha 52,56%, nao o `f0-fixtures.ts`). Rodei `evaluateSpot` direto
nos tres spots de `f0-fixtures.ts` (pote 36,1/call 13,8, alpha 27,65%) e os
numeros do corpo do RF-02.6 batem exatos: flop `0,007621097718527866`, turn
`0,05437127917598511`, river `0,31855955678670356` — e o river bate com
`verdict.breakevenFrequency` a `1e-16`. O criterio 6 abaixo ja foi corrigido para
`0,31856`.

**Alt+arrastar (RF-02.1) — decisao do founder.** A celula da matriz e a classe
inteira (ate 12 combos), sem alvo de "qual naipe" durante um drag por varias
classes. Resolvido: no `pointerdown` do Alt+drag abre um mini-seletor de 4
naipes (ou reusa o ultimo escolhido na sessao); toda classe tocada pelo drag
ganha `suits` filtrado para ESSE UNICO naipe. Cobre "quero so as maos de
espadas do meu range" varrendo a matriz de uma vez.

**Arquitetura desta frente (arquivos novos):** `combo-calc/history.ts` (undo/redo
generico, puro), `combo-calc/rangeGestures.ts` (Ctrl+clique reusa
`expandRangeToken(notation + "+")` — zero gramatica nova; cabecalho de
linha/coluna deriva da mesma matematica de `cellNotation`), `combo-calc/
breakeven.ts` (`solveBreakevenMultiplier`, `ev.ts` intocado), `combo-calc/
rangeStrength.ts` + `combo-calc/data/handRanking.json` (169 maos, gerado por
`scripts/generate-hand-ranking.ts`, MC 60k/mao, semente fixa, committed),
`combo-calc/rangeSerializer.ts` (`collapseRangeToNotation`, A12),
`range-lab/{SuitPickerPopover,RangeLibrary,TopPercentSlider,
BrushWeightControl}.tsx`. Gramatica: `55-TT` e `AsKh` ja funcionam (regras
existentes); so falta 1 regra nova (`gap-range`) para `T9s-54s`.
`top X%` digitado fica FORA de `RANGE_TOKEN_RULES` (peso fracionado na ultima
mao nao cabe no contrato `string[]` das regras) — ramo dedicado em
`applyRangeString`, antes do fallback `^(\S+)$` que hoje o mata.
`solveBreakevenMultiplier` so se conecta em `CombosCalculator.tsx` (consome o
`Verdict` v1) — `RangeLab.tsx`/`VerdictPanel` roda sobre `EngineResult`, que nao
tem o mesmo `perCombo` ponderado, entao RF-02.6 nao se aplica la.
`CombosCalculator.tsx` troca a matriz e a lista de naipes inline pelos
componentes de `range-lab/` (paga a divida D13).

## Criterios de aceite
1. Ctrl + clique no `22` seleciona 13 classes (`22` ate `AA`).
2. Ctrl + clique em `A9s` seleciona `A9s` ate `AKs`.
3. Desfazer restaura o range exato anterior, inclusive pesos e naipes.
4. Override de frequencia por combo persiste no rascunho e volta apos recarregar.
5. Matriz responde a toque (arrastar pinta no tablet).
6. **No river, `solveBreakevenMultiplier` bate com `verdict.breakevenFrequency`
   ate `1e-9`** — o fechado e o oraculo de graca onde os dois modelos coincidem.
   Medido no spot de referencia: `0,31856` nos dois (corrigido 2026-08-17 — o
   `0,9234` original era de outro spot, ver "Detalhamento" acima).
7. No turn e no flop, a equity avaliada no `k` devolvido encosta em
   `requiredEquity` (tolerancia `1e-6`). Hoje o fechado erra 6,8pp no turn.
8. `npm run check` limpo; suite da area verde.

## Fora de escopo desta frente
Motor, equity, categorias, ICM. A F2 nao toca em `equity.ts`, `ev.ts` nem
`evaluator.ts` — a RF-02.6 inclusive depende de `ev.ts` ficar intocado.

---

## HANDOFF — ao concluir a F2

### Confira voce mesmo (5 min, no `:3000` reiniciado)
1. **Ctrl no 22.** Segure Ctrl e clique no `22`. Tem que pintar do `22` ate o `AA`
   de uma vez.
2. **Ctrl num suited.** Ctrl + clique em `A9s` -> pinta `A9s` ate `AKs`.
3. **Shift.** Clique numa celula, depois Shift + clique em outra: pinta o
   retangulo entre as duas.
4. **Linha inteira.** Clique no cabecalho de um rank: pinta a linha/coluna.
5. **Desfazer.** `Ctrl+Z` volta a jogada anterior. `Ctrl+Y` refaz.
6. **Naipes.** Abra o seletor de naipes de uma classe: tem que ser uma grade, com
   atalho de "so o naipe do flush".
7. **Peso por combo.** Dentro do seletor, ajuste a frequencia de **um combo so**.
   Recarregue a pagina: o ajuste continua la.
8. **Contagem.** A tela mostra quantos combos o range tem e quanto isso e de 1326.
9. **Toque.** Se tiver tablet: arrastar na matriz pinta.

### Prompt da proxima sessao

Frente: **F3 — Leitura**. Modelo: **Opus 5 — Extra**.
```
Frente F3 do Range Lab. Leia Docs/specs/range-lab/00-INDICE.md e
Docs/specs/range-lab/F3-leitura.md antes de qualquer coisa.

F0, F1 e F2 estao concluidas e verificadas. Comece fazendo o passe de
detalhamento dos RFs, principalmente a taxonomia de categorias de mao e a regra
de sobreposicao entre mao feita e draw, me mostre, e so depois siga o pipeline
TDD.
```

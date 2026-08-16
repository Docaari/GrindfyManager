# F1 — Motor

> Frente 1 de 5 do [Range Lab](00-INDICE.md). Uma frente por sessao.

## Cabecalho
| | |
|---|---|
| **Modelo** | Opus 5 — Extra |
| **Depende de** | F0 concluida e verificada |
| **Entrega** | Avaliador rapido, Web Worker, exato/Monte Carlo, heroi-como-range, pagina `/range-lab` |
| **Migration** | nao |
| **ADR** | sim — obrigatorio antes dos testes |
| **Status** | Nao iniciada |

Frente maior do projeto. Reescreve o nucleo de calculo e muda o modelo de dados.
Toca zona critica (matematica que vira numero na tela). Nunca abaixo de `Extra`.

## Contexto minimo (para abrir a frio)
O motor atual avalia mao de poker alocando dois `Map` e varios arrays por
chamada, duas chamadas por showdown. Mede-se: flop `Ad 8h 4h` com 59 classes /
236 combos leva **555 ms** na main thread. Range de BTN cheio no flop passa de
1300 combos, ~3 s de tela travada. Range vs range no flop com esse motor e
inviavel (1300 x 1300 x 990 runouts).

Alem disso o heroi e uma mao unica (`Spot.hero: [Card, Card]`), o que impede a
pergunta mais util do estudo: **quais das minhas maos pagam?**

Arquivos que importam:
- [`evaluator.ts`](../../../client/src/lib/combo-calc/evaluator.ts) — avaliador atual, correto, vira oraculo.
- [`equity.ts`](../../../client/src/lib/combo-calc/equity.ts) — enumeracao de runouts + cache.
- [`evaluateSpot.ts`](../../../client/src/lib/combo-calc/evaluateSpot.ts) — pipeline.
- [`types.ts`](../../../client/src/lib/combo-calc/types.ts) — modelo.
- [`CombosCalculator.tsx`](../../../client/src/components/calculators/CombosCalculator.tsx) — 955 linhas a quebrar.

---

## RF-01.1: Avaliador de mao rapido, validado contra o atual
**Causa do gargalo.** [evaluator.ts:53-60](../../../client/src/lib/combo-calc/evaluator.ts#L53)
aloca por avaliacao.

**Regras:**
- Novo avaliador sem alocacao por chamada: representacao de mao em inteiro
  (bitmask de ranks + contagem por naipe) com tabelas pre-computadas, devolvendo
  **um inteiro comparavel unico** por mao de 7 cartas.
- **Receita ja validada em producao (emenda A1, [F5](F5-mindriver.md)).** O
  MindRiver usa exatamente isso e serve de molde:
  `score = (categoria << 20) | r1 << 16 | r2 << 12 | r3 << 8 | r4 << 4 | r5`, com
  9 categorias (`HIGH` a `STRAIGHT_FLUSH`) e uma tabela `_STRAIGHT_TOP` de **8192
  posicoes** indexada pela bitmask de 13 ranks — a roda entra como mask `4111`
  (`A5432`). Naipe resolvido por contagem; flush e straight flush saem da mesma
  tabela aplicada a mask do naipe. Comparacao de maos vira comparacao de inteiro.
- **Sem dependencia nova.** Artigo VII e `01-tecnologia.md`: tabela propria.
- O avaliador atual e **preservado** como oraculo (decisao D4). Teste de paridade
  por amostragem com semente fixa, comparando a **ordem** produzida pelos dois.
  Divergencia = falha.
- Golden tests existentes (`evaluator.test.ts`) continuam apontando para o
  avaliador antigo e ganham gemeos para o novo.
- **Meta:** o mesmo flop de 236 combos abaixo de 20 ms.

## RF-01.2: Heroi como range
**Regras:**
- `Spot` passa a ter `heroRange: RangeEntry[]`. Mao unica e o caso de uma unica
  entrada `specific` com frequencia 1 — **sem caminho de codigo separado**, para
  nao divergir.
- A UI mantem os dois modos visiveis ("Minha mao" / "Meu range"); ambos produzem
  `heroRange`.
- **Card removal mutuo.** Um combo do heroi e um combo do vilao que compartilham
  carta nao se enfrentam. A ponderacao honesta e por par valido
  `(combo_heroi, combo_vilao)` — enumerar os pares e a unica forma correta.
  Produto simples de pesos produz numero errado que **nao parece errado**.
  Declarar no codigo e cobrir por teste.
- `Verdict` ganha `perHeroCombo: HeroComboResult[]` — equity, EV do call e decisao
  por combo do heroi.
- **Compatibilidade:** `persistence.ts` migra rascunho e spots do formato v1
  (`hero: string[]`) para v2 (`heroRange`), sem perder dado do jogador. Chave nova
  `grindfy.comboCalc.draft.v2`; a v1 e lida uma vez e convertida.

## RF-01.3: Range vs range
**Regras:**
- Equity do range do heroi = media ponderada das equities por combo do heroi, com
  peso igual a massa de pares validos daquele combo.
- Saidas novas no `Verdict`:
  - `heroRangeEquity` — equity agregada.
  - `perHeroCombo` — ordenavel por equity ou por EV do call.
  - `callThresholdIndex` — quantos combos do heroi tem EV de call `>= 0`. E a
    resposta direta de "quantas das minhas maos pagam".
- Custo: river e `|H| x |V|` showdowns (trivial com o avaliador novo); turn
  `x46`; flop `x990` — ver RF-01.4.

## RF-01.4: Worker + modo exato / Monte Carlo
**Regras:**
- Todo calculo com bordo de flop ou turn, ou com heroi como range, roda em Web
  Worker. A main thread nunca bloqueia.
- Progresso reportado (0-100%) e cancelamento ao mudar qualquer entrada.
- Dois modos, escolha explicita do jogador:
  - **Exato** — enumera todos os runouts. Padrao sempre que o custo estimado
    couber no orcamento: **4 milhoes de showdowns** (emenda A2, numero medido em
    uso real no MindRiver; a proposta anterior era 5M no chute).
  - **Monte Carlo** — amostragem com **semente fixa** (reprodutibilidade — sem
    ela, dois calculos do mesmo spot divergem e o jogador nao sabe em quem
    acreditar). **Obrigatoriamente** exibe o intervalo de confianca (proposta:
    95%) junto do numero (decisao D5). O MindRiver **nao** mostra intervalo; e
    onde ficamos na frente dele, nao onde copiamos.
- Progresso e cancelamento: reportar a cada **200 ms ou 200 mil amostras**, o que
  vier primeiro; o cancelamento e checado no mesmo ponto (emenda A2).
- **Orcamento de iteracoes por superficie (emenda A3).** Cada painel paga o preco
  do que entrega; um numero global sobra para uns e falta para outros:

  | Superficie | Iteracoes | Debounce |
  |---|---|---|
  | Selo de equity ao vivo (cartao de range) | 6.000 | 450 ms |
  | Matriz 13x13 / distribuicao | 15.000 | 400 ms |
  | Hotness (por carta que pode sair) | 2.500 | 400 ms |
  | Fluxo rua a rua (por rua) | 12.000 | 400 ms |
  | Range Finder (por mao, 169 maos) | 3.000 | — |

- **Recalculo preguicoso (emenda A4).** Painel que nao esta visivel nao roda:
  marca-se sujo e recalcula ao aparecer. Sem isso a pagina de tres paineis
  dispara varias corridas a cada tecla.
- A ferramenta estima o custo antes de rodar e **sugere** o modo; nunca troca
  sozinha sem dizer.
- Cache de equity ([equity.ts:62](../../../client/src/lib/combo-calc/equity.ts#L62))
  migra para dentro do worker e ganha invalidacao por bordo.

## RF-01.5: Pagina propria `/range-lab`
**Regras:**
- Rota nova em `App.tsx`. Layout de paineis: **range** (esquerda) | **bordo +
  veredito** (centro) | **leitura** (direita, populada na F3). Colapsa para coluna
  unica abaixo de `lg`.
- `/calculadoras` mantem a aba "Combos" como atalho que navega para `/range-lab`.
  Link tem que casar com rota registrada (licao #19).
- O popup (`CalculadoraPopup`) continua servindo o componente compacto atual, sem
  range vs range, para uso ao lado da mesa.
- `CombosCalculator.tsx` quebrado por responsabilidade: `BoardPicker`,
  `RangeMatrix`, `RangeEntryList`, `BetInputs`, `VerdictPanel`, `ComboTable`,
  `SpotLibrary`.
- Tokens de `@/lib/ui-tokens`; nada de valor solto (`14-frontend-ui.md`).
  `z-index` pelo `Docs/conventions/z-index.md` (a barra de veredito e sticky).
- **Escala de calor nos tokens (emenda A18).** Tres derivacoes da mesma escala,
  porque uma so nao serve: (a) absoluta 0-100% para equity; (b) **relativa** ao
  min/max do conjunto, para quando o que importa e o ranking e nao o valor
  (hotness); (c) variante **escurecida para texto** — o amarelo do meio da escala
  e ilegivel como cor de fonte em fundo claro. Vao para `@/lib/ui-tokens`.
- **Botao Reset (emenda A19).** Limpa tudo — ranges, bordo, cartas mortas,
  filtros — e o tooltip diz exatamente isso antes do clique.
- **Bordo sem fileira de slots (emenda A20).** Um baralho unico: as 3 primeiras
  cartas clicadas viram flop, a 4a turn, a 5a river; clicar de novo remove. Botao
  `Aleatorio`: bordo vazio sorteia o flop inteiro; com flop na mesa, completa uma
  carta por vez. Menos clique e menos estado do que a fileira de slots atual.

---

## Criterios de aceite
1. Paridade avaliador novo x antigo em amostra com semente fixa, sem divergencia.
2. Flop de 236 combos abaixo de 20 ms no motor; main thread livre durante o
   calculo.
3. Mao unica produz **exatamente** o mesmo veredito de hoje — regressao contra os
   golden tests do commit `2aed9b1d`.
4. Monte Carlo nunca exibe numero sem intervalo de confianca.
5. Rascunho v1 no localStorage abre sem perda depois do deploy.
6. `npm run check` limpo; suite da area verde.

## Fora de escopo desta frente
Atalhos de matriz (F2), breakdown por categoria (F3), ICM (F4). A F1 entrega
motor e modelo; a UI nova e o minimo para exercitar os dois.

---

## HANDOFF — ao concluir a F1

### Confira voce mesmo (8 min, no `:3000` reiniciado)
1. **A pagina existe.** `/range-lab` abre com tres colunas. Em tela estreita vira
   uma coluna so.
2. **Atalho funciona.** `/calculadoras` -> aba Combos leva para `/range-lab`. Nao
   pode cair em pagina de "nao encontrado".
3. **O popup nao morreu.** Botao "Abrir janela" na aba Combos ainda abre a versao
   compacta e ela calcula.
4. **Nao travou.** Monte um **flop** (3 cartas) e pinte um range grande na matriz
   (linha de pares + linha de ases). A pagina tem que continuar respondendo, com
   barra de progresso. Antes travava alguns segundos.
5. **Meu range.** Troque de "Minha mao" para "Meu range" e pinte 3 ou 4 maos suas.
   Tem que aparecer quantas delas pagam.
6. **Aproximado se declara.** Se aparecer o modo Monte Carlo, o numero tem que vir
   com margem de erro do lado. Numero sozinho, sem margem, e bug.
7. **Nao perdi nada.** Um spot salvo antes da F1 tem que abrir normal.
8. **O velho continua certo.** Um spot de river com mao unica: o veredito tem que
   ser identico ao de antes.

### Prompt da proxima sessao

Duas frentes ficam liberadas. Pode rodar em qualquer ordem — F2 e UI, F3 e
analise. Sugestao: **F2 primeiro**, porque e a que voce usa todo dia e e mais
barata.

Frente: **F2 — Range builder**. Modelo: **Sonnet 5 — Alto**.
```
Frente F2 do Range Lab. Leia Docs/specs/range-lab/00-INDICE.md e
Docs/specs/range-lab/F2-range-builder.md antes de qualquer coisa.

F0 e F1 estao concluidas e verificadas. Comece fazendo o passe de detalhamento
dos RFs (a F2 foi especificada em nivel de arquitetura, nao de implementacao),
me mostre o detalhamento, e so depois siga o pipeline TDD.
```

Frente: **F3 — Leitura**. Modelo: **Opus 5 — Extra**.
```
Frente F3 do Range Lab. Leia Docs/specs/range-lab/00-INDICE.md e
Docs/specs/range-lab/F3-leitura.md antes de qualquer coisa.

F0 e F1 estao concluidas e verificadas. Comece fazendo o passe de detalhamento
dos RFs, principalmente a taxonomia de categorias de mao, me mostre, e so depois
siga o pipeline TDD.
```

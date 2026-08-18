# Range Lab — indice das frentes

Evolucao da Calculadora de Combos para bancada de estudo de spot pos-flop.

**Uma frente por sessao.** Cada documento `F*.md` abre a frio: tem o contexto
minimo, os requisitos, os criterios de aceite e o handoff para a proxima sessao.
Este indice e o unico lugar onde o estado global vive.

## Placar

| Frente | Entrega | Modelo | Depende de | Status |
|---|---|---|---|---|
| [F0 Verdade](F0-verdade.md) | 7 correcoes, incl. 2 que mentem numero na tela | Opus 5 — Alto | — | **Concluida** 2026-08-16 — commit `ea0f8303` |
| [F1 Motor](F1-motor.md) | Avaliador rapido, worker, exato/MC, heroi-como-range, `/range-lab` | Opus 5 — Extra | F0 | **Concluida** 2026-08-17 — commit `6f02c872` |
| [F2 Range builder](F2-range-builder.md) | Atalhos, naipes em grade, freq por combo, top X%, undo, **+ RF-02.6 (ponto de virada, herdado da F0)** | Sonnet 5 — Alto | F0 | **Concluida** 2026-08-18 — commit `d08a006c` — RF-02.1 a RF-02.6 ligados de verdade em `RangeLab.tsx` e no popup, 579/579 verdes, `tsc` 0. Rodada 3 fechou: `handRanking.json` real (Monte Carlo 60k/mao, `scripts/generate-hand-ranking.ts`), `TopPercentSlider`/`RangeLibrary`/`BrushWeightControl` nos dois lados, e D13 pago — `CombosCalculator.tsx` (popup) consome os mesmos `RangeMatrix`/`RangeEntryList`/`SuitPickerPopover` de `range-lab/`, ganhando Ctrl+Z/Ctrl+Y de graca |
| ~~[F3 Leitura](F3-leitura.md)~~ | ~~Categorias, cascata, bloqueadores, MDF, filtros~~ | — | — | **Quebrada em F3a + F3b** 2026-08-18 (D-F3-14) apos o passe de detalhamento — ver [F3-detalhamento.md](F3-detalhamento.md) |
| [F3a Leitura por categoria](F3a-leitura-categorias.md) | Taxonomia (16 maos feitas + 8 draws), textura, filtro que pinta a matriz, mao explicada por combo, `perVillainCombo` no motor | Opus 5 — Extra | F1 | **Concluida** 2026-08-18 — commit `88f95745`. `classify.ts` + `read.ts` (nucleo puro), `perVillainCombo` + `villainRangeEquity` aditivos no motor, `CategoryPanel`/`BoardTextureLine`/`ComboTable` em duas listas, `highlight` opcional na matriz. 770 verdes (614 unit + 156 client), `tsc` 0. [ADR-248](../../../Docs/architecture/decisions/248-range-lab-f3a-leitura-categorias.md) + D-F3-17/18/19 e a **D-F3-20** (`usesHoleCards` = categoria nomeada; a leitura R3 do ADR ficou superada) |
| [F3b Aritmetica da decisao](F3b-decisao.md) | Cascata, bloqueadores, MDF / value-blefe | Opus 5 — Alto | F1 (nao depende da F3a) | Nao iniciada — **proxima frente**. Herda `perVillainCombo` da F3a, que e o insumo dos bloqueadores |
| ~~F4 Contexto~~ | ~~Risk premium, servidor, Estudos/MDA, Coach, export~~ | — | — | **Cancelada** 2026-08-18 (decisao founder) — ver nota abaixo |
| [F5a Graficos](F5-mindriver.md) | Curva dupla de equity, fluxo rua a rua, hotness, heatmap 13x13 + chips | Opus 5 — Extra | F1 | Nao iniciada — depois da F3 |
| [F5b Ferramentas](F5-mindriver.md) | Range Finder + cartas mortas separadas do board (RF-05.7 cenario em arquivo cortado) | Sonnet 5 — Alto | F1 | Nao iniciada — depois da F5a |

F0 e F2 podem correr em paralelo com F1 — tocam arquivos diferentes. F3 e F5
exigem o modelo novo de `Spot` que a F1 entrega.

**Ordem confirmada (founder, 2026-08-18): F3a -> F3b -> F5a -> F5b.** `F4-contexto.md`
continua no repo por referencia (formula do risk premium, desenho de
persistencia), mas nao abre sessao — ICM/RP, biblioteca de ranges sincronizada
no servidor, ponte com Estudos/MDA, tool do Coach e export ficaram fora do
roadmap do Range Lab. Motivo: escopo de integracao maior do que o produto
precisa agora. Detalhe em `memory/session_2026-08-18-range-lab-f2-round3-f4-cut.md`.

A F5 nasceu do estudo do **Mind River** (app desktop do proprio founder,
2026-08-16). Alem das duas sub-frentes acima, ela distribuiu **20 emendas** (A1 a
A20) dentro da F0, F1, F2, F3 e F4 (a F4 recebeu so a A13, que caiu junto com a
frente) — cada uma marcada no texto como `emenda AN`. Dois RFs da F3 foram
consolidados na F5a para nao construir a mesma tela duas vezes: RF-03.5 (runout)
virou RF-05.3, e RF-03.6 (distribuicao) virou RF-05.1.

Ao concluir uma frente: marcar o status aqui e registrar o commit.

## Visao
O jogador monta o spot pos-flop, entende **de onde vem** a equity e decide.
Diferencial que nao se perde em nenhuma frente: a ferramenta responde "pague, e
faltam X fichas" — nem Equilab, nem Flopzilla, nem GTO Wizard, nem HRC entregam
isso direto.

## Decisoes fechadas (founder, 2026-08-04)
| # | Decisao | Escolha |
|---|---|---|
| D1 | Superficie | Pagina propria `/range-lab`, 3 paineis. A aba "Combos" de `/calculadoras` vira atalho; o popup continua como modo compacto |
| D2 | Escopo do motor | F1 leva avaliador rapido, worker, Monte Carlo **e** heroi-como-range juntos. O refactor de modelo sai colado na reescrita |
| D3 | Persistencia | Tabela nova (migration 0101) + ponte com Estudos/MDA. localStorage vira cache, nao fonte de verdade |
| D4 | Avaliador atual | **Nao e deletado.** Vira oraculo de teste do avaliador rapido. Paridade por amostragem com semente fixa |
| D5 | Precisao | Exato e o padrao. Monte Carlo e opt-in e **sempre** mostra intervalo de confianca. Numero aproximado nunca se disfarca de exato |
| D6 | Aprendizados do MindRiver (2026-08-16) | Quebrar em **F5a** (graficos, Extra) e **F5b** (ferramentas, Alto); consolidar RF-03.5 e RF-03.6 na F5a; espalhar as 20 emendas nas frentes ja escritas |
| D7 | Multiway | Segue fora. Por isso a pizza "Groups" e a faixa de 2-6 ranges do MindRiver **nao** entram; aproveitamos so o cartao de range com selo de equity ao vivo, para dois ranges |
| D8 (2026-08-16, F0) | Massa zero no `Verdict` | `Verdict.decision` passou a ser `Decision \| null` e ganhou `degradedReason: "empty_range" \| null`. **Nao** se criou um tipo separado de veredito: quem consome ja tinha que tratar o caso, so nao tinha como saber. `evCall`/`equityGap` continuam calculados no objeto (o teste legado exige `Number.isFinite`), mas `decision: null` e o portao — nenhuma tela mostra numero de massa zero |
| D9 (2026-08-16, F0) | Forma do parser de range | `expandRangeToken` virou **tabela ordenada de regras** (`RANGE_TOKEN_RULES`), nao cadeia de `if`. `expand` devolvendo `null` significa "casei o formato mas nao sou eu", e o parser segue para a proxima regra. E assim que a F2 pluga `55-TT`, `T9s-54s`, `AsKh` e `top X%` sem reabrir a gramatica (emenda A11) |
| D11 (2026-08-16, F0) | Break-even fora do river | O `breakevenFrequency` fechado (`W*/W`) so descreve o slider **no river** — medido: 0,42 anunciado contra 0,20 real no flop. O valor esta fixado por teste e nao foi tocado; a F0 **tirou o numero da tela fora do river** e deixou o slider (agora exato) como ferramenta. O solver numerico virou **RF-02.6 da F2**, com o river servindo de oraculo |
| D12 (2026-08-17, F1) | Onde moram os campos novos | O `Verdict` da v1 **nao e tocado em campo nenhum**. `perHeroCombo`, `heroRangeEquity` e `callThresholdIndex` vivem no `EngineResult`, que e uniao discriminada `ok \| degraded`. O texto do RF-01.2/01.3 ("`Verdict` ganha...") e anterior a decisao da uniao; a reconciliacao por "campos opcionais no Verdict" foi recusada porque herda exatamente a armadilha que a D8 documentou — objeto degradado carregando numero finito que alguem le |
| D13 (2026-08-17, F1) | Quem quebra o monolito | Os sete componentes de `range-lab/` **sao** a decomposicao pedida pelo RF-01.5, escritos contra o modelo v2. O `CombosCalculator.tsx` (1142 linhas) fica **intocado** servindo o popup: ele nao tem teste de wiring proprio (pendencia declarada da F0) e e a unica superficie que funciona hoje. A religacao do popup aos componentes novos e da F2, que reabre a UI e e dona dessa divida. Custo aceito e nomeado: duplicacao temporaria entre a calculadora compacta e os paineis novos |
| D14 (2026-08-17, F1) | Quem calcula na pagina nova | **Tudo passa pelo motor/worker**, inclusive river com mao unica. Um caminho so, mesmo principio do RF-01.2 — o ramo dedicado ao caso facil e o ramo por onde os bugs do caso dificil escapam. O runner sincrono do `client.ts` existe **so** como fallback de ambiente sem `Worker`, e loga antes de degradar. `evaluateSpot` continua servindo o popup e sendo o oraculo de regressao |
| D-F3-14 (2026-08-18, F3) | Quebra da F3 | Passe de detalhamento produziu 16 categorias de mao feita, 8 tags de draw, mudanca de contrato do motor (`perVillainCombo`) e 5 paineis. Quebrada em **F3a** (classificacao + categorias + filtros + mao por combo) e **F3b** (cascata + bloqueadores + MDF), pelo eixo real: quem depende de `classify.ts` e quem depende de `alpha`. A quebra que a spec sugeria nao servia mais, porque runout e distribuicao ja tinham migrado para a F5a |
| D-F3-12 (2026-08-18, F3) | Dois alphas, dois nomes | O passe achou que **`MDF != 1 - requiredEquity`**. `requiredEquity = B/(P+2B)` (equity que o heroi precisa) e `defenseAlpha = B/(P+B)` (sucesso que o blefe precisa) sao numeros diferentes que aparecem na mesma tela. A F3b introduz `defenseAlpha` em modulo proprio (`mdf.ts`), e `requiredEquity` **nunca** e reusado para MDF. Ha teste que trava a desigualdade |
| D-F3-3 (2026-08-18, F3) | Par da mesa nao e o seu par | Familia de forca (SF, quadra, full, flush, sequencia) fica com o nome mesmo quando a mesa joga, marcada `usesHoleCards: false`. Familia de par **exige** participacao da mao: `AK` em `Q-7-7` e `ace_high`, nao "2o par". Mapear a familia do avaliador direto para categoria seria mentira de leitura |
| D-F3-4 (2026-08-18, F3) | Sobreposicao virada tipo | `HandRead.made` e **um** valor (particao, soma = massa total) e `HandRead.draws` e um **conjunto** (etiquetas, nao somam). Nao existe lista unica onde os dois convivam, entao nao existe o `sum()` que produziria 137% |
| D10 (2026-08-16, F0) | Base de calculo declarada | `verdictCalcBasis(verdict)` e a fonte unica de qual base alimenta o numero — `discrete` no river, `effective` (massa `wEff`/`lEff`) fora dele. A UI passou a ler dai; a contagem por categoria continua na tela, rotulada como contagem |
| D-F3-17 (2026-08-18, F3a) | Familia fora do river | `classify.ts` chama `evaluateHand` de `evaluator.ts` (aceita 5 a 7 cartas), nao `evaluate7`. Reuso do proprio oraculo do criterio 7; a rota de dar entrada 5/6 ao `fastEvaluator` foi recusada — codigo novo em zona testada, sem ganho onde o tempo importa (a D-F3-1 ja tirou a classificacao do caminho quente) |
| D-F3-18 (2026-08-18, F3a) | Lado do painel | O painel de categorias e o filtro servem **os dois lados**, com seletor Heroi/Vilao; o lado ativo decide o range agrupado e qual matriz o `highlight` pinta. Fecha o RF-03.1 (vilao) e o exemplo do RF-03.7 (heroi) sem construir a tela duas vezes. `classify.ts` e agnostico de lado, entao nao ha matematica nova |
| D-F3-19 (2026-08-18, F3a) | Forma da `ComboTable` | **Duas listas paralelas**, nunca pareada: heroi por `perHeroCombo`, vilao por `perVillainCombo`. Nao existe "o combo do vilao daquela linha" — o pareamento do exemplo da spec e do shape v1 do popup (`Verdict.perCombo`) e nao sobrevive ao modelo v2 (mesmo descasamento do ADR-247 / D-F2-4) |
| D-F3-20 (2026-08-18, F3a) | `usesHoleCards` | Descreve a **categoria nomeada**, nao a familia que o avaliador viu. `AK` em `Q-7-7` -> `ace_high` com a flag `true` (o as nomeia a categoria e e dele); `23` em `5-6-7-8-9` -> `straight` com `false` (a mesa joga sozinha). Superou a leitura R3 do ADR-248, que pedia o contrario — o proprio R3 admitia que a flag nao poderia ser renderizada como "sua mao nao participa", que e o que o nome promete. A invariante sobrevive: fora do river so o passo de par produz `false` |

## Nao objetivos
- Solver (nao resolve arvore de jogo).
- Multiway 3+ jogadores — reavaliar depois da F3.
- Equity preflop pura sem bordo.
- Ranges GTO reais embutidos. Presets seguem declarados como aproximacao
  pedagogica ate existir fonte propria (`00-produto.md`: dado do jogador antes de
  heuristica).

**Pendencia fechada em 2026-08-16:** a fonte da tabela de ranking pre-flop
(usada pelo "top X%") deixou de estar em aberto. E equity contra mao aleatoria,
60.000 amostras por mao, semente fixa, calculada uma vez e versionada — ver
[F2 RF-02.4](F2-range-builder.md) (emenda A5).

## Armadilha que atravessa as frentes
Card removal **mutuo** (entra na F1, vale da F1 em diante): um combo do heroi e
um combo do vilao que dividem carta nao se enfrentam. A ponderacao honesta e por
par valido `(combo_heroi, combo_vilao)`, nao produto de pesos. Implementado como
produto simples, o numero sai errado de um jeito que nao parece errado.

## Estado do codigo hoje (pos-F1, 2026-08-17)
- Nucleo puro: [`client/src/lib/combo-calc/`](../../../client/src/lib/combo-calc/) — 13 arquivos + `engine/` (6 arquivos) + `rangeEngine.worker.ts`.
- Motor novo: `fastEvaluator.ts` (bitmask, oraculo = `evaluator.ts`, que **continua vivo**), `engine/{types,random,cost,expand,run,protocol,client}.ts`.
- UI nova: `client/src/pages/RangeLab.tsx` + `client/src/components/range-lab/` (7 componentes) + `client/src/hooks/useRangeEngine.ts`.
- UI antiga: [`CombosCalculator.tsx`](../../../client/src/components/calculators/CombosCalculator.tsx) — **1142 linhas**, intocada, serve o popup e a aba Combos (decisao D13). As specs diziam 955 e ~1030; os dois numeros estavam velhos.
- ICM ja existe e esta desligado da calculadora: [`RPCalculator.tsx`](../../../client/src/components/calculators/RPCalculator.tsx) (`computeRPMatrix`, Malmuth-Harville).
- Testes: `tests/unit/combo-calc/` — 25 arquivos, **384 verdes** (201 do baseline+F0 + 183 da F1) e `tests/client/range-lab/` — 4 arquivos, **44 verdes**.
- Contratos que a F2/F3 herdam: `EngineResult` e uniao discriminada (guardar por `status`, nunca pela razao); `SpotV2.heroRange`; `createEngineRun` e stepper sincrono; `createRangeEngineClient` descarta resultado velho por `runId`; `heat` em `@/lib/ui-tokens` (fora de `tokens.color`).
- Da F0: `Verdict.decision` e `Decision | null`; `verdictCalcBasis` diz a base; `tryEvaluateSpot` devolve erro nomeado; `heroEquityAtMultiplier` aceita `Spot | Verdict`.
- Sprint original: commit `2aed9b1d`. F0 e F1: ver as linhas no placar.
- Ultima migration existente: `0100_manual_session_result.sql`. Proxima livre: **0101** (a F1 nao usou).

## Referencias externas do benchmark
- [GTO Wizard — Risk Premium](https://lp.gtowizard.com/glossary/risk-premium/)
- [GTO Wizard — MDF vs ICM](https://blog.gtowizard.com/mdf-vs-icm-rethinking-bluffing-defense-strategies-in-mtts/)
- [Flopzilla — manual escrito](https://www.flopzilla.com/oldwebsite/written.html)
- [Equilab — como usar](https://www.pokerlistings.com/poker-tools/calculators/equilab)
- [Notacao de range](https://betandbeat.com/poker/terminology/hand-range-notation/)

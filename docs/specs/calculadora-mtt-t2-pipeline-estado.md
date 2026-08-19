# T2 — Calculadora MTT: estado do pipeline TDD

**Sprint:** T2 (reescrita da Calculadora MTT pelo fluxo completo).
**Spec (fonte de verdade):** `Docs/specs/calculadora-mtt-grade-roi.md`.
**Modelo e esforco declarados:** Opus 5, `xhigh`. Zona critica — o numero desta
tela decide grade e stake do jogador. Nao rodar nenhum estagio abaixo de `high`.
**Parado em:** 2026-08-19, por decisao do founder, ao fim do estagio 1.

> ## BLOQUEIO — ler antes de retomar
>
> Ainda em 2026-08-19, o founder achou um bug na **Biblioteca de Torneios**: o
> filtro "Ultimos 6M" exibe so 2 dos 7 sites que existem na janela. Provado no
> dado real: sao dois bugs empilhados (a tela manda `period='180d'`, que o
> storage nao conhece e converte em 30 dias; depois o piso de exibicao apaga os
> sites que sobraram).
>
> **A Calculadora consome a Biblioteca como fonte de ROI.** Enquanto a
> Biblioteca mentir, o ROI de cada linha desta tela herda o erro — e o gate de
> prova no dado real nao pegaria, porque o prototipo pede `period='all'`.
>
> **Decisao:** T2 fica parado ate a Biblioteca ser auditada. A ordem e
> `Biblioteca (varredura -> correcao) -> Calculadora T2`. Detalhes, evidencia e
> escopo da varredura em **`Docs/specs/biblioteca-torneios-auditoria.md`**.
>
> Consequencia direta no ADR-252: **D-1 (fonte do ROI / piso de exibicao) nao
> pode ser decidida aqui** — ela depende do que a Biblioteca decidir sobre o
> proprio piso. O architect precisa dessa resposta antes.

---

## Placar do pipeline

| Estagio | Status | Saida |
|---|---|---|
| pm-spec | **CONCLUIDO** | `Docs/specs/calculadora-mtt-grade-roi.md` refinada in place (251 -> 857 linhas) |
| system-architect | **PROXIMO — NAO INICIADO** | ADR-252 + diagrama Mermaid |
| test-writer | nao iniciado | red phase |
| implementer | nao iniciado | green phase |
| reviewer | nao iniciado | antes de fechar |

Nenhuma linha de codigo ou de teste foi escrita nesta sessao. A unica alteracao
e a spec.

---

## O que o estagio 1 (pm-spec) entregou

Refinou a spec existente **in place** — nao reescreveu do zero, porque ela
nasceu do codigo que roda (prototipo `f021a91f`). Estrutura resultante:

| Secao | O que e |
|---|---|
| 1-2 | inalteradas (proposito + prototipo como referencia) |
| 3 | RF-01..RF-10 reescritos com criterio de aceite verificavel; **RF-11..RF-14 novos**; nova 3.1 com RNF |
| 4 | D-1..D-7 **enriquecidas mas NAO respondidas** — ganharam bloco "_Contexto adicional para a decisao_" |
| 5 | fatos do dado 1-7 preservados; **8-13 novos** |
| 6 | cenarios 6.1-6.7 preservados; **6.8-6.15 novos**, cada um amarrado ao buraco que fecha |
| 7 | fora de escopo ampliado |
| 8 | gate agora exige 6 saidas nomeadas do probe |
| **9 nova** | contrato de unidades — 13 campos, unidade, exemplo, quem converte |
| **10 nova** | contrato de resposta de `GET /api/variance/grade-roi` — 38 campos de `rows[]`, 14 de `meta`, nullability, 7 invariantes, tabela de erros |
| **11 nova** | registro dos 15 buracos fechados, com resposta proposta e justificativa |

A numeracao original 1-8 foi preservada de proposito: as referencias a
"secao 5 (fatos)", "secao 7 (fora de escopo)" e "secao 8 (baseline)" espalhadas
pelo restante da documentacao continuam validas.

### Os dois achados que mudam a implementacao

**B-01 — o EV estava errado, nao so impreciso.** O resumo multiplicava `buyIn`
(a parte que vai ao prize pool) pelo ROI. Mas o ROI da Biblioteca tem como
denominador o **investimento total** (`computeGroupMetrics`:
`totalProfit / (buyIns + reentradas)`, e `tournaments.buyIn` e o total pago).
Base errada => investimento e EV subestimados em ~9%, o rake inteiro. RF-09
agora fixa `totalBuyIn` como base e traz teste numerico fechado
(55 x 100 x 0.10 -> 5500 / 550; a implementacao do prototipo devolve 5000 / 500
e falha).

**D-2 ponto 1 — o nivel de casamento com horario compara relogios diferentes.**
A janela de 2h da Biblioteca sai de `datePlayed` em **UTC** (`getUTCHours`, de
proposito); a grade guarda `time` como texto **local** `"HH:MM"`. Com BRT o
deslocamento e sistematico e invisivel, porque o fallback devolve um numero
plausivel. Isso e insumo para o ADR, nao decisao tomada.

---

## Decisao do founder ja tomada nesta sessao

**B-08 fica NO ESCOPO.** Remover o mapeamento `Add-on -> Vanilla` de
`normalizeType` no `/buckets-aggregate`. E uma linha, mas depois do ADR-251
esse mapeamento apaga um tipo legitimo — numero errado perde para numero
ausente. **Exige teste proprio.** (pm-spec havia oferecido registrar como
divida na secao 7; a resposta foi manter como correcao.)

---

## Proximo passo — briefing pronto do system-architect

Invocar o agente `system-architect`, Opus 5 / `xhigh`, com este escopo:

**Entregar:** ADR-252 em `Docs/architecture/decisions/252-*.md` (formato Michael
Nygard, PT-BR, mesmo tom dos vizinhos) fechando as **SETE** decisoes da secao 4
da spec, mais diagrama Mermaid do fluxo
`grade -> casamento -> linha -> simulacao` em
`Docs/architecture/diagrams/calculadora-mtt-t2/`.

**Numero do ADR:** 252 esta livre. **Atencao:** 250 esta ocupado por um arquivo
ainda nao commitado de OUTRA sessao (`250-range-lab-f5a-graficos.md`).

**As sete decisoes** (enunciado completo e contexto na secao 4 da spec):

| # | Decisao |
|---|---|
| D-1 | fonte do ROI — consumir a Biblioteca inteira (`includeBelowFloor`) ou respeitar o piso de exibicao; qual dos tres limiares (`FAMILY_GROUP_FLOOR=10`, `MIN_GROUP_VISIBLE`, `LOW_SAMPLE_VOLUME=20`) governa uso e qual governa exibicao |
| D-2 | cascata de casamento — ordem dos niveis, onde parar, se compara horario (e sob qual conversao UTC/local), volume minimo por nivel |
| D-3 | chave de identidade da linha — assinatura de nome vs dimensoes vs a via nao explorada `planned_tournaments.libraryTemplateId` |
| D-4 | metodo do clamp — corte duro vs shrinkage por amostra (os limites [-20%, +40%] o founder ja fixou; a decisao e o metodo) |
| D-5 | semantica do rake — ratificar `buyIn_prizepool x (1 + markup) = totalBuyIn`, onde a conversao mora, se o cap de 40% e um so |
| D-6 | limites de simulacao + o segundo custo, que ninguem olhou: `/grade-roi` recarrega e reagrupa o historico inteiro a cada clique |
| D-7 | rake de fonte propria — `tournaments.rake_pct` ja existe e esta 100% NULL; decisao por rede, nao global; sprint separada se sim |

**Autorizacao concedida e ainda nao usada:** o architect pode rodar **probe
`tsx` read-only** contra o banco local para sustentar D-2 (distribuicao real dos
niveis de casamento, e se a conversao de fuso muda o casamento). Banco:
`postgresql://grindfy@localhost:5433/grindfy`, usuario de teste **USER-0005**.
Leitura apenas — nenhum `INSERT`/`UPDATE`/`db:push`.

---

## Restricoes que valem para todos os estagios seguintes

1. **Sem migration nova.** Nao ha.
2. **Nao tocar nos arquivos de outra sessao** (Range Lab, trabalho em curso na
   main): `Docs/specs/range-lab/**`, `Docs/architecture/decisions/250-*`,
   `Docs/architecture/diagrams/range-lab-f5a/`,
   `tests/unit/combo-calc/zzz-f5a-probe.test.ts`,
   `docs/architecture/decisions/README.md`.
3. **Os sete cenarios da secao 6 sao o PISO da red phase, nao o teto** — cada um
   e um bug que aconteceu de verdade. Com a revisao, o piso subiu para 6.1-6.15.
4. **O prototipo e referencia, nao entrega.** O implementer pode reaproveitar
   `gradeRoiMatcher.ts`, `shared/poker-sites.ts` e o endpoint `/grade-roi`, mas
   **os testes mandam**.
5. **Gate de fechamento (secao 8): prova no dado real.** Suite verde nao prova
   nada aqui — a sessao anterior teve 66 testes verdes com a tela mentindo em
   seis pontos. Probe `tsx` contra o banco local (USER-0005) imprimindo as seis
   saidas nomeadas da secao 8, para o founder reconhecer a grade dele. Mais
   verificacao no `:3000` **reiniciado**, com o botao clicado de verdade.

---

## Onde esta cada coisa

| Arquivo | Papel |
|---|---|
| `Docs/specs/calculadora-mtt-grade-roi.md` | spec refinada — **fonte de verdade** |
| `Docs/architecture/decisions/251-rebuy-nao-e-addon.md` | pre-requisito ja fechado (migration 0101) |
| `git show f021a91f` | prototipo funcional, com o diario de bordo dos bugs no corpo do commit |
| `server/services/gradeRoiMatcher.ts` | helpers puros do prototipo (477 linhas) |
| `shared/poker-sites.ts` | aliases de rede + tabela de rake por site |
| `server/routes/variance.ts` | `/grade-roi` + `/buckets-aggregate` |
| `client/src/components/primedope/AggregationWizard.tsx` | a tela |
| `tests/unit/grade-roi/gradeRoiMatcher.test.ts` | 33 testes do prototipo |

Baseline do dado real, ja com o ADR-251 aplicado (referencia, nao meta):
perfil A = 222 torneios -> 48 linhas, 40 casando no nivel mais especifico,
5 sem amostra do proprio site (Bodog, que realmente nao tem historico).
Perfil B = 193 torneios e **zero** dias ativos -> 0 linhas.

# Frentes abertas — 2026-08-19

Tres trabalhos em curso ao mesmo tempo. Este arquivo existe para retomar
qualquer um deles de uma sessao fria, sem reabrir decisao ja tomada.

| # | Frente | Estado | Retomar por |
|---|---|---|---|
| 1 | **Range Lab** | em curso, falta finalizar | `Docs/specs/range-lab/` (F5a em aberto) |
| 2 | **Torneios — Biblioteca** | auditoria decidida, **nao iniciada** | `Docs/specs/biblioteca-torneios-auditoria.md` |
| 3 | **Calculadora MTT (T2)** | **BLOQUEADA** pela frente 2 | `Docs/specs/calculadora-mtt-t2-pipeline-estado.md` |

## Dependencia

```
Biblioteca (varredura read-only -> correcao)  ->  Calculadora T2 (ADR-252 -> testes -> impl)
```

A Calculadora consome a Biblioteca como fonte de ROI. Mexer na Calculadora antes
de a Biblioteca estar confiavel constroi em cima de numero errado. **Range Lab e
independente das outras duas** — pode andar em paralelo.

## 1. Range Lab

Trabalho em curso **na working tree, ainda sem commit**, feito por OUTRA sessao:
`Docs/specs/range-lab/F5a-detalhamento.md`,
`Docs/architecture/decisions/250-range-lab-f5a-graficos.md`,
`Docs/architecture/diagrams/range-lab-f5a/`,
`tests/unit/combo-calc/zzz-f5a-probe.test.ts`.

Historico: F0-F2 concluidas em 2026-08-18, F4 cancelada, F3 quebrada em F3a+F3b
(ambas fechadas, ADR-248/249). Ordem ativa: F5a -> F5b.

**Cuidado:** o ADR **250** ja esta ocupado por esse arquivo nao commitado. O
proximo ADR livre para as outras frentes e o **252** (251 e o rebuy/add-on).

## 2. Torneios — Biblioteca de Torneios

Bug reportado pelo founder: "Ultimos 6M" so mostra GG e CoinPoker; WPN, Chico,
PokerStars, PartyPoker e 888Poker somem, mesmo tendo historico na janela.

Provado no dado real (USER-0005): a tela entrega **4 familias / 2 sites / 44
torneios** onde deveria entregar **33 familias / 5 sites / 603 torneios** — e a
janela real de 180 dias tem **1566 torneios em 7 sites**.

Duas causas empilhadas: `period='180d'` nao existe no switch do storage e cai no
`default` de 30 dias; depois o `FAMILY_GROUP_FLOOR = 10` apaga o que restou. O
estrago passa da Biblioteca (ha DOIS switches de periodo com vocabularios
divergentes e o mesmo default silencioso).

**Decisao do founder:** varredura **read-only primeiro** — auditar tudo com
probes no dado real, sem tocar em codigo, e so entao abrir sprint de correcao
com spec + ADR + TDD. Checklist completo da varredura no arquivo da frente.

Primeiro probe ja commitado: `scripts/audit-library-period.ts`
(`npx tsx --env-file=.env scripts/audit-library-period.ts`).

## 3. Calculadora MTT (sprint T2)

Pipeline TDD parado ao fim do estagio 1. `pm-spec` **concluido** (spec refinada,
251 -> 857 linhas, com contrato de unidades, contrato de resposta e 15 buracos
registrados). `system-architect` (ADR-252) **nao iniciado**.

Bloqueada pela frente 2: a decisao **D-1** do ADR-252 (fonte do ROI / piso de
exibicao) depende do que a Biblioteca decidir sobre o proprio piso.

Decisao ja tomada e que **nao** deve ser reaberta: o buraco **B-08** (remover
`Add-on -> Vanilla` do `/buckets-aggregate`) fica no escopo do T2 e exige teste.

## Aviso de ambiente

Em 2026-08-19 havia **duas sessoes editando `B:\grindfy` ao mesmo tempo** — a do
Range Lab e esta. A working tree acumulou arquivos de frentes diferentes
(Suprema Poker, grade-planner, GrindSessionLive, testes). **Sempre `git add`
explicito por arquivo**; nunca `git add -A`. Ver
`Docs/conventions/multi-sessao-agentes.md`.

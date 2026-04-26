# ADR-036: Buy-in Efetivo Zero e ROI Individual Null em Torneios via Ticket

## Status
Aceito

## Data
2026-04-26

## Contexto

A feature de Gestao de Tickets de Satelite (spec `docs/specs/satellite-tickets-management.md`) introduz o conceito de **torneio entrado via ticket**. Quando um jogador joga um satelite e ganha um ticket de $215 para o WSOP Online ME, e depois consume esse ticket no proprio WSOP, ele NAO pagou cash naquele momento — pagou no satelite original.

Isso cria uma pergunta nao-trivial: **como tratar o `buyIn` do torneio alvo (WSOP) no calculo de ROI/profit individual e agregado?**

### Sintomas do problema

Sem decisao explicita, o sistema produziria:

1. **ROI individual distorcido positivamente:** se o jogador ganha $5.000 no WSOP entrado via ticket, com `buyIn=$215` armazenado em `tournaments.buyIn`, calcular `profit = prize - buyIn = 5000 - 215 = 4785` e `ROI = 4785/215 = 2225%` — atribuindo o lucro a UM torneio quando o custo real foi pago em outro.

2. **ROI individual undefined math:** se considerarmos `effectiveBuyIn=0`, entao `ROI = (prize - 0) / 0 = infinito` ou `NaN` — nao tem semantica util e quebra graficos.

3. **Bucket de buy-in confuso:** se `buyIn=0`, o torneio cai no bucket "$0" do dashboard "performance por buy-in" — escondendo torneios de high-stakes em uma faixa vazia.

4. **Profit agregado correto exige consistencia:** se o satelite custa $50, gera ticket $215, jogador ganha $5.000 no torneio alvo:
   - Custo total real = $50 (satelite) + $0 (alvo via ticket) = $50.
   - Lucro total = $5.000 + (resultado do satelite, que e $0 cash + $215 ticket).
   - Sem normalizacao, dashboard somaria `buyIn=$50 + buyIn=$215 = $265` como custo, contando o ticket 2x.

### Restricoes

- **Auditabilidade.** O `buyIn` nominal (valor de inscricao do torneio alvo) precisa permanecer no DB para filtros e referencia. Nao podemos zerar `tournaments.buyIn`.
- **Compatibilidade reversa.** Dashboard, library, scoring atual usam `tournaments.buyIn` em multiplos lugares. Mudar significado quebra tudo.
- **ROI agregado correto.** Conjunto satelite+alvo precisa render ROI verdadeiro: `(prize_alvo - buyIn_satelite - rakes) / buyIn_satelite`.

## Opcoes Consideradas

### Opcao A: ROI implicito = `prize / ticket_value`

Tratar o ticket como custo virtual: `effectiveBuyIn = ticketValueUSD` (do ticket consumido).

**Pros:**
- ROI individual tem numero finito.
- Permite ranking de torneios via ticket por "performance vs valor do ticket".

**Contras:**
- **Double-count.** O ticket value ja foi pago via satelite (que ja entra no agregado com seu proprio buyIn). Contar de novo no torneio alvo soma 2x o custo.
- Exige join `tickets` -> `tournaments` em todas as queries de ROI individual. Custo de complexidade alto.
- Cancelamento ou expiracao do satelite original (refund da rede) destruiria a coerencia retroativa.

### Opcao B: ROI individual = `(prize - ticketValueUSD)` (lucro implicito sobre o ticket)

Tratar o ticket como custo de oportunidade.

**Pros:**
- Numero finito.
- Comparavel a torneios cash em termos de "lucro absoluto sobre o investimento implicito".

**Contras:**
- Mesma `double-count` problem da opcao A em agregados.
- ROI percentual ainda nao esta definido — `ROI = (prize - ticketValueUSD) / ticketValueUSD` traz mesma distorcao.

### Opcao C: Manter `buyIn` nominal como custo no calculo individual (status quo nao-feature)

Ignorar a feature de ticket. `profit = prize - buyIn`, `ROI = profit / buyIn`.

**Pros:**
- Zero mudanca de codigo.

**Contras:**
- ROI individual claramente errado (jogador NAO pagou esse cash).
- Profit total agregado errado (subtraindo buyIn do alvo + buyIn do satelite — double-count na direcao oposta).
- A feature inteira perde proposito.

### Opcao D (ESCOLHIDA): `effectiveBuyIn=0` no torneio alvo + ROI individual = `null`

Helper `getEffectiveBuyIn(tournament)` retorna:
- `0` se `tournament.enteredViaSatellite === true`.
- `tournament.buyIn` caso contrario.

`profit = prize - effectiveBuyIn - rake`. Para torneios via ticket: `profit = prize - 0 - rake = prize - rake`.

`ROI individual` retorna `null` quando `effectiveBuyIn === 0` (porque divisao por zero nao tem semantica util). UI exibe "—" em vez de numero.

`buyIn nominal` (`tournaments.buyIn`) preservado para:
- Filtros "performance por buy-in" — torneio cai no bucket do nominal, NAO no bucket "$0".
- Display "voce jogou um $215 buy-in" no card.
- Audit/IR/exports.

**Pros:**
- **Coerencia agregada.** Custo do satelite ja conta no agregado via `tournaments.buyIn` do satelite. Custo do alvo e $0. Prize do alvo soma corretamente. ROI agregado = `(sum_prizes - sum_effective_buyIns - sum_rakes) / sum_effective_buyIns`.
- **Honestidade matematica.** ROI individual `null` e mais honesto do que numero distorcido. Reflete o fato de que o custo individual e indefinido — pertence a um conjunto.
- **Bucket nominal preservado.** Distribuicao de field/buy-in continua refletindo realidade.
- **Helper unico** centraliza decisao em `shared/scoring.ts`. Trocar significado em v2 e mudar uma funcao.

**Contras:**
- UI precisa lidar com `null` em todos os componentes que renderizam ROI individual (graficos, tabelas, cards).
- KPI "Tickets ROI" (lucro especifico de torneios via ticket) precisa ser calculado separadamente — opcao para v2.
- Queries SQL de ROI agregado precisam excluir torneios com `effectiveBuyIn=0` do divisor OU usar o satelite original como custo. Decisao explicita: usar ROI agregado padrao com sum de effectiveBuyIn, e o satelite ja entra com seu buyIn nominal no sum, o que produz custo correto.

## Decisao

Adotar **Opcao D**: `effectiveBuyIn = 0` para torneios com `enteredViaSatellite=true`, `ROI individual = null`. `tournaments.buyIn` preservado como nominal para filtros e display.

### Detalhes de implementacao

```ts
// shared/scoring.ts (ou shared/utils.ts)
export function getEffectiveBuyIn(t: { buyIn: number; enteredViaSatellite?: boolean }): number {
  return t.enteredViaSatellite ? 0 : t.buyIn;
}

export function getIndividualROI(t: { prize: number; buyIn: number; enteredViaSatellite?: boolean; rake?: number }): number | null {
  const eb = getEffectiveBuyIn(t);
  if (eb === 0) return null;
  return ((t.prize - eb - (t.rake ?? 0)) / eb) * 100;
}

export function getProfit(t: { prize: number; buyIn: number; enteredViaSatellite?: boolean; rake?: number }): number {
  return t.prize - getEffectiveBuyIn(t) - (t.rake ?? 0);
}
```

### Onde aplicar

- `client/src/lib/utils.ts` (ou novo `shared/scoring.ts`): helpers acima.
- `server/scoring/*.ts`: substituir uso direto de `t.buyIn` por `getEffectiveBuyIn(t)` em toda computacao de profit/ROI agregado.
- `client/src/lib/chartColors.ts` ou helpers de dashboard: chamar helpers.
- Componentes que renderizam ROI individual: tratar `null` como "—".
- Queries SQL de bucket de buy-in: continuam usando `tournaments.buyIn` (nominal).
- Queries SQL de profit agregado: usar `(buy_in * (1 - entered_via_satellite::int))` ou equivalente — manter coluna nominal mas multiplicar por 0 quando flag.

## Consequencias

### Positivas

- Dashboards refletem realidade financeira do jogador.
- Helper unico simplifica auditoria e refactor futuro.
- ROI individual `null` e padrao defensivo — nunca produz numero matematicamente errado.

### Negativas

- Toda UI/component que mostra ROI individual precisa contemplar `null` no contrato visual ("—" ou similar).
- Queries SQL precisam de cuidado: `SUM(buy_in * (1 - entered_via_satellite::int))` ou subselects.
- KPI "Tickets ROI" (lucro especifico do conjunto de torneios via ticket) precisa de implementacao dedicada em v2.

### Neutras

- Performance: mesmo cost — multiplicacao trivial. Sem impacto.
- Migracao: zero — apenas codigo de calculo muda. DB schema preservado. Tournaments antigos sem `enteredViaSatellite=true` nao sao afetados.

## Confianca

Alta. A decisao reflete consenso comum em produtos de bankroll management para poker pro (similar abordagem em PokerTracker/Holdem Manager para "BBs ganhos via tickets" tratados separadamente).

## Spec compliance

Decisao alinhada exatamente com **RF-06** da spec `satellite-tickets-management.md`:

> "Buy-in efetivo (custo real): 0 — o jogador nao pagou cash naquele momento.
> Buy-in nominal (referencia): mantido em tournaments.buyIn (valor que aparece em filtros, dashboard de field/buy-in).
> ROI do torneio individual: (prize - 0) / 0 = infinito — **nao computar** ROI individual em torneios via ticket."

Este ADR formaliza a decisao para que outros agentes (test-writer, implementer) tenham contexto historico se a duvida ressurgir.

## Referencias

- Spec: `docs/specs/satellite-tickets-management.md` RF-06
- ADR-031: Modelo ortogonal de tipos de torneio (where `enteredViaSatellite` lives)
- ADR-034: Multi-wallet com FX historico (relacionado, mas independente)

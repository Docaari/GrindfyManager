---
description: Invariantes da fonte do historico, conversao de moeda, parser CSV e agregacao financeira
paths:
  - "server/storage.ts"
  - "server/storage/**"
  - "server/csvParser.ts"
  - "server/routes/dashboard.ts"
  - "server/routes/tournaments.ts"
  - "server/routes/bankroll.ts"
  - "server/routes/wallets.ts"
  - "server/scoring/**"
  - "server/services/walletService.ts"
  - "server/services/fx/**"
---

# Zona critica: dominio de dados

Tres invariantes. Cada uma ja quebrou em producao.

## 1. Fonte do historico (CLAUDE.md secao 6.1)

- `tournaments` **com `grind_session_id IS NULL`** = historico do jogador.
  Origens: import CSV, Sharkscope, planilha, criacao manual na grade.
- `session_tournaments` = registro do grind ao vivo. Visivel **so** no detalhe da
  sessao e no Daily Debrief. Nunca em dashboard, analytics, library, quick-stats,
  ROI por plataforma.

Toda query de metrica filtra. `buildPeriodCondition` ja injeta
`isNull(tournaments.grindSessionId)`; **queries inline em `routes/dashboard.ts` e
metodos com period proprio precisam do filtro explicito**
(`getTournaments`, `getPerformanceByPeriod`, `getTournamentLibrary`,
`getAnalyticsByModifier`).

Sintoma quando quebra: o dashboard soma torneio duas vezes e ninguem ve erro na
tela. `client/src/components/SessionTracker.tsx` esta morto e POSTa errado — nao
reutilizar.

## 2. Moeda

Converta para USD **antes** de comparar, somar ou classificar. Sem cotacao:
`null` + `degradedReason`, nunca `?? 1`.

O bug do grind-live passou porque `calculateSessionStats` ignorava o 5o argumento
`usdConversionRates`. Ao mudar assinatura de funcao financeira, confira todos os
callsites — argumento posicional novo some em silencio.

`numeric` do pg chega como string: converta na fronteira, cheque
`Number.isFinite`.

## 3. Parser CSV (`csvParser.ts`)

Redes: WPN, GGNetwork, PokerStars, PartyPoker, 888, Bodog/Bovada, CoinPoker,
Chico, Revolution, iPoker.

- Regex nova nasce com **o caso que resolve e o caso vizinho que ela nao pode
  quebrar**. Sem os dois, nao entra.
- Cada rede muda por razao propria: nao unifique parsers "parecidos" (guia 08).
- Campo nao encontrado vira aviso acumulado, nunca default silencioso. Ja
  gravamos `Vanilla` para todo tipo de torneio e ninguem percebeu por semanas; ja
  importamos CSV que saiu vazio sem erro.
- Import grande: performance importa (`Docs/specs/fix-bulk-import-performance.md`).

## Agregacao financeira

- Somar so o que esta na mesma moeda e no mesmo escopo (`grind_session_id IS NULL`).
- Snapshot de bankroll e historico: nao recalcular o passado ao mudar regra nova.
- Transacao de wallet e atomica; nao abrir tx dentro de service ja transacional.

## Testes desta area

`npx vitest run tests/unit` para os helpers puros;
`tests/integration` para storage + rota. Mock com o shape **real** do storage —
mock idealizado ja escondeu tres bugs CRITICAL de uma vez (lesson #3).

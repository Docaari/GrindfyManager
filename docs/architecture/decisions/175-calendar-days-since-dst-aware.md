# ADR-175 — `calendarDaysSince`: diff de dias civis DST-aware

**Data:** 2026-05-21
**Status:** Aceito
**Sprint:** UX-QW-3 RF-03

## Contexto

O codebase tem 4+ implementacoes locais de `daysSince` (`WalletStalenessBadge`, `dailyInsight`, `Dashboard` inline, `mentalPrepUtils`) usando:

```ts
Math.floor((now.getTime() - then.getTime()) / 86_400_000)
```

Esta forma calcula "milisegundos divididos por 24h" — NAO "diferenca em dias civis no fuso do usuario". Quebra em transicoes DST:

- **Spring forward (US/EU):** dia de 23h. Dois timestamps em dias civis consecutivos podem dar `0.96 dias` -> `Math.floor = 0` (errado, devia ser 1).
- **Fall back:** dia de 25h. Pode dar `1.04 dias` -> `Math.floor = 1` quando devia ser 0 ou 1 dependendo da hora exata.
- **Cross-timezone:** se `now` esta em `UTC` mas o user vive em `America/Sao_Paulo` e cruzou meia-noite local, o diff em ms pode dizer "0 dias" mas civilmente ja eh "1 dia depois".

Sintomas observados: badges `WalletStalenessBadge` ocasionalmente mostram `1d` em vez de `2d` apos viradas de meia-noite + DST nas Americas/Europa.

## Decisao

Criar `shared/calendarDaysSince.ts` com a seguinte assinatura:

```ts
export function calendarDaysSince(
  from: Date | string,
  to: Date,
  timeZone?: string,
): number;
```

**Algoritmo:**
1. Resolver `timeZone` (default = `Intl.DateTimeFormat().resolvedOptions().timeZone`).
2. Para cada entrada, extrair `YYYY-MM-DD` no `timeZone` via `Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })`.
3. Converter cada `YYYY-MM-DD` em `Date.UTC(y, m-1, d)`.
4. Retornar `Math.round((utcTo - utcFrom) / 86_400_000)`.
5. Inputs invalidos retornam `NaN`.

**Por que `Math.round` no passo 4?** Apos extrair YYYY-MM-DD em UTC artificialmente, ambos os pontos sao 00:00:00 UTC. Diff em ms eh multiplo exato de 86_400_000. `round` defende contra ruido de ponto flutuante (improvavel mas barato).

**Por que `en-CA`?** Locale que formata `YYYY-MM-DD` de forma confiavel sem regex.

## Consequencias

**Positivo:**
- Eliminacao de off-by-one DST em 4 callsites client.
- Util shared (`shared/`) — server pode importar em sprint futura.
- Comportamento default (sem `timeZone`) usa fuso do browser do usuario.

**Negativo:**
- `Intl.DateTimeFormat` eh ~10x mais lento que aritmetica de `ms`. Para hot paths (>1000 calls/s) considerar memoizar. Atualmente nenhum callsite eh hot path.

**Neutro:**
- Server tem seu proprio fuso (resolvido via `users.timezone`); migracao server fica fora desta sprint para evitar tocar IA layer.

## Alternativas consideradas

1. **date-fns `differenceInCalendarDays` + `date-fns-tz`:** ja temos `date-fns` no projeto, mas `date-fns-tz` adiciona ~30KB. Util custom de 20 linhas resolve melhor sem dep extra.
2. **Luxon `DateTime.diff(other, 'days')`:** dep nova grande. Veto.
3. **Manter aritmetica de ms + aceitar erro:** rejeitado — sintomas ja observados em prod e o fix eh barato.

## Migracao

Callsites:
- `client/src/components/bankroll/WalletStalenessBadge.tsx:40`
- `client/src/lib/home/dailyInsight.ts:82`
- `client/src/pages/Dashboard.tsx:244`
- `client/src/lib/mentalPrepUtils.ts:60`

Cada um passa `useUserTimezone()` quando hook disponivel; fallback omitir o arg (= browser timezone).

## Refs

- Sprint spec: `Docs/specs/sprint-ux-qw-3.md` RF-03.
- Lesson #6 (conversao moeda): mesma classe de bug — comparar grandezas heterogeneas sem normalizar.

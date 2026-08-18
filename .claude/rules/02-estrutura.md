---
description: Onde cada coisa mora no Grindfy, a regra de dependencia e onde ficam os testes
---

# Estrutura

```
client/src/          pages/ components/ contexts/ hooks/ lib/ types/
server/
  index.ts           entry, porta 3000, registro das rotas
  routes/            17 modulos, um por dominio
  storage.ts         camada de dados (+ storage/<dominio>Storage.ts por attach)
  services/          efeitos externos (wallet, email, FX, arquivos, Spotify)
  coach/             prompts, tools, geradores, elegibilidade, jobs
  scoring/           Tournament Selector + normalizador de moeda
  csvParser.ts       parser multi-rede
shared/              schema Drizzle + Zod + helpers puros
migrations/          drizzle-kit + rollback manual
tests/               unit/ integration/ client/ hooks/
Docs/                specs, architecture (ADR + mermaid), api, conventions
memory/              memoria de sessao (indice em MEMORY.md)
```

## Regra de dependencia

`shared/` nao importa `server/` nem `client/`. `client/` nao importa `server/`.
`server/routes/` nao escreve query Drizzle — chama `storage`. `services/` nao
conhecem `req`/`res`.

Aliases: `@/` = `client/src/`, `@shared/` = `shared/`, `@assets/` = `attached_assets/`.

## Onde colocar codigo novo

1. Regra pura (calculo, formato, validacao) -> `shared/` ou helper puro em
   `server/coach/**` / `server/scoring/**`, com teste unitario.
2. Query -> `server/storage.ts`, ou `server/storage/<dominio>Storage.ts` novo
   (attach pattern) quando o dominio for grande.
3. Efeito externo -> `server/services/**`.
4. HTTP -> `server/routes/<dominio>.ts`.
5. Tela -> `client/src/pages/**` + `client/src/components/<dominio>/`.
6. Token visual -> `@/lib/ui-tokens`. Nunca valor solto.

Nao encaixou em nenhum? E conceito novo: exige spec e ADR, nao improviso.

## Documentacao — qual arquivo para qual tarefa

| Tarefa | Ler |
|---|---|
| Feature do Coach | `Docs/api/coach.md` + `coach-tools.md` |
| Bankroll / wallets | `Docs/architecture/bankroll-index.md` + `Docs/api/bankroll.md` |
| Endpoint novo | `Docs/api/endpoints-index.md` |
| Schema / migration | `Docs/architecture/data-model-index.md` |
| UI / componente | `Docs/conventions/ui-patterns.md` + `z-index.md` |
| Testes | `Docs/architecture/lessons-learned.md` secao Testing |
| Metodo de trabalho | `Docs/desenvolvimento/` + `CONSTITUICAO.md` |

Decisao arquitetural gera ADR numerado em `Docs/architecture/decisions/`.

## Testes

`tests/unit/` (node), `tests/integration/` (rotas + storage mockado),
`tests/client/` (jsdom/RTL), `tests/hooks/` (jsdom, exige config — lesson #30).

Rodar: `npx vitest run tests/<area>`. Suite inteira antes de fechar sprint
transversal. `npm run check` sempre.

## Sessoes paralelas

Uma sessao por area, todas na main. Trabalho paralelo de verdade vai para
worktree (`.claude/worktrees/`). Duas sessoes no mesmo diretorio ja fez commit
cair na branch errada. Detalhe em `Docs/conventions/multi-sessao-agentes.md`.

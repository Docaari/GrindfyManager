# Steerings — as regras que carregam sozinhas

## O problema que eles resolvem

A IA le um numero limitado de coisas por vez. Esse espaco e disputado: o pedido,
o historico da conversa, os arquivos abertos, as regras do projeto.

Duas saidas ruins:

- **Colocar tudo num arquivo gigante.** A IA carrega milhares de linhas de regra
  toda sessao, o essencial se perde no detalhe, e o modelo comeca a ignorar
  metade. *Um `CLAUDE.md` inchado e pior que um curto.*
- **Nao colocar nada.** A IA improvisa e voce corrige a mesma coisa toda semana.

Steering e o meio: **regra escrita uma vez, carregada so quando e relevante.**

### O caso do Grindfy, sem rodeio

Nosso `CLAUDE.md` tem **77 KB**. A secao 6 sozinha e um changelog de migrations
com dez paragrafos que so importam no dia do deploy. Isso e carregado inteiro em
toda sessao, inclusive quando o trabalho e trocar a cor de um chip.

Nao da para apagar aquilo — e informacao real e cara (migration pendente em PROD
que ninguem pode esquecer). Da para **mover para onde ela e lida quando importa**:
o detalhe de migration vive em `.claude/rules/12-schema-migrations.md`, que so
entra quando alguem abre `shared/schema.ts`, `migrations/**` ou `server/storage*`.

Este conjunto de `rules/` ja existe. O passo seguinte — enxugar o `CLAUDE.md`
para indice — exige aval do founder (CLAUDE.md secao 13) e esta como proposta no
fim deste guia.

## Os dois tipos

### Sempre carregado

Fica em `.claude/rules/` **sem** o campo `paths`. Entra em toda sessao, com o
mesmo peso do `CLAUDE.md`. So entra o que e verdade **sempre**:

| Arquivo | O que tem |
|---|---|
| `00-produto.md` | para quem e, o que resolve, o que decide uma disputa de prioridade |
| `01-tecnologia.md` | a pilha, regras sobre dependencia, concorrencia e dinheiro |
| `02-estrutura.md` | onde cada coisa mora, a regra de dependencia, os testes |
| `03-padrao-codigo.md` | nomes, erros, validacao, idioma, comentarios |
| `04-modelo-e-esforco.md` | qual modelo e qual esforco para cada tipo de trabalho |

Esse formato (produto / tecnologia / estrutura) e o que a Amazon adotou no Kiro e
virou padrao de fato. Acrescentamos padrao de codigo e modelo/esforco porque sao
os dois pontos onde a IA mais varia sozinha.

### Carregado por arquivo

Fica em `.claude/rules/` **com** `paths` no cabecalho:

```yaml
---
description: Regras invioaveis da fonte do historico, FX e agregacao financeira
paths:
  - "server/storage.ts"
  - "server/routes/dashboard.ts"
  - "server/csvParser.ts"
---
```

So entra no contexto quando a IA trabalha naqueles arquivos. Quem esta mexendo no
mini player nao paga o custo de carregar as invariantes do parser CSV.

No Grindfy:

| Arquivo | Carrega quando |
|---|---|
| `10-dominio-dados.md` | `storage*`, `csvParser.ts`, `routes/dashboard.ts`, scoring, wallets |
| `11-coach-ia.md` | `server/coach/**`, `server/routes/coach*.ts`, prompts, geradores de relatorio |
| `12-schema-migrations.md` | `shared/schema.ts`, `migrations/**`, `server/storage/**` |
| `13-testes.md` | `tests/**`, `vitest.config.ts` |
| `14-frontend-ui.md` | `client/src/**` |
| `15-rotas-express.md` | `server/routes/**`, `server/index.ts` |

**Aviso pratico:** a carga por `paths` dispara de forma confiavel quando a IA
**le** um arquivo que casa com o padrao. Ha relatos de que nem sempre dispara
quando ela so **escreve** um arquivo novo. Por isso as invariantes mais caras
(secao 6.1, FX->USD, ordem de rota, fail-open de permissao) estao **tambem** no
`CLAUDE.md` e **tambem** no hook `avisar-zona-critica.cjs`, que injeta o lembrete
no momento da edicao. Redundancia aqui e barata; regressao no dashboard nao e.

## Como escrever um steering bom

**So o que a IA nao sabe.** Ela ja sabe o que e Zod, o que e um índice parcial e
como funciona TanStack Query. Nao explique. Escreva o que e especifico daqui: que
`buildPeriodCondition` ja injeta `isNull(tournaments.grindSessionId)` mas as
queries inline em `routes/dashboard.ts` precisam do filtro explicito.

**Cada linha justifica o espaco que ocupa.** Se a frase pode sair sem perda, tire.

**Escreva o porque junto com a regra.** "Converta para USD antes de comparar" a
IA obedece por um tempo. "Converta para USD antes de comparar **porque** o
grind-live guarda buy-in em moeda nativa e o threshold de bankroll e em dolar, e
o bug passou por 5 sessoes sem ninguem ver" a IA consegue aplicar num caso que
voce nao previu.

**Aponte, nao cole.** O steering diz "detalhe completo em
`Docs/architecture/lessons-learned.md`, secao Testing". A IA le quando precisar.

**Um assunto por arquivo.** Steering que fala de Coach e de UI ao mesmo tempo
carrega metade inutil das duas vezes.

## Quando o steering vira outra coisa

| Se... | entao nao e steering |
|---|---|
| e procedimento com passos, usado de vez em quando | e uma **skill / agente** ([03](03-SKILLS.md)) |
| o computador consegue conferir sozinho | e um **hook** ([04](04-HOOKS.md)) |
| e decisao sobre uma feature especifica | e uma **spec** ([01](01-SDD.md)) |
| e decisao arquitetural com alternativas descartadas | e um **ADR** |

Regra de bolso: se da para automatizar, automatize. Texto pedindo boa vontade e o
mecanismo mais fraco dos tres.

## Conferir o que esta carregado

No CLI, `/memory` lista os arquivos de instrucao que entraram, o caminho e a
ordem. **No app isso pode nao estar disponivel** — entao a checagem barata e
perguntar no comeco da sessao:

> "quais arquivos de `.claude/rules/` estao no seu contexto agora?"

Se a resposta nao citar os `00-04`, os steerings nao estao sendo carregados por
esta versao do app. Nesse caso o conjunto continua util (a IA le sob demanda,
e o `CLAUDE.md` secao 15 aponta para eles), mas as invariantes caras passam a
depender do hook `avisar-zona-critica.cjs`, que roda independente disso.

Faca essa verificacao uma vez. Nao e para repetir toda sessao.

## Proposta pendente de aval

Enxugar `CLAUDE.md` de 77 KB para um indice de ~200 linhas, movendo:

| Secao atual | Destino |
|---|---|
| 6 (changelog de migrations 0075..0094) | `.claude/rules/12-schema-migrations.md` + `Docs/architecture/data-model-index.md` |
| 6.1 (fonte do historico) | `.claude/rules/10-dominio-dados.md` (fica tambem no indice, e caro demais) |
| 9 (lessons 1..38) | `.claude/rules/13-testes.md` + ponteiro para `lessons-learned.md` |
| 10 (roadmap/status de sprint) | `Docs/strategy/` + `memory/` |

Ganho estimado: a sessao comeca com ~10 KB de regra em vez de 77 KB, e o que
sobra e lido de verdade. Custo: um dia de trabalho e risco de perder ponteiro —
por isso e proposta, nao acao.

---

Fontes: [Steering — Kiro](https://kiro.dev/docs/steering/) ·
[How Claude remembers your project](https://code.claude.com/docs/en/memory) ·
[How Claude Code Loads .claude/rules](https://konadu.dev/how-claude-code-loads-claude-rules)

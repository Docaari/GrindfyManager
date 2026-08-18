# Constituicao do Grindfy

Principios inegociaveis que governam toda geracao de codigo neste repositorio.
Nao sao preferencia de estilo: cada artigo existe porque a violacao dele custou
tempo ou dinheiro de verdade, com registro em `Docs/architecture/lessons-learned.md`
ou nas memorias de sessao.

Principio pode mudar. Mudar exige escrever **por que**, com data, na tabela de
emendas no fim.

---

## Artigo I — Regressao e o bug mais caro

Feature nova que quebra feature velha e prejuizo liquido. Antes de mudar
comportamento existente:

1. Listar as lessons-learned e os ADRs que tocam a area.
2. Ter um teste que falha hoje e passa depois.
3. Nomear o caso vizinho que **nao** pode mudar de resultado.

O jogador nao percebe o que voce adicionou; percebe o que parou de funcionar.

## Artigo II — Regra de negocio sem teste nao existe

Calculo de dinheiro, elegibilidade de plano, filtro de historico, scoring,
variancia, pace de meta: cada um nasce com teste unitario na mesma sprint.

Teste que so exercita o caminho feliz nao conta. O caso que protege e o
degradado: sem cotacao, sem dado, valor absurdo, plano expirado.

## Artigo III — Nao construir para o futuro imaginado

Resolve-se o problema que existe hoje. Sem abstracao nova para um caso so, sem
tabela para "quando tivermos", sem sistema de plugin para uma segunda integracao
que ninguem pediu.

O futuro chega diferente do imaginado, e a abstracao errada e mais cara que a
duplicacao (guia 08).

## Artigo IV — Falhar calado e proibido

`catch {}` vazio, `?? 0` em dinheiro, `?? 1` em cotacao e `|| []` em lista que
deveria existir sao proibidos.

Quando nao da para saber, o resultado e `null` com razao nomeada
(`degradedReason`) e aviso acumulado — nunca um numero plausivel inventado.
Log antes de qualquer fallback: distinga "no rows" de "DB explodiu".

## Artigo V — Uma fonte de verdade

O mesmo dado nao mora em dois lugares. Quando a plataforma obriga a duplicar
(TypeScript no cliente e SQL no banco; helper puro no `shared/` e coluna
derivada), os dois tem teste comparando com a mesma fonte.

Corolario do dominio: `tournaments` com `grind_session_id IS NULL` e o historico;
`session_tournaments` e detalhe de sessao ao vivo. Nenhuma metrica de dashboard,
analytics ou library mistura os dois.

## Artigo VI — Dinheiro se compara na mesma moeda

Todo threshold do produto e em USD. Valor nativo se converte **antes** de
qualquer comparacao, soma ou classificacao. Sem cotacao, a operacao degrada; nao
chuta.

Valor `numeric` chega do Postgres como string: converter na fronteira do storage,
explicitamente.

## Artigo VII — Usar a plataforma direto

Express, Drizzle, Zod, TanStack Query, Radix. Sem camada de abstracao propria por
cima do que o framework ja resolve, sem container de injecao, sem dependencia
nova para o que trinta linhas resolvem.

Dependencia nova em `package.json` e decisao do founder, nao do agente.

## Artigo VIII — Acesso e fail-closed

Rota nasce com `requireAuth` e com o gate de permissao/tier correto. Ownership
vai no `where` da query, nao so num `if` do handler.

Middleware que na duvida libera e furo, nao conveniencia (ADR-240).

## Artigo IX — Producao e territorio do founder

`git push`, deploy, `db:push` em producao e qualquer acao visivel a terceiros
exigem pedido explicito. Migration nasce com `_rollback.sql`, e aplicada no local
e fica registrada como PENDENTE PROD ate o founder mandar aplicar.

Em dev, reversivel e barato: faz. Irreversivel ou visivel: pergunta.

---

## Como esta constituicao e usada

- `pm-spec` e `system-architect` conferem os artigos nos portoes (guia 01).
- `reviewer` cita o artigo violado; violacao de artigo e **bloqueia**, nao
  "deveria mudar".
- Steerings em `.claude/rules/` sao a forma operacional destes artigos.

## Tabela de emendas

| Data | Artigo | Mudanca | Por que |
|---|---|---|---|
| 2026-08-01 | — | Versao inicial, adaptada do conjunto do Run Hand | Formalizar principios que ja valiam de fato, para que o reviewer possa cita-los |

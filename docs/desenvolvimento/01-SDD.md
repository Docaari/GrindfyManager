# SDD — desenvolvimento guiado por especificacao

## A ideia em uma frase

Por decadas o codigo foi a verdade e a documentacao foi um comentario sobre ele.
O SDD inverte: **a especificacao e o artefato principal, e o codigo e a expressao
dela numa linguagem especifica.**

Isso deixou de ser filosofia quando a IA passou a implementar spec bem escrita.
Antes, spec detalhada era trabalho jogado fora — o codigo divergia em uma semana.
Hoje a spec e o que a IA le para gerar e para **regenerar**.

## Por que isso importa aqui

O Grindfy tem um catalogo de erros da IA com dezenas de entradas
(`Docs/architecture/lessons-learned.md`) e quase todas tem a mesma forma:
**alguem — quase sempre uma sessao de IA — tomou uma decisao razoavel sem saber
de uma restricao que existia.**

- Filtrar torneios sem `grind_session_id IS NULL` e uma decisao *razoavel*. Quem
  escreveu nao sabia que `session_tournaments` do grind-live envenena o dashboard
  (CLAUDE.md secao 6.1).
- Comparar buy-in com threshold sem converter moeda e uma decisao *razoavel*.
  Quem escreveu nao sabia que `usdConversionRates` chega no 5o argumento
  (`calculateSessionStats`, lesson FX do grind-live).
- Registrar `GET /api/study-sessions/:id` antes dos sub-paths e uma decisao
  *razoavel*. Quem escreveu nao sabia que Express 4 e ordem-pura e `:id` engole
  qualquer sub-path de 1 segmento (EST-3, MDA-1).
- Usar `requirePermission` numa rota nova e uma decisao *razoavel*. Quem escreveu
  nao sabia que aquele middleware era fail-OPEN (ADR-240).

Spec nao impede erro de digitacao. Ela impede **decisao razoavel tomada sem
contexto** — que e exatamente o erro que a IA mais comete neste repositorio.

## Os tres passos, mapeados nos nossos agentes

### 1. Especificar — o QUE e o PORQUE (`pm-spec`)

Saida: `Docs/specs/<feature>.md`.

A spec descreve comportamento, **nunca tecnologia**. Se aparecer nome de tabela,
nome de componente ou nome de biblioteca, a spec vazou para o plano.

Isso nao e preciosismo: e o que mantem a spec estavel quando a implementacao
muda. "O jogador precisa ver quanto do plano da semana ele cumpriu" continua
verdadeiro daqui a dois anos; "criar `goal_progress_snapshots` com UNIQUE
`(goal_ref_id, week_start_date)`" nao.

**A regra mais importante desta etapa: marcar a duvida em vez de adivinhar.**
Todo ponto ambiguo vira uma linha literal:

```
[PRECISA DECIDIR: o placar mostra P&L? RF-06 diz que nao, mas a WIG e financeira]
```

Sem isso a IA inventa resposta plausivel — e plausivel-mas-errado e o pior
resultado possivel, porque nao parece errado. Metade das pendencias que voltaram
como "NIT" ou "MEDIUM" no reviewer sao decisoes que ninguem marcou como duvida.

### 2. Planejar — o COMO (`system-architect`)

Saida: diagrama Mermaid em `Docs/architecture/` + ADR numerado em
`Docs/architecture/decisions/` + o bloco de modelo/esforco (guia 09).

Aqui entra a tecnologia. E entram os **portoes** — perguntas de sim ou nao onde
o "nao" obriga a justificar por escrito no ADR:

```
Portao da simplicidade
  resolve problema que existe HOJE?
  sem abstracao nova para um caso so?
  sem dependencia nova no package.json?
  sem tabela nova quando uma coluna resolve?

Portao da regressao
  quais lessons-learned se aplicam a esta area?  (listar por numero)
  existe teste que falha hoje e passa depois?
  o filtro da secao 6.1 continua valendo nas queries tocadas?
  precisa de migration? ela esta no CLAUDE.md como PENDENTE PROD?

Portao do contexto
  a IA LEU os arquivos que vai mudar, ou esta indo pela memoria deles?
```

O portao e o truque central do metodo. Um modelo tende a "melhorar" o que ve —
criar uma camada aqui, generalizar ali. O portao transforma isso de reflexo em
decisao que precisa ser defendida.

**No Grindfy o plano lista os casos de teste ANTES da solucao.** Quais fixtures,
o que se espera, e qual caso vizinho nao pode mudar de resultado.

### 3. Tarefas — os passos (`test-writer` -> `implementer`)

`test-writer` escreve a red phase; `implementer` faz passar sem tocar em teste.
Cada passo tem o comando que prova que funcionou:

```bash
npx vitest run tests/unit/goals/computePace.test.ts
```

A ultima tarefa e sempre a varredura de regressao: a suite inteira da area, mais
`npm run check`.

## O que NAO precisa de spec

Corrigir copy PT-BR. Ajustar espacamento. Renomear variavel local. Trocar um
threshold ja parametrizado.

**Mas qualquer coisa que toque uma zona critica precisa**, mesmo em vinte linhas.
As zonas criticas estao em `.claude/rules/` (arquivos 1X) e sao onde os bugs
caros moram: parser CSV, fonte do historico, FX, permissoes, prompts do Coach,
migrations, ordem de rotas.

## A constituicao

O spec-kit do GitHub chama de "constituicao" o conjunto de principios imutaveis
que governam toda geracao de codigo. Sem ele, cada sessao inventa um estilo.

A nossa esta em `CONSTITUICAO.md`, com nove artigos. Os tres que mais pegam aqui:

- **Artigo I** — regressao e o bug mais caro.
- **Artigo II** — regra de negocio sem teste nao existe.
- **Artigo IV** — falhar calado e proibido.

Principio pode mudar. Mudar exige escrever por que, com data, na tabela de
emendas.

## O que o SDD nao resolve

Seja honesto sobre o custo: spec para tudo e burocracia, e burocracia mata
velocidade. Se voce se pegar escrevendo 40 KB de spec para uma mudanca de tres
linhas, o processo esta errado, nao a mudanca. Nosso historico tem specs de 100 KB;
nem toda mereceu esse tamanho.

O SDD tambem nao substitui olhar o codigo. A IA precisa **ler** os arquivos que
vai mudar — o portao do contexto existe por isso.

E spec bonita nao vale nada sem teste. Por isso o Artigo II existe.

---

Fontes: [Spec-Driven Development (github/spec-kit)](https://github.com/github/spec-kit/blob/main/spec-driven.md) ·
[Diving Into Spec-Driven Development](https://developer.microsoft.com/blog/spec-driven-development-spec-kit/)

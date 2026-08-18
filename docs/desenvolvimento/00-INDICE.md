# Como desenvolvemos o Grindfy com IA

Adaptado do conjunto criado para o Run Hand (`docs/desenvolvimento/`), traduzido
para a realidade deste projeto: SaaS TypeScript full-stack, 7 agentes de
pipeline, ~250 arquivos de spec/ADR e 38k linhas de lessons-learned.

O motivo de existir e o mesmo: **sem isso, cada sessao comeca do zero e
reinventa decisoes que ja foram tomadas — as vezes de um jeito que quebra o que
funcionava.** No Grindfy isso ja aconteceu de forma documentada dezenas de
vezes; o catalogo esta em `Docs/architecture/lessons-learned.md`.

## Os quatro mecanismos

| Problema | Solucao | Onde |
|---|---|---|
| A IA nao sabe o que a gente quer, e adivinha | **SDD** — spec antes de codigo | [01](01-SDD.md) |
| A IA nao sabe as regras do projeto | **Steerings** — regras que carregam sozinhas | [02](02-STEERINGS.md) |
| A IA nao sabe executar procedimentos nossos | **Skills e agentes** — procedimento empacotado | [03](03-SKILLS.md) |
| A IA esquece a regra na hora H | **Hooks** — o computador forca, nao a boa vontade | [04](04-HOOKS.md) |

E os que sao sobre o codigo em si:

| Assunto | Guia |
|---|---|
| Como o Grindfy e montado por dentro e por que | [05 — Arquitetura](05-ARQUITETURA.md) |
| Como o codigo deve parecer | [06 — Padrao de codigo](06-PADRAO-DE-CODIGO.md) |
| O arquivo exemplar que serve de molde | [07 — Gold Standard](07-GOLD-STANDARD.md) |
| Quando repetir codigo e quando nao | [08 — DRY e SOLID](08-DRY-E-SOLID.md) |
| Qual modelo do Claude usar e com quanto esforco | [09 — Modelo e esforco](09-MODELO-E-ESFORCO.md) |
| Como tocar o dia a dia pelo app (nao pelo CLI) | [10 — Manual rapido do app](10-MANUAL-APP.md) |

---

## O ciclo, do comeco ao fim

O Grindfy ja tinha um pipeline de agentes antes deste conjunto. O que muda e que
agora cada etapa tem **portao** (pergunta de sim/nao que o "nao" obriga a
justificar) e **artefato nomeado**:

```
    ideia
      |
  pm-spec          ->  Docs/specs/<feature>.md      o QUE e o PORQUE
      |                                             + [PRECISA DECIDIR: ...]
  system-architect ->  Docs/architecture/*.mermaid  o COMO
      |                + Docs/architecture/decisions/NNN-*.md (ADR)
      |                + bloco de modelo/esforco (guia 09)
  test-writer      ->  tests/**  red phase          passos verificaveis
      |
  implementer      <-  steerings entram sozinhos conforme o arquivo aberto
      |              <- hooks injetam invariantes da zona critica
  /simplify        ->  limpeza antes da revisao
      |
  reviewer         ->  bloqueia / deveria mudar / observacao
      |
  lessons-learned.md ganha a entrada do bug + memory/session_*.md
```

O que **nao** muda: `deployer` so com pedido explicito do founder, `git push`
so com pedido, `db:push` em producao nunca sem confirmacao (CLAUDE.md secao 13).

## O que esta instalado no projeto

```
CLAUDE.md                    indice sempre carregado (77 KB — ver aviso no guia 02)
CONSTITUICAO.md              os 9 principios inegociaveis

.claude/rules/               steerings
  00-produto.md              -+
  01-tecnologia.md            | sempre carregados
  02-estrutura.md             |
  03-padrao-codigo.md         |
  04-modelo-e-esforco.md     -+
  10-dominio-dados.md        -+
  11-coach-ia.md              | carregam so quando o arquivo
  12-schema-migrations.md     | correspondente entra em jogo
  13-testes.md                |
  14-frontend-ui.md           |
  15-rotas-express.md        -+

.claude/hooks/               scripts que rodam sozinhos
  block-emojis.cjs           bloqueia emoji em codigo
  warn-destructive.cjs       avisa em comando destrutivo
  avisar-zona-critica.cjs    injeta as invariantes do arquivo editado
  lembrar-testes.cjs         lembra quais testes rodar no fim do turno
  auto-sync-agents.cjs       espelha agents/ em skills/
  session-summary.cjs        diff stat no fim da sessao

.claude/agents/              os 7 agentes do pipeline (espelhados em skills/)
.claude/teams/               5 times pre-configurados
Docs/specs/                  uma spec por sprint
Docs/architecture/decisions/ ADRs numerados
Docs/padrao/exemplo-padrao.ts   o gold standard, executavel
```

## Cola de bolso

[ANTES-DE-COMECAR.md](ANTES-DE-COMECAR.md) — uma tela, para ler antes de lancar
qualquer spec. O resto deste conjunto e o porque dela.

## Precedencia entre documentos

Quando dois documentos discordarem, vence o mais especifico:

```
CONSTITUICAO.md            principio, vence sempre
  > .claude/rules/1X-*.md  invariante da zona critica
  > .claude/rules/0X-*.md  regra geral do projeto
  > Docs/desenvolvimento/  o porque (este conjunto)
  > Docs/DOC1..DOC8        guias genericos herdados do Dev LLM Hub
```

`Docs/DOC1-guia-ia-criacao-skills.md` ate `DOC8` sao copias dos canonicos do hub
(`B:\Dev LLM`) e falam de SaaS em geral. Continuam validos como referencia; onde
divergirem deste conjunto, **este conjunto vence**, porque foi escrito contra o
codigo que existe aqui.

## Por onde comecar

Quinze minutos: [01 — SDD](01-SDD.md) e [09 — Modelo e esforco](09-MODELO-E-ESFORCO.md).
Sao os dois que mais mudam o resultado no dia a dia.

Uma hora: tudo na ordem. Cada guia tem uma secao "no Grindfy" com o que ja vale.

## Manutencao

Regra simples: **se voce corrigiu a IA duas vezes sobre a mesma coisa, isso vira
regra escrita.** Onde:

- E verdade em toda sessao? -> `.claude/rules/0X-*.md` (nao no CLAUDE.md, que ja esta cheio)
- E verdade so quando mexe em certos arquivos? -> `.claude/rules/1X-*.md`
- E principio que nao se negocia? -> `CONSTITUICAO.md`
- Da para o computador conferir sozinho? -> um hook, nao um texto
- E padrao que vale para outros SaaS da casa? -> postcard no Dev LLM Hub (`/post-learning`)

A regra das 2 ocorrencias ja existe no hub (`B:\Dev LLM\ml-loop\propagation-rules.md`).
Este conjunto so a traz para dentro do repositorio.

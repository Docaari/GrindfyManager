# Skills e agentes — procedimentos empacotados

## O que e

Uma skill e uma pasta com um `SKILL.md` que ensina a IA a executar um
procedimento. Ela pode trazer arquivos de referencia e scripts.

A diferenca para um steering e **quando carrega**:

| | Steering | Skill |
|---|---|---|
| Carrega | sempre, ou quando o arquivo casa | quando a IA reconhece que o pedido e aquele |
| E | uma regra | um procedimento |
| Custo parado | o texto inteiro (ou nada, se for por `paths`) | so o nome e a descricao |

## Divulgacao progressiva — o mecanismo

1. **Parado**, a IA so ve nome e descricao. Custo quase zero.
2. **Quando o pedido casa com a descricao**, ela le o `SKILL.md`.
3. **Se o `SKILL.md` aponta para outro arquivo**, ela le aquele so se precisar.

Por isso da para ter cinquenta skills instaladas sem pagar por elas. Voce paga so
pela que foi usada.

Duas consequencias praticas:

- **A descricao e o que mais importa.** E o unico texto que a IA ve para decidir
  se usa. Precisa dizer **o que faz** e **quando usar**, com as palavras que
  aparecem no pedido de verdade.
- **O `SKILL.md` fica abaixo de 500 linhas.** Passou disso, quebre em arquivos de
  referencia apontados **direto** do `SKILL.md` — referencia de um nivel so. Se
  `SKILL.md` -> `avancado.md` -> `detalhes.md`, a IA le o terceiro pela metade.

### O nosso problema atual

Os 7 agentes do Grindfy sao espelhados como skills por `auto-sync-agents.cjs`, e
os arquivos tem **12 KB a 22 KB cada** (`test-writer/SKILL.md` = 22 KB, ~600
linhas). Isso e o dobro do teto recomendado.

Nao e catastrofe — eles carregam so quando invocados. Mas o efeito colateral e
conhecido: instrucao no fim de um arquivo longo compete com instrucao no comeco, e
o modelo aplica melhor as primeiras. Quando um agente comeca a esquecer regra que
esta escrita, a causa provavel e essa, nao "o modelo piorou".

Correcao barata quando incomodar: mover as tabelas de exemplo e os anti-padroes
para `referencia.md` ao lado do `SKILL.md`, deixando no principal o procedimento e
os portoes.

## Descricao — o que separa uma skill que dispara de uma que nao

```yaml
# ruim: a IA nunca vai saber quando usar
description: Ajuda com relatorios

# bom: diz o que faz e quando usar, com os termos do pedido real
description: Gera o relatorio semanal do Coach a partir do bundle de dados do
  jogador. Use quando o pedido mencionar weekly report, debrief, relatorio do
  coach, report_jobs ou entrega por email.
```

Regras que valem sempre:

- **Terceira pessoa.** "Gera o relatorio", nao "Eu gero" nem "Voce pode usar".
- **Nome no gerundio ajuda:** `revisando-grade-semanal`, `depurando-import-csv`.
  Nada de `helper`, `utils`, `ferramentas`.
- **Palavras que o usuario usaria**, nao jargao interno. O founder escreve
  "grade", nao `planned_tournaments`.

## Grau de liberdade

Quanto espaco dar para a IA improvisar. A analogia da Anthropic e boa — um robo
andando:

**Ponte estreita com abismo dos dois lados** -> so existe um caminho seguro.
Instrucao exata, script pronto, sem parametro.
*No Grindfy:* aplicar migration. Escrever o `.sql` + o `_rollback.sql`, rodar no
local, registrar como PENDENTE PROD, nunca `db:push` direto em producao.

**Campo aberto** -> muitos caminhos levam ao lugar certo. Direcao geral,
confianca no julgamento.
*No Grindfy:* auditar UX de uma pagina. Depende do fluxo, do que ja existe, do
que o jogador reclama.

Errar o grau custa: liberdade demais na ponte estreita gera bug; liberdade de
menos no campo aberto gera resposta burra.

## O que ja existe aqui

Os 7 do pipeline (`pm-spec`, `system-architect`, `test-writer`, `implementer`,
`reviewer`, `deployer`, `strategist`) mais os comandos do hub (`/consult-hub`,
`/post-learning`) e os plugins (`/simplify`, `caveman`, `hookify`,
`session-report`).

## Candidatas — procedimentos que se repetem e se pagariam

Nada disto esta criado. Sao os fluxos que ja fizemos manualmente mais de tres
vezes:

| Skill | O que faria |
|---|---|
| `auditando-regressao` | varrer as lessons-learned e os invariantes de dominio contra um conjunto de mudancas, antes do reviewer |
| `aplicando-migration` | gerar `.sql` + `_rollback.sql`, aplicar no local via psql, registrar a pendencia PROD no lugar certo |
| `depurando-import-csv` | receber um CSV que importou errado, isolar a rede, propor o ajuste no parser com o caso de teste e o caso vizinho |
| `fechando-sprint` | rodar suite + `npm run check`, escrever o `memory/session_*.md`, atualizar o indice, propor o commit |
| `verificando-no-browser` | subir o :3000, navegar a superficie tocada e reportar o que quebrou (hoje isso e feito de improviso e a gente ja foi enganado por servidor stale) |

## Testar uma skill

Skill nao testada e palpite. O teste minimo:

1. Tres cenarios reais, tirados de tarefas que ja aconteceram.
2. Rodar em todos os modelos que voce usa. O que o Opus entende por omissao, o
   Haiku precisa que esteja escrito.
3. Versionar. Skill que mudou e piorou precisa voltar em minutos.

---

Fontes: [Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) ·
[Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)

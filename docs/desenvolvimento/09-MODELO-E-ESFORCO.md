# Modelo e esforco — escolher em vez de improvisar

> A regra operacional que a IA carrega esta em
> `.claude/rules/04-modelo-e-esforco.md`. Este guia explica o raciocinio.

## O problema

Duas formas de desperdicar:

- **Tudo no modelo mais caro, esforco maximo.** O limite acaba na terca e metade
  do gasto foi para ajustar copy de botao.
- **Tudo no mais barato.** Entrega rapido, o erro aparece depois, e refazer sai
  mais caro em tempo do que teria saido em token.

A saida nao e um meio-termo fixo. E **decidir por tarefa** — e escrever a decisao,
para que ela seja discutivel.

## Os dois controles

### Modelo — qual cerebro

| Modelo | O que e |
|---|---|
| **Fable 5** | O mais capaz. Feito para agente que roda por horas |
| **Opus 5** | Raciocinio profundo, trabalho agentico longo, codificacao dificil |
| **Sonnet 5** | Inteligencia de fronteira em escala — o cavalo de batalha |
| **Haiku 4.5** | Rapido e economico. Janela de 200K e **sem parametro de esforco** |

Isso vale para **quem escreve o codigo**. O modelo que o produto usa em runtime e
outra decisao, ja documentada (ADR-021, `COACH_MODEL`, `COACH_REPORT_SUMMARIZER_MODEL`):
Sonnet para narrativa de relatorio, Haiku para sumarizacao hierarquica. Nao
confunda as duas tabelas.

### Esforco — quanto esse cerebro trabalha

`low` · `medium` · `high` (padrao) · `xhigh` · `max`

O detalhe que quase ninguem percebe: **o esforco afeta todos os tokens da
resposta, incluindo as chamadas de ferramenta.** Nao e so "pensar mais".

| Esforco baixo | Esforco alto |
|---|---|
| agrupa operacoes, faz menos chamadas | faz mais chamadas, explora mais |
| vai direto a acao | planeja antes de agir |
| confirma em uma linha | resume o que mudou em detalhe |

Por isso a documentacao da Anthropic diz que **ajustar o esforco costuma ser
alavanca melhor que trocar de modelo**: trocar de modelo muda tudo; ajustar o
esforco muda a intensidade dentro de um comportamento que voce ja conhece.

## As duas estrategias de partida

**Comecar pela eficiencia.** Implemente com Haiku 4.5, teste, e suba se faltar
capacidade. Bom para volume alto e para quando latencia importa.

**Comecar pela capacidade.** Implemente com Opus 5 e desca depois. Bom para
raciocinio complexo e para onde acertar vale mais que economizar.

**No Grindfy a segunda faz mais sentido nas zonas criticas.** O custo de errar e
alto e silencioso: dashboard que soma o que nao devia, FX errado num threshold de
bankroll, migration sem rollback. Fora das zonas criticas, a primeira funciona.

## O que fazer quando o resultado esta raso

A tentacao e reescrever o prompt. A recomendacao oficial e outra: **suba o
esforco.** Modelo em esforco baixo escopa o trabalho ao que foi pedido, sem ir
alem — nao e falta de entendimento, e obediencia a instrucao de gastar menos.

Se precisa manter o esforco baixo por latencia, a instrucao ajuda: "esta tarefa
envolve raciocinio em varias etapas, pense com cuidado antes de responder".

## Cuidados que custam dinheiro

**Nao mude o esforco no meio de conversa longa.** O esforco molda o prompt
renderizado, entao mudar invalida o cache — e em sessao longa o cache e a maior
parte da economia. Escolha no comeco e mantenha. (O mesmo mecanismo que faz
divergencia de bloco de prompt custar caro no Coach.)

**No Opus 5, esforco nao encurta resposta.** Controla o volume de raciocinio, nao
o tamanho do texto. Se quiser resposta curta, peca resposta curta.

**Em `xhigh` e `max`, deixe espaco.** O modelo precisa de teto alto de tokens para
pensar e agir por ferramentas e subagentes.

**`high` e o padrao.** Passar `high` explicitamente e identico a nao passar nada.

## Subagentes — a economia que quase ninguem usa

O gargalo real nao e o modelo: e o **contexto**. Ele enche e o desempenho cai —
neste repositorio, com CLAUDE.md de 77 KB, ele ja comeca cheio.

Subagente resolve: trabalha numa janela limpa, gasta dezenas de milhares de tokens
explorando, e devolve mil ou dois mil de conclusao destilada.

A divisao que funciona:

- **Quem decide** roda alto: Opus 5.
- **Quem executa e varre** roda economico: Sonnet 5 em `medium`, ou Haiku quando e
  so leitura.

No Grindfy isso cabe direto em: varrer lessons-learned procurando vizinhos da
mudanca, rodar a suite e resumir o resultado, procurar todos os lugares onde um
padrao aparece, conferir se uma migration ja foi aplicada.

Cuidado que ja custou aqui: **uma sessao por area, nunca duas no mesmo diretorio**
(commit caiu na branch errada, tilt tipado). Trabalho paralelo vai para worktree
(`.claude/worktrees/`), que ja funcionou bem na fase C-10.

## Por que declarar na spec

1. **Vira discutivel.** Escolha implicita ninguem questiona; escrita voce pode
   achar exagerada e baixar.
2. **Vira reutilizavel.** Da terceira spec em diante o padrao fica visivel e a
   tabela se calibra sozinha.
3. **Vira previsivel.** Voce sabe antes de comecar se aquele trabalho vai comer o
   limite do dia.

Mesmo raciocinio de declarar os casos de teste antes da solucao: forcar a decisao
para fora da cabeca, onde ela pode ser conferida.

## A tabela

Esta em `.claude/rules/04-modelo-e-esforco.md`. O resumo:

| Trabalho | Modelo | Esforco |
|---|---|---|
| Copy PT-BR, rotulo, ajuste de token visual | Sonnet 5 | `low` |
| Componente novo, layout, teste de UI | Sonnet 5 | `medium` |
| Rota nova, storage novo, migration simples | Sonnet 5 | `high` |
| Parser CSV, FX, bankroll, permissao/tier, prompts do Coach | Opus 5 | `high` |
| Query de dashboard/analytics (secao 6.1), scoring, variancia, migration com back-fill | Opus 5 | `xhigh` |
| Diagnostico de bug desconhecido, auditoria, varredura de regressao | Opus 5 | `xhigh` |
| Refatoracao estrutural (quebrar storage, enxugar CLAUDE.md) | Fable 5 / Opus 5 | `xhigh` |
| Renomear em massa, converter formato, gerar indice | Haiku 4.5 | — |

**Zona critica nunca roda abaixo de `high`.**

## Como aplicar no app (nosso caso hoje)

Trabalhamos no **Claude Code dentro do app**, nao no CLI. Consequencias praticas:

- **Modelo** troca-se pela UI do app (seletor de modelo), nao por `/model` de
  terminal. Escolha antes de comecar a tarefa, nao no meio.
- **Esforco** nao tem controle proprio no app. As alavancas equivalentes sao:
  escolher o modelo certo, dizer explicitamente "pense com cuidado antes de
  responder, isto envolve varias etapas" quando a tarefa e critica, e delegar a
  varredura pesada a um subagente para nao encher o contexto principal.
- **Subagente** so quando o founder pedir ou quando a tarefa e varredura larga —
  spawn frio re-deriva contexto que a sessao ja tem, e no plano atual isso e o
  caminho caro.
- A tabela abaixo continua valendo como **declaracao de intencao na spec**: ela
  diz quanto cuidado aquele trabalho merece, e isso muda o comportamento mesmo
  sem um parametro de esforco — porque muda o que a sessao se obriga a conferir.

Quando a assinatura permitir o CLI, o mesmo vira `--model` / `--effort` por
script, e a tabela passa a ser executavel em vez de declarativa.

---

Fontes: [Choosing a model](https://platform.claude.com/docs/en/about-claude/models/choosing-a-model) ·
[Effort](https://platform.claude.com/docs/en/build-with-claude/effort) ·
[Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

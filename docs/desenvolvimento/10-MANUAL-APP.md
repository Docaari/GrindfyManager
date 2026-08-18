# Manual rapido — desenvolver o Grindfy pelo app

Estado atual: trabalhamos no **Claude Code dentro do app**, nao no CLI. O metodo
inteiro funciona aqui; muda o **custo** de cada movimento e a disponibilidade de
alguns comandos. Este arquivo e o que fica na parede.

---

## 1. O que muda no app (vs CLI)

| Recurso | No app | Contorno |
|---|---|---|
| Trocar modelo | seletor da UI | escolher antes de comecar, nao no meio |
| Controlar esforco | nao ha controle proprio | pedir explicitamente "pense com cuidado, sao varias etapas" nas zonas criticas |
| `/hooks`, `/permissions`, `/config`, `/agents` | nao abrem | editar `.claude/settings.json` na mao; vale na proxima sessao |
| `/memory` | pode nao existir | perguntar "quais rules estao no contexto?" uma vez |
| Skills e agentes (`/pm-spec`, `/reviewer`, `/simplify`...) | funcionam | — |
| Hooks | funcionam normalmente | sao a rede de seguranca principal aqui |

Consequencia central: **no app o contexto e o recurso escasso, nao o modelo.**
Tudo abaixo existe para gastar contexto no lugar certo.

---

## 2. Escolher o tamanho do processo

Pipeline de 7 agentes para tudo e desperdicio. Tres faixas:

### P — uma tela, sem regra nova (copy, espacamento, rotulo, bug obvio de UI)

Sem spec, sem agente. Descreve, muda, confere na tela, pronto.
Nao toca zona critica. Se tocar, subiu de faixa.

### M — feature contida (rota nova + tela + storage; ajuste de regra existente)

1. Diz o objetivo em uma frase e **as duvidas como duvida**.
2. A sessao le os arquivos que vai mudar (nao vai pela memoria deles).
3. Passa pelos portoes do guia 01 em voz alta: simplicidade, regressao, contexto.
4. Teste primeiro do caso que **protege**, nao do caminho feliz.
5. Implementa, roda a suite da area + `npm run check`.
6. Confere na tela com o `:3000` reiniciado.

Agentes: opcional. Normalmente `reviewer` no fim compensa; o resto nao.

### G — sprint (dominio novo, migration, mudanca transversal, Coach)

Pipeline completo: `pm-spec` -> `system-architect` (ADR + diagrama) ->
`test-writer` -> `implementer` -> `/simplify` -> `reviewer`.
Spec em `Docs/specs/`, ADR em `Docs/architecture/decisions/`, migration com
`_rollback.sql` registrada como PENDENTE PROD.

**Regra de bolso:** se voce nao consegue dizer qual invariante pode quebrar, a
tarefa e maior do que parece — sobe uma faixa.

---

## 3. Economia de contexto (o que mais rende aqui)

- **Uma sessao por area.** Duas sessoes no mesmo diretorio ja fizeram commit cair
  na branch errada. Paralelo de verdade vai para `.claude/worktrees/`.
- **Nao reabrir o que ja foi decidido.** Decisao fechada e fato, nao pauta.
- **Subagente so para varredura larga** (achar todos os callsites, varrer
  lessons, rodar suite e resumir) ou quando voce pedir. Spawn frio re-deriva
  contexto que a sessao ja tem — no plano atual e o movimento caro.
- **Ler o arquivo certo, nao a pasta.** `Docs/api/endpoints-index.md` antes de
  `endpoints.md`; `data-model-index.md` antes de `schema.ts` inteiro.
- **Caveman ligado** corta ~75% do texto de saida sem perder substancia tecnica.
- **`/session-report`** ao fim de sessao longa mostra onde o token foi.

---

## 4. Frases que mudam o resultado

Sao os pedidos com maior retorno por caractere:

| Quando | Frase |
|---|---|
| Codigo novo em area sensivel | "escreva no padrao de `Docs/padrao/exemplo-padrao.ts`" |
| Antes de mudar comportamento | "liste as lessons-learned e os ADRs que se aplicam a esta area antes de mexer" |
| Suspeita de regressao | "qual caso vizinho nao pode mudar de resultado com essa mudanca?" |
| Resposta rasa | "pense com cuidado antes de responder; isto envolve varias etapas" |
| Feature grande | "passe pelos portoes do guia 01 e me mostre as respostas antes de implementar" |
| Duvida escondida | "marque como [PRECISA DECIDIR] tudo que voce teve que assumir" |
| Fim de tarefa | "o que ficou de fora e por que" |

---

## 5. Checklist de fim de tarefa

1. `npm run check` limpo.
2. Suite da area verde (inteira se a mudanca e transversal).
3. Mudanca visivel conferida no `:3000` **reiniciado**.
4. Migration nova: `_rollback.sql` existe e a pendencia PROD esta registrada.
5. Env nova: `.env.example` + `CLAUDE.md` secao 4.
6. Bug corrigido: entrada em `lessons-learned.md` (sintoma, causa, validacao).
7. Aprendizado generico: `/post-learning` para o hub.
8. Sessao > 50k tokens: `memory/session_*.md` + linha no `MEMORY.md`.

---

## 6. O que a sessao faz sozinha e o que pergunta

**Faz sem perguntar:** ler qualquer coisa, editar codigo e docs, rodar teste e
build, criar spec/ADR, reiniciar o `:3000`, migration e `db:push` **no local**.

**Sempre pergunta:** `git push`, deploy, `db:push` em producao, dependencia nova
em `package.json`, mudanca grande no `CLAUDE.md`, mexer em teste legado,
`git rebase`/`reset --hard`/`branch -D`.

Regra unica: **reversivel e barato = faz. Visivel a terceiros, irreversivel ou
caro = pergunta.**

---

## 7. Quando a assinatura permitir o CLI

Tres coisas passam a existir e valem o upgrade, nessa ordem:

1. **`--effort` por tarefa** — a tabela do guia 09 vira executavel em vez de
   declarativa.
2. **Execucao por script** — rodar `auditando-regressao` e a suite inteira sem
   gastar o contexto da sessao principal.
3. **`/hooks` e `/memory` interativos** — conferir o que carregou sem adivinhar.

Ate la, o hook `avisar-zona-critica.cjs` cobre a parte que mais importa: a regra
chega no momento da edicao, independente do que o app carregou no comeco.

# Hooks — quando o computador forca, em vez de pedir

## A diferenca que importa

Steering e skill **pedem** para a IA se comportar. Funciona quase sempre. Hook
**obriga** — e codigo que roda em momentos definidos e pode barrar a acao.

Quando a regra e cara o bastante para nao poder falhar nem 1% das vezes, ela vira
hook. "Segredo nao entra no codigo" e desse tipo: falhar uma vez e vazar.

## Os momentos

**Uma vez por sessao** — `SessionStart`, `SessionEnd`.
**Uma vez por turno** — `UserPromptSubmit`, `Stop`.
**A cada chamada de ferramenta** — `PreToolUse`, `PostToolUse`.

Existem outros (subagente iniciado, contexto compactado), mas esses cinco cobrem
95% dos casos.

## Como um hook decide

Recebe o evento em JSON no stdin, faz o que tem que fazer, e responde de **uma**
das duas formas — nunca as duas:

**Por codigo de saida**
- `0` -> segue.
- `2` -> bloqueia, e o `stderr` volta para a IA como erro.

**Por JSON** (mais controle; exige sair com `0`)
- `permissionDecision: "deny"` + `permissionDecisionReason` -> nega a ferramenta e
  explica (so no `PreToolUse`).
- `decision: "block"` + `reason` -> devolve o problema para a IA corrigir
  (`PostToolUse` e `Stop`).
- `additionalContext` -> injeta texto no contexto, sem bloquear nada.
- `systemMessage` -> mostra aviso ao usuario.

Detalhe que economiza dor: **se sair com codigo 2, o JSON e ignorado.**

## O que esta instalado no Grindfy

### `block-emojis.cjs` — `PreToolUse` em `Write|Edit`

Bloqueia emoji em arquivo de codigo (`.ts .tsx .js .jsx .css`). Markdown e JSON
passam. Existe porque a IA enfeita comentario e nome de variavel sem perceber.

### `warn-destructive.cjs` — `PreToolUse` em `Bash`

Avisa em `git reset --hard`, `branch -D`, `rebase`, `rm -rf`. Nao bloqueia — o
founder liberou autonomia para acao reversivel e o hook so garante que a acao
irreversivel aparece na tela antes de acontecer.

### `avisar-zona-critica.cjs` — `PreToolUse` em `Write|Edit` (novo)

**Nao bloqueia nada.** Quando a IA vai editar um arquivo de zona critica, injeta
as invariantes daquele arquivo no contexto, junto com o teste que cobre a area.

O ganho e de tempo: a regra chega **no momento da edicao**, nao depende de a IA
ter lido o briefing meia hora antes — que e exatamente quando ela ja compactou o
contexto e esqueceu.

Ele tambem procura, no texto sendo gravado, trechos que ja causaram bug conhecido
— query em `tournaments` sem `grind_session_id`, comparacao de buy-in sem
conversao FX, `catch {}` vazio, `requirePermission` em rota nova, `parseFloat` em
valor monetario que vai ser somado — e avisa citando a lesson ou o ADR.

### `lembrar-testes.cjs` — `Stop` (novo)

No fim do turno, le os arquivos tocados no turno e mapeia para a suite da area:
*"Testes que cobrem o que foi alterado: `npx vitest run tests/unit/goals` |
`npm run check`"*. Depois zera a lista.

Nao bloqueia e nao reabre a conversa — e lembrete, nao policial.

### `auto-sync-agents.cjs` — `PostToolUse` em `Edit|Write`

Espelha `.claude/agents/*.md` em `.claude/skills/*/SKILL.md`. Existe porque os
dois formatos coexistem e divergir silenciosamente ja aconteceu.

### `session-summary.cjs` — `Stop`

Anexa `git diff --stat` em `.claude/session-log.txt`. Barato e salvou pelo menos
uma vez a pergunta "o que foi que eu mexi ontem".

## O que NAO viramos hook, de proposito

**Typecheck pos-edicao.** O Run Hand roda `py_compile` em 200 ms. Aqui `tsc` no
projeto inteiro leva dezenas de segundos — vira atrito em toda edicao. Fica no
fim da tarefa (`npm run check`), lembrado pelo `lembrar-testes.cjs`.

**Bloqueio de `git push`.** Ja e regra escrita e o founder tem autonomia
declarada. Hook que bloqueia o que o dono quer fazer vira hook desligado.

## Onde fica configurado

`.claude/settings.json`, versionado.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "node .claude/hooks/avisar-zona-critica.cjs", "timeout": 10 }
        ]
      }
    ]
  }
}
```

O `matcher` filtra por nome de ferramenta. `Write|Edit` casa com as duas.

No app, edite `settings.json` direto — o painel `/hooks` so existe no CLI
interativo. Hook novo passa a valer **na proxima sessao**, nao na atual.

## Como escrever hook que nao atrapalha

**Nunca deixe o hook derrubar o trabalho.** Todo script aqui e `try/catch` com
saida `0` quando algo da errado nele mesmo. Hook quebrado deve sumir, nao travar
a sessao.

**Timeout curto.** 10 segundos para o que e rapido. Hook lento e atrito em toda
edicao.

**Sem acento nos scripts.** Rodam pelo console do Windows, onde o encoding padrao
nem sempre e UTF-8.

**Falso positivo mata o hook.** Um bloqueio errado e a pessoa desliga tudo.
Prefira avisar a bloquear, e so bloqueie o inequivoco.

**Texto descritivo, nao imperativo.** "Este arquivo tem 3 invariantes" e nao
"VOCE DEVE seguir". Texto que parece comando vindo de fora dispara as defesas do
modelo contra injecao de prompt, e ele mostra o texto para voce em vez de usar
como contexto.

## O que NAO virar hook

- Regra de estilo que um formatador resolve.
- Coisa que depende de julgamento ("esse nome esta bom?") — isso e o `reviewer`.
- Regra que muda toda semana — vira steering, e mais facil de editar.

---

Fontes: [Hooks reference](https://code.claude.com/docs/en/hooks) ·
[Claude Code Hooks Complete Guide](https://hidekazu-konishi.com/entry/claude_code_hooks_complete_guide.html)

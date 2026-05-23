# Hooks — Customização de comportamento do Claude Code

> **Destino: `.claude/hooks/` na raiz do projeto do usuário.**

---

## O que tem aqui

| Arquivo | O que faz | Evento |
|---|---|---|
| `block-destructive.sh` | Bloqueia padrões claramente destrutivos no Bash (`rm -rf /`, fork bombs, `dd` em raw devices, etc.) | `PreToolUse` para `Bash` |

---

## Como funciona

Hooks são scripts que rodam em resposta a eventos do Claude Code. Os mais úteis:

- **PreToolUse** — antes de executar uma ferramenta. Pode bloquear (exit 2) ou liberar (exit 0).
- **PostToolUse** — depois que uma ferramenta executa. Útil para logging ou validação.
- **UserPromptSubmit** — quando o usuário envia uma mensagem. Pode injetar contexto adicional.
- **Stop** — quando o Claude termina o turno. Útil para notificações.

Cada hook recebe via stdin um JSON com dados do evento. Documentação: <https://docs.claude.com/claude-code/hooks>.

---

## Como adicionar um hook customizado

### 1. Crie o script (qualquer linguagem executável)

```bash
# .claude/hooks/meu-hook.sh
#!/usr/bin/env bash
set -euo pipefail

input=$(cat)
# ... sua lógica ...

exit 0   # libera
# ou
exit 2   # bloqueia (stderr volta para o Claude)
```

### 2. Torne-o executável

```bash
chmod +x .claude/hooks/meu-hook.sh
```

### 3. Registre em `.claude/settings.json`

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": ".claude/hooks/meu-hook.sh" }
        ]
      }
    ]
  }
}
```

O `matcher` filtra por nome de ferramenta (Bash, Edit, Write, etc.).

---

## Ideias de hooks úteis

| Hook | Quando | O que faz |
|---|---|---|
| Lint pré-commit | PreToolUse em `Bash(git commit)` | Roda `npm run lint` antes — bloqueia commit se falhar |
| Auto-format | PostToolUse em `Edit` | Roda `prettier --write` no arquivo editado |
| Notification | Stop | Envia notificação desktop quando o Claude termina o turno |
| Context injection | UserPromptSubmit | Injeta data atual, branch git, último commit no contexto |
| Audit log | PostToolUse em `*` | Grava tudo que o Claude executou em um log persistente |

---

## Windows

No Windows, o `bash` precisa estar disponível (Git Bash, WSL2 ou similar) para os hooks `.sh` funcionarem. Alternativa: reescrever os hooks como `.ps1` (PowerShell) e ajustar o `command:` no settings.json.

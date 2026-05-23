# templates/ — Starter Kit para Projetos

> **Destino: projeto do usuário.** Estes arquivos são para serem copiados para a **raiz do seu projeto**, não usados como configuração desta base. Cada arquivo declara seu destino no cabeçalho.

---

## O que tem aqui

```
templates/
├── README.md                          ← Este arquivo
├── .claude/
│   ├── settings.json                  ← Settings com Agent Teams + allowlist sensata
│   └── hooks/
│       ├── block-destructive.sh       ← Hook que bloqueia comandos perigosos
│       └── README.md                  ← Como adicionar hooks customizados
├── .github/
│   └── workflows/
│       └── ci.yml                     ← Pipeline CI/CD básico (lint + test + build)
├── CLAUDE.md.template                 ← Template do CLAUDE.md do SEU PROJETO
├── .env.example                       ← Template de variáveis de ambiente
└── .gitignore                         ← .gitignore para Node + Python + comum
```

---

## Como usar (3 modos compatíveis)

### Modo 1 — Copy-paste no projeto existente

**PowerShell:**
```powershell
# Da raiz do seu projeto
Copy-Item -Recurse "C:\caminho\para\Dev LLM\templates\.claude" .
Copy-Item -Recurse "C:\caminho\para\Dev LLM\templates\.github" .
Copy-Item "C:\caminho\para\Dev LLM\templates\CLAUDE.md.template" CLAUDE.md
Copy-Item "C:\caminho\para\Dev LLM\templates\.env.example" .
Copy-Item "C:\caminho\para\Dev LLM\templates\.gitignore" .
```

**Bash:**
```bash
# Da raiz do seu projeto
cp -r "/caminho/para/Dev LLM/templates/.claude" .
cp -r "/caminho/para/Dev LLM/templates/.github" .
cp "/caminho/para/Dev LLM/templates/CLAUDE.md.template" CLAUDE.md
cp "/caminho/para/Dev LLM/templates/.env.example" .
cp "/caminho/para/Dev LLM/templates/.gitignore" .
```

Depois copie os agentes:
```bash
mkdir -p .claude/agents
cp "/caminho/para/Dev LLM/Agentes e Skills - Unificado/"*.md .claude/agents/
```

### Modo 2 — Projeto novo dentro/ao lado da pasta Dev LLM

Mesmo procedimento do Modo 1, mas os comandos rodam dentro da pasta do projeto que você criar (ex: `Dev LLM/meu-saas/`).

### Modo 3 — Read & Learn (referência)

Você não copia. Em vez disso, instrui o Claude Code no seu projeto:
```
"Leia os templates em C:\...\Dev LLM\templates e use-os como referência
para criar os arquivos equivalentes neste projeto, adaptados ao contexto."
```

O agente lê, entende a estrutura, e cria versões customizadas para o seu projeto.

---

## Próximos passos depois de copiar

1. **Preencha o CLAUDE.md** com os dados reais do seu projeto (stack, estrutura, convenções). Os campos `[PREENCHER]` indicam onde focar.
2. **Ajuste o `.env.example`** com as variáveis que seu projeto realmente usa. Crie um `.env` local (já no `.gitignore`) com os valores.
3. **Revise `.claude/settings.json`** — a allowlist é conservadora. Adicione comandos do seu workflow (ex: `npm test`, `pytest`, `cargo build`) para reduzir prompts de permissão.
4. **Inicie o pipeline:** "Use o agente pm-spec. Quero criar [primeira feature]."

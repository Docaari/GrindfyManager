# templates-dev-llm/ — Referência, não código vivo

> **Esta pasta é apenas REFERÊNCIA.** Importada da base [Dev LLM](C:/Users/ricar/OneDrive/Desktop/Dev%20LLM) em Mai/2026 para servir de consulta sem afetar o projeto Grindfy.

---

## Por que está aqui

O Grindfy já tem `.claude/settings.json`, `.claude/hooks/`, `.gitignore`, `.env.example` e CLAUDE.md próprios — todos customizados ao projeto. Copiar os templates da base por cima sobrescreveria configuração viva.

Solução: copiar os templates **em pasta separada** (`Docs/templates-dev-llm/`) para você poder consultar quando quiser comparar, atualizar pontualmente, ou inspirar novos hooks/configs.

## Por que `.env.example` virou `env.example.txt`

Para evitar que ferramentas (dotenv, frameworks, git) tratem o arquivo como ativo do projeto. Mesma razão para `.gitignore` → `gitignore.txt`. Quando quiser usar o conteúdo, renomeie de volta no destino correto.

## Como usar como referência

| Quando | O que fazer |
|---|---|
| Quer revisar seu `.claude/settings.json` | Compare com `.claude/settings.json` daqui e veja se há padrões úteis |
| Quer adicionar hook de bloqueio destrutivo | Veja `.claude/hooks/block-destructive.sh` e `.claude/hooks/README.md` (guia de hooks) |
| Quer setup CI mais robusto | Veja `.github/workflows/ci.yml` (Node + Python + security audit) |
| Quer atualizar `.gitignore` | Compare com `gitignore.txt` daqui |
| Quer template completo de CLAUDE.md | Veja `CLAUDE.md.template` (11 seções DOC4) |

## Sincronização futura

A base Dev LLM tem `CHANGELOG.md` na raiz documentando mudanças. Quando ela for atualizada, releia esta pasta (ou re-copie) para se manter alinhado.

**Não edite arquivos aqui** — não tem efeito real no projeto, vira lixo de drift. Edite na base original e re-copie.

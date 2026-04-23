# Architecture Decision Records (ADRs)

Indice de decisoes arquiteturais do projeto Grindfy Manager.

Cada ADR documenta o contexto, opcoes consideradas, decisao tomada e consequencias de uma decisao tecnica significativa. ADRs nunca sao deletados — sao marcados como "Deprecado" ou "Substituido" quando uma decisao muda.

## Indice

| ADR | Titulo | Status | Data |
|-----|--------|--------|------|
| [001](001-auth-jwt.md) | Usar JWT com refresh token para autenticacao | Aceito | 2025-01-01 |
| [002](002-neon-serverless.md) | Usar Neon Serverless PostgreSQL como banco de dados | Aceito | 2025-01-01 |
| [003](003-monolith-architecture.md) | Monolito Express servindo API + SPA na mesma porta | Aceito | 2025-01-01 |
| [007](007-blocknote-editor.md) | Usar BlockNote como editor block-based para pagina Estudos | Aceito | 2026-03-21 |
| [008](008-late-reg-alerts-architecture.md) | Arquitetura de alertas de late registration no Grind Live | Aceito | 2026-03-21 |
| [009](009-tournament-library-separate-table.md) | Criar tournament_library como tabela separada de tournament_templates | Aceito | 2026-03-21 |
| [010](010-profile-off-fourth-state.md) | Perfil OFF como 4o estado (nao substituindo C) | Aceito | 2026-03-21 |
| [011](011-react-beautiful-dnd-choice.md) | Usar react-beautiful-dnd para drag-and-drop na grade | Aceito | 2026-03-21 |
| [012](012-suprema-dedup-strategy.md) | Estrategia de deduplicacao Suprema: externalId + nome+site+buyIn | Aceito | 2026-03-21 |
| [013](013-eliminate-planning-dialog.md) | Eliminar PlanningDialog e redistribuir funcionalidades | Aceito | 2026-03-21 |
| [014](014-addon-rea-modelagem.md) | Modelar Add-on e Re-entry como flags ortogonais (nao expandir enum `type`) | Aceito | 2026-04-23 |
| [015](../ai-coach/adr-001-llm-provider.md) | Usar Claude API (Anthropic) como provedor LLM para AI Coach | Proposto | 2026-04-08 |
| [016](../ai-coach/adr-002-memory-architecture.md) | Estrategia de memoria persistente com perfil + resumos + compactacao | Proposto | 2026-04-08 |

## Convencoes

- **Formato:** Um arquivo Markdown por decisao
- **Numeracao:** Sequencial (001, 002, 003...)
- **Status possiveis:** Proposto, Aceito, Deprecado, Substituido por ADR-XXX
- **Nunca deletar:** Marcar como Deprecado ou Substituido
- **Sempre incluir:** Opcoes descartadas com pros e contras

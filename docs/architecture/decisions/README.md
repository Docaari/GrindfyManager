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

## Convencoes

- **Formato:** Um arquivo Markdown por decisao
- **Numeracao:** Sequencial (001, 002, 003...)
- **Status possiveis:** Proposto, Aceito, Deprecado, Substituido por ADR-XXX
- **Nunca deletar:** Marcar como Deprecado ou Substituido
- **Sempre incluir:** Opcoes descartadas com pros e contras

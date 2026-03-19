# Team Agents — Prompts Prontos

Agent Teams sao criados em runtime via prompts no Claude Code.
Estes arquivos contem prompts prontos para copiar e colar.

## Decisao Rapida

```
Feature toca backend + frontend + testes?
  → Team 1: Feature Cross-Layer

Precisa de review antes do merge?
  → Feature critica (auth, pagamentos)? → Team 2: Review Multi-Perspectiva
  → Feature simples? → Subagente Reviewer (mais rapido e barato)

Mudanca que afeta 20+ arquivos?
  → Team 3: Refatoracao em Larga Escala

Bug com causa incerta?
  → Team 4: Debug Paralelo

Documentacao defasada?
  → Team 5: Sprint de Documentacao

Nada acima se aplica?
  → Use sessao unica ou subagentes do pipeline
```

## Arquivos

| Team | Arquivo | Custo vs Sequencial |
|------|---------|---------------------|
| 1 | team1-feature-cross-layer.md | ~4x |
| 2 | team2-review-multi-perspectiva.md | ~3x |
| 3 | team3-refatoracao-larga-escala.md | ~5x |
| 4 | team4-debug-paralelo.md | ~3x |
| 5 | team5-sprint-documentacao.md | ~3x |

## Pre-requisito

A flag experimental ja esta habilitada em `.claude/settings.json`:
```json
{ "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
```

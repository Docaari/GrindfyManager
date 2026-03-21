# ADR-009: Criar tournament_library como tabela separada de tournament_templates

## Status
Aceito

## Data
2026-03-21

## Contexto

O Grindfy possui a tabela `tournament_templates` que agrupa torneios historicos para fins de analytics (avgRoi, totalPlayed, totalProfit). A feature "Biblioteca de Torneios v2" precisa de um catalogo pessoal editavel onde o usuario organiza torneios que pretende jogar na grade semanal.

A questao e: reusar `tournament_templates` adicionando campos, ou criar uma tabela nova `tournament_library`?

Campos de `tournament_templates`:
- name, site, format, category, speed (descritivos)
- avgBuyIn, avgRoi, totalPlayed, totalProfit, finalTables, bigHits (analytics automaticos)
- dayOfWeek (jsonb), startTime (jsonb) — arrays agregados

Campos necessarios para a biblioteca:
- name, site, buyIn, type, speed, time (descritivos simples, sem agregacao)
- source (manual/suprema/grind-live)
- externalId (dedup Suprema)
- deletedAt (lixeira soft delete)
- guaranteed, fieldSize (dados enriquecidos)

## Opcoes Consideradas

### Opcao 1: Reusar tournament_templates
- **Pros:** Menos tabelas, possivel correlacao direta templates-biblioteca
- **Contras:** Finalidades fundamentalmente diferentes (analytics vs planejamento). Templates sao gerados automaticamente pelo sistema a partir de historico; biblioteca e curada pelo usuario. Adicionar deletedAt/source/externalId polui uma tabela de analytics. Campos de agregacao (avgRoi, totalPlayed) nao fazem sentido para itens manuais. Arrays de dayOfWeek/startTime conflitam com o campo escalar da biblioteca.

### Opcao 2: Criar tournament_library (nova tabela)
- **Pros:** Separacao clara de responsabilidades. Cada tabela tem campos especificos para sua finalidade. Sem conflito de schema. Biblioteca pode evoluir independentemente (ex: tags, notas, favoritos no futuro). Lixeira e dedup sao naturais na tabela.
- **Contras:** Mais uma tabela no schema. Dados descritivos duplicados (name, site, buyIn existem em ambas).

## Decisao

Criar `tournament_library` como tabela nova e independente. As duas tabelas coexistem:

- `tournament_templates`: agrupamento automatico para analytics (ROI, profit, volume). Alimentada pelo parser de CSV/historico. Nunca editada manualmente.
- `tournament_library`: catalogo pessoal editavel para planejamento de grade. Alimentada por import manual, Suprema ou grind-live. Gerenciada diretamente pelo usuario.

Nao ha FK entre elas. Sao dominios distintos que podem ter torneios com nomes iguais, mas servem propositos diferentes.

## Consequencias

- **Positiva:** Evolucao independente — biblioteca pode ganhar features (tags, favoritos, notas) sem impactar analytics
- **Positiva:** Queries simples — cada tabela consultada apenas no seu contexto
- **Positiva:** Lixeira com soft delete e dedup por externalId sao implementacoes limpas
- **Negativa:** Dados descritivos existem em 3 lugares (tournaments, tournament_templates, tournament_library) — mas cada um serve um proposito diferente
- **Neutra:** Se no futuro quisermos correlacionar biblioteca com analytics, sera necessario um JOIN por nome+site+buyIn (inexato mas aceitavel)

## Confianca
Alta

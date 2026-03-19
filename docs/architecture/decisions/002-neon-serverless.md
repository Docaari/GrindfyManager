# ADR-002: Usar Neon Serverless PostgreSQL como Banco de Dados

## Status
Aceito

## Data
2025-01-01

## Contexto
O projeto Grindfy precisa de um banco de dados relacional para armazenar dados de usuarios, torneios (milhares por jogador), sessoes de grind, e analytics. O banco precisa suportar:

- Queries complexas com agregacoes (dashboard analytics com GROUP BY, SUM, AVG)
- Relacionamentos entre ~30 tabelas
- Volumes crescentes de dados (um jogador ativo pode importar 500-1000 torneios por mes)
- Disponibilidade para deploy em nuvem (projeto migrado do Replit)
- Custo acessivel para um projeto em fase inicial

O projeto ja utilizava PostgreSQL no Replit, entao a compatibilidade com PostgreSQL era desejavel para evitar reescrita de queries.

## Opcoes Consideradas

### Opcao 1: PostgreSQL auto-hospedado (VPS/Docker)
- **Pros:** Controle total, sem vendor lock-in, custo previsivel (custo fixo do servidor), performance maxima, sem limites de conexao artificiais
- **Contras:** Requer administracao (backups, updates, monitoring, escalonamento), single point of failure sem replicacao, setup inicial complexo, responsabilidade por seguranca e disponibilidade

### Opcao 2: Neon Serverless PostgreSQL
- **Pros:** PostgreSQL 16 compativel, free tier generoso, branching para desenvolvimento/staging, auto-scaling, backups automaticos, SSL por padrao, driver serverless otimizado (`@neondatabase/serverless`), zero administracao
- **Contras:** Vendor lock-in (Neon), cold starts em plano gratuito (latencia na primeira conexao apos inatividade), limites de compute/storage no free tier, dependencia de servico externo

### Opcao 3: Supabase PostgreSQL
- **Pros:** PostgreSQL gerenciado, free tier, API REST automatica, auth built-in, real-time subscriptions
- **Contras:** Overhead de features nao utilizadas (auth, real-time, storage), API REST imposta pode conflitar com Express routes, acoplamento com ecossistema Supabase

### Opcao 4: PlanetScale (MySQL)
- **Pros:** Serverless, branching, bom free tier, otimizado para escalabilidade
- **Contras:** MySQL (nao PostgreSQL — exigiria reescrita de queries e schema), sem suporte a foreign keys no branching, ecossistema diferente do atual

## Decisao
Opcao 2: Neon Serverless PostgreSQL.

A compatibilidade com PostgreSQL 16 permitiu migracao direta do schema e queries existentes. O free tier cobre as necessidades iniciais, e o driver serverless (`@neondatabase/serverless` 0.10.4) esta disponivel mas o projeto usa `pg` (node-postgres 8.19.0) como driver primario com connection pool padrao (max 10 conexoes, idle timeout 30s, connection timeout 10s).

O Drizzle ORM (0.39.1) funciona como camada de abstracao, tornando uma eventual migracao para outro provider PostgreSQL relativamente simples.

## Consequencias

**Positivas:**
- Zero administracao de banco de dados
- Compatibilidade total com PostgreSQL 16 — queries, types, constraints
- SSL automatico em producao (configurado via `ssl: { rejectUnauthorized: false }` quando nao localhost)
- Drizzle ORM abstrai o driver, facilitando eventual migracao

**Negativas:**
- Cold starts podem adicionar 1-3s de latencia na primeira conexao apos periodo de inatividade (free tier)
- Limite de compute no free tier pode ser insuficiente se o numero de usuarios crescer significativamente
- Vendor lock-in parcial (mitigado pelo uso de pg driver padrao e Drizzle ORM)

**Neutras:**
- O driver `@neondatabase/serverless` esta listado como dependencia mas o projeto usa `pg` como driver principal — a dependencia do Neon poderia ser removida sem impacto funcional
- Connection pool configurado com max 10 conexoes, adequado para o volume atual

## Confianca
Media — Neon funciona bem para o estagio atual do projeto (pre-escala). Se o volume de usuarios crescer significativamente, pode ser necessario migrar para um plano pago ou avaliar alternativas de PostgreSQL gerenciado.

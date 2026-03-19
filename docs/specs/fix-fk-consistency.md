# Fix: Padronizar foreign keys para users em todas as tabelas

## Status
Aprovada

## Contexto
O schema do banco de dados (`shared/schema.ts`) tem uma inconsistencia critica nas foreign keys que referenciam a tabela `users`. Existem tres situacoes diferentes:

1. **Tabelas com FK para `users.userPlatformId`** (formato `USER-XXXX`) -- a maioria
2. **Tabelas com FK para `users.id`** (nanoid) -- minoria
3. **Tabelas sem FK constraint nenhum** (userId e apenas string, sem referencia) -- muitas

Alem disso, a camada de `relations()` do Drizzle (usada para queries com joins) aponta quase toda para `users.id`, mesmo quando a FK real no banco aponta para `users.userPlatformId`. E o codigo em `server/routes.ts` usa predominantemente `req.user.userPlatformId` como valor armazenado em `userId`.

Isso significa que **o banco pode ter integridade referencial quebrada**: uma FK aponta para `users.id` mas o valor armazenado e um `userPlatformId`, ou vice-versa.

## Escopo
**O que sera feito (Fase 1 -- esta spec):**
- Corrigir FK de `uploadHistory` e `userSubscriptions` (Grupo B): mudar de `users.id` para `users.userPlatformId`
- Corrigir as 27 `relations()` do Drizzle (Grupo D) que apontam para `users.id` quando deveriam apontar para `users.userPlatformId`
- Migracao de dados existentes nessas 2 tabelas (se necessario)

**O que NAO sera feito (esta spec):**
- Implementacao da migracao (isso sera feito pelo Implementer)
- Alteracao de endpoints ou logica de negocios (apenas a spec da correcao)
- Adicionar FK constraints nas 17 tabelas do Grupo C (sem constraint) -- isso sera uma spec futura separada

**Fase 2 (spec futura):** Adicionar FK constraints `.references(() => users.userPlatformId, { onDelete: "cascade" })` nas 17 tabelas do Grupo C que atualmente nao possuem constraint nenhum.

## Analise Tecnica

### Campo `users.id` vs `users.userPlatformId`

| Campo | Tipo | Formato | Gerado por |
|-------|------|---------|------------|
| `users.id` | varchar PK | nanoid (ex: `abc123xyz`) | `nanoid()` no registro |
| `users.userPlatformId` | varchar UNIQUE NOT NULL | `USER-XXXX` sequencial | Logica customizada no registro |

### Decisao: Usar `users.userPlatformId` como FK padrao

**Justificativa:**
1. O codigo em `routes.ts` usa `req.user.userPlatformId` como o valor armazenado no campo `userId` de praticamente TODAS as tabelas (confirmado por grep: 30+ ocorrencias)
2. A maioria das tabelas que TEM FK constraint ja aponta para `users.userPlatformId` (11 tabelas vs 2)
3. Os endpoints de admin buscam e filtram por `userPlatformId`
4. O formato `USER-XXXX` e mais legivel para debug e admin
5. Mudar para `users.id` exigiria alterar TODOS os endpoints e dados existentes; mudar as 2 tabelas inconsistentes para `userPlatformId` e muito menos arriscado

### Mapeamento completo por tabela

#### Grupo A: FK aponta para `users.userPlatformId` (CORRETO -- manter)

| Tabela | Campo | Linha no schema | Constraint |
|--------|-------|-----------------|------------|
| `userPermissions` | `user_id` | 72 | `.references(() => users.userPlatformId)` |
| `subscriptions` | `user_id` | 86 | `.references(() => users.userPlatformId)` |
| `userActivities` | `user_id` | 103 | `.references(() => users.userPlatformId)` |
| `engagementMetrics` | `user_id` | 114 | `.references(() => users.userPlatformId)` |
| `accessLogs` | `user_id` | 129 | `.references(() => users.userPlatformId)` |
| `userActivity` | `user_id` | 141 | `.references(() => users.userPlatformId)` |
| `analyticsDaily` | `user_id` | 156 | `.references(() => users.userPlatformId)` |
| `notifications` | `user_id` | 171 | `.references(() => users.userPlatformId)` |
| `tournaments` | `user_id` | 184 | `.references(() => users.userPlatformId)` |
| `profileStates` | `user_id` | 508 | `.references(() => users.userPlatformId)` |
| `bugReports` | `user_id` | 518 | `.references(() => users.userPlatformId)` |

#### Grupo B: FK aponta para `users.id` (INCORRETO -- precisa mudar)

| Tabela | Campo | Linha no schema | Constraint atual | Constraint correto |
|--------|-------|-----------------|------------------|-------------------|
| `uploadHistory` | `user_id` | 532 | `.references(() => users.id)` | `.references(() => users.userPlatformId)` |
| `userSubscriptions` | `user_id` | 1177 | `.references(() => users.id)` | `.references(() => users.userPlatformId)` |

#### Grupo C: Sem FK constraint (precisa adicionar)

| Tabela | Campo | Linha no schema | Acao necessaria |
|--------|-------|-----------------|-----------------|
| `tournamentTemplates` | `user_id` | 213 | Adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| `weeklyPlans` | `user_id` | 235 | Adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| `plannedTournaments` | `user_id` | 249 | Adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| `grindSessions` | `user_id` | 275 | Adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| `breakFeedbacks` | `user_id` | 323 | Adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| `sessionTournaments` | `user_id` | 338 | Adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| `preparationLogs` | `user_id` | 366 | Adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| `customGroups` | `user_id` | 383 | Adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| `coachingInsights` | `user_id` | 400 | Adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| `userSettings` | `user_id` | 415 | Adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| `studyCards` | `user_id` | 432 | Adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| `studySessions` | `user_id` | 484 | Adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| `activeDays` | `user_id` | 498 | Adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| `weeklyRoutines` | `user_id` | 1042 | Adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| `calendarCategories` | `user_id` | 1055 | Adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| `calendarEvents` | `user_id` | 1067 | Adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| `studySchedules` | `user_id` | 1091 | Adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |

#### Grupo D: Relations layer (Drizzle ORM) -- inconsistencias

A maioria das `relations()` aponta para `users.id` no campo `references`, mesmo que o valor armazenado seja `userPlatformId`. Isso afeta queries relacionais (com `with`/`include`). Todas as relations devem ser atualizadas para apontar para `users.userPlatformId`.

| Relacao | Linha | References atual | References correto |
|---------|-------|------------------|-------------------|
| `tournamentsRelations` | 564-567 | `users.id` | `users.userPlatformId` |
| `tournamentTemplatesRelations` | 579-582 | `users.id` | `users.userPlatformId` |
| `weeklyPlansRelations` | 589-591 | `users.id` | `users.userPlatformId` |
| `plannedTournamentsRelations` | 597-599 | `users.id` | `users.userPlatformId` |
| `grindSessionsRelations` | 608-610 | `users.id` | `users.userPlatformId` |
| `preparationLogsRelations` | 619-621 | `users.id` | `users.userPlatformId` |
| `customGroupsRelations` | 630-632 | `users.id` | `users.userPlatformId` |
| `coachingInsightsRelations` | 649-651 | `users.id` | `users.userPlatformId` |
| `userSettingsRelations` | 656-658 | `users.id` | `users.userPlatformId` |
| `usersRelations` (settings) | 557-559 | `users.id` -> `userSettings.userId` | `users.userPlatformId` -> `userSettings.userId` |
| `userPermissionsRelations` | 669-671 | `users.id` | `users.userPlatformId` |
| `accessLogsRelations` | 680-682 | `users.id` | `users.userPlatformId` |
| `breakFeedbacksRelations` | 687-689 | `users.id` | `users.userPlatformId` |
| `sessionTournamentsRelations` | 698-700 | `users.id` | `users.userPlatformId` |
| `studyCardsRelations` | 713-715 | `users.id` | `users.userPlatformId` |
| `studySessionsRelations` | 740-742 | `users.id` | `users.userPlatformId` |
| `activeDaysRelations` | 751-753 | `users.id` | `users.userPlatformId` |
| `bugReportsRelations` | 765-767 | `users.id` | `users.userPlatformId` |
| `uploadHistoryRelations` | 772-774 | `users.id` | `users.userPlatformId` |
| `subscriptionsRelations` | 780-782 | `users.id` | `users.userPlatformId` |
| `userActivitiesRelations` | 787-789 | `users.id` | `users.userPlatformId` |
| `engagementMetricsRelations` | 794-796 | `users.id` | `users.userPlatformId` |
| `weeklyRoutinesRelations` | 1119-1121 | `users.id` | `users.userPlatformId` |
| `studySchedulesRelations` | 1126-1128 | `users.id` | `users.userPlatformId` |
| `calendarCategoriesRelations` | 1137-1139 | `users.id` | `users.userPlatformId` |
| `calendarEventsRelations` | 1145-1147 | `users.id` | `users.userPlatformId` |
| `userSubscriptionsRelations` | 1208-1210 | `users.id` | `users.userPlatformId` |

**Excecao -- ja correto:**
| Relacao | Linha | Status |
|---------|-------|--------|
| `profileStatesRelations` | 758-761 | Ja aponta para `users.userPlatformId` |

## Solucao Proposta

### Passo 1: Corrigir FKs incorretas no schema Drizzle (shared/schema.ts)

**Grupo B** -- Alterar FK de `users.id` para `users.userPlatformId` em:
- `uploadHistory.userId` (linha 532)
- `userSubscriptions.userId` (linha 1177)

### Passo 2: Corrigir relations layer do Drizzle (shared/schema.ts)

**Grupo D** -- Atualizar TODAS as `relations()` para apontar `references: [users.userPlatformId]` em vez de `references: [users.id]` (27 relacoes).

Atualizar `usersRelations` para usar `users.userPlatformId` no campo `fields` da relacao com `userSettings`.

### Nota: Grupo C (FORA DE ESCOPO desta spec)
As 17 tabelas do Grupo C que nao possuem FK constraint nenhum serao tratadas em uma spec futura separada (Fase 2). Nao adicionar constraints nessas tabelas nesta implementacao.

### Fase 2: Migracao do banco de dados

1. Verificar se existem dados em `uploadHistory` e `userSubscriptions` que usam `users.id` em vez de `users.userPlatformId`
2. Se existirem, criar um script de migracao de dados que converte os valores (JOIN em users para mapear id -> userPlatformId)
3. Aplicar `db:push` ou gerar migracao Drizzle Kit

### Fase 3: Verificar queries em routes.ts e storage.ts

Confirmar que TODAS as queries que inserem/buscam por `userId` usam consistentemente o valor de `userPlatformId`. Pontos especificos a verificar:
- `POST /api/upload-history` -- qual valor e gravado em `uploadHistory.userId`?
- Endpoints de `userSubscriptions` -- qual valor e gravado?
- `server/emailService.ts` linhas 196-210 -- usa `users.id` para buscar/atualizar usuario (isso esta correto, pois opera diretamente na tabela users pela PK)

## Criterios de Aceite
- [ ] `uploadHistory.userId` FK aponta para `users.userPlatformId` (em vez de `users.id`)
- [ ] `userSubscriptions.userId` FK aponta para `users.userPlatformId` (em vez de `users.id`)
- [ ] Todas as 27 `relations()` apontam `references: [users.userPlatformId]`
- [ ] `usersRelations` usa `users.userPlatformId` no campo `fields` da relacao com `userSettings`
- [ ] Dados existentes em `uploadHistory` e `userSubscriptions` foram migrados (se necessario)
- [ ] `npm run db:push` executa sem erros
- [ ] `npm run build` compila sem erros de tipo
- [ ] Todos os endpoints que inserem dados em `uploadHistory` e `userSubscriptions` continuam funcionando
- [ ] Queries relacionais (com Drizzle `with`) retornam dados corretamente
- [ ] Nenhum registro orfao apos a migracao
- [ ] As 17 tabelas do Grupo C NAO foram modificadas (permanecem sem FK constraint)

## Riscos

### Risco Alto: Dados existentes inconsistentes
Se `uploadHistory` e `userSubscriptions` ja tem registros com `users.id` (nanoid) no campo `userId`, a alteracao da FK vai falhar no banco. **Mitigacao:** verificar dados antes, criar script de migracao, fazer backup.

### Risco Medio: Queries que usam relations
Se alguma query do Drizzle usa `with` (relational queries) que depende das relations atuais (apontando para `users.id`), ela pode quebrar silenciosamente retornando null em vez dos dados relacionados. **Mitigacao:** testar todos os endpoints que fazem joins com users.

## Estimativa de Complexidade
Media -- afeta 1 arquivo de schema (shared/schema.ts) com alteracao em 2 FKs + 27 relations, requer verificacao de dados em producao para as 2 tabelas do Grupo B, e a migracao precisa ser feita com cuidado para nao perder dados. Escopo reduzido em relacao a analise original (Grupo C ficou para spec futura).

## Arquivos Afetados
- `shared/schema.ts` (alteracoes em ~50 pontos: FKs + relations)
- `server/routes.ts` (verificacao de queries com uploadHistory e userSubscriptions)
- `server/storage.ts` (verificacao de queries)
- Migracao SQL (novo arquivo em migrations/)

## Dependencias
- Acesso ao banco de producao para verificar dados existentes
- Backup do banco antes da migracao
- Spec 1 (remover neon driver) pode ser feita antes ou em paralelo -- nao ha dependencia

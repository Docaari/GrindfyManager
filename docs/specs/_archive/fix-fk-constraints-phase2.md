# Fix: Adicionar FK constraints nas 17 tabelas com userId sem referencia

## Status
Concluida

## Contexto
A Fase 1 (spec `fix-fk-consistency.md`, ja implementada) corrigiu as 2 tabelas do Grupo B (`uploadHistory` e `userSubscriptions`) que apontavam para `users.id` em vez de `users.userPlatformId`, e atualizou as 27 `relations()` do Drizzle que estavam inconsistentes.

Restam 17 tabelas do Grupo C que possuem um campo `userId` (mapeado para `user_id` no SQL) declarado como `varchar("user_id").notNull()` mas **sem nenhum `.references()`**. Isso significa que o banco de dados PostgreSQL nao possui constraint de foreign key nessas colunas -- qualquer valor pode ser inserido, incluindo IDs de usuarios inexistentes.

Este e um problema de integridade referencial: nao ha garantia a nivel de banco de dados de que os registros nessas tabelas pertencem a um usuario real. Alem disso, se um usuario for deletado, os registros orfaos permaneceriam indefinidamente.

## Escopo

**O que sera feito:**
- Adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` no campo `userId` de cada uma das 17 tabelas
- Executar `db:push` para aplicar as constraints no banco

**O que NAO sera feito:**
- Renomear campos (o campo ja se chama `userId` no Drizzle e `user_id` no SQL -- consistente com o resto do projeto)
- Alterar relations (ja foram corrigidas na Fase 1 -- todas ja apontam para `users.userPlatformId`)
- Alterar endpoints ou logica de negocios
- Modificar tabelas que ja possuem FK constraint (Grupo A e Grupo B ja corrigido)

## Analise Tecnica -- Verificacao Real do schema.ts

Todas as 17 tabelas foram verificadas individualmente no arquivo `shared/schema.ts`. Abaixo esta o mapeamento completo com a linha exata no schema e o status atual.

### Tabelas Confirmadas Sem FK Constraint

| # | Tabela (Drizzle) | Campo | Linha | Declaracao Atual | Relation Existente |
|---|------------------|-------|-------|------------------|--------------------|
| 1 | `tournamentTemplates` | `userId` | 225 | `varchar("user_id").notNull()` | Sim (linha 591-593) -> `users.userPlatformId` |
| 2 | `weeklyPlans` | `userId` | 247 | `varchar("user_id").notNull()` | Sim (linha 601-603) -> `users.userPlatformId` |
| 3 | `plannedTournaments` | `userId` | 261 | `varchar("user_id").notNull()` | Sim (linha 609-611) -> `users.userPlatformId` |
| 4 | `grindSessions` | `userId` | 287 | `varchar("user_id").notNull()` | Sim (linha 620-622) -> `users.userPlatformId` |
| 5 | `breakFeedbacks` | `userId` | 335 | `varchar("user_id").notNull()` | Sim (linha 699-701) -> `users.userPlatformId` |
| 6 | `sessionTournaments` | `userId` | 350 | `varchar("user_id").notNull()` | Sim (linha 710-712) -> `users.userPlatformId` |
| 7 | `preparationLogs` | `userId` | 378 | `varchar("user_id").notNull()` | Sim (linha 631-633) -> `users.userPlatformId` |
| 8 | `customGroups` | `userId` | 395 | `varchar("user_id").notNull()` | Sim (linha 642-644) -> `users.userPlatformId` |
| 9 | `coachingInsights` | `userId` | 412 | `varchar("user_id").notNull()` | Sim (linha 661-663) -> `users.userPlatformId` |
| 10 | `userSettings` | `userId` | 427 | `varchar("user_id").unique().notNull()` | Sim (linha 668-671) -> `users.userPlatformId` |
| 11 | `studyCards` | `userId` | 444 | `varchar("user_id").notNull()` | Sim (linha 725-727) -> `users.userPlatformId` |
| 12 | `studySessions` | `userId` | 496 | `varchar("user_id").notNull()` | Sim (linha 752-754) -> `users.userPlatformId` |
| 13 | `activeDays` | `userId` | 510 | `varchar("user_id").notNull()` | Sim (linha 763-765) -> `users.userPlatformId` |
| 14 | `weeklyRoutines` | `userId` | 1054 | `varchar("user_id").notNull()` | Sim (linha 1131-1133) -> `users.userPlatformId` |
| 15 | `calendarCategories` | `userId` | 1067 | `varchar("user_id").notNull()` | Sim (linha 1149-1151) -> `users.userPlatformId` |
| 16 | `calendarEvents` | `userId` | 1079 | `varchar("user_id").notNull()` | Sim (linha 1157-1159) -> `users.userPlatformId` |
| 17 | `studySchedules` | `userId` | 1103 | `varchar("user_id").notNull()` | Sim (linha 1138-1140) -> `users.userPlatformId` |

**Nota sobre `userSettings`:** Esta tabela tem `unique()` no campo `userId` (relacao 1:1 com usuario). A FK deve ser adicionada mantendo o `unique()`.

## Solucao Proposta

### Divisao em 2 Batches

A implementacao sera dividida em 2 batches para reduzir risco. Se o Batch 1 falhar (por dados orfaos), o Batch 2 nao e afetado e vice-versa.

---

### Batch 1: Tabelas Criticas do Core Business (9 tabelas)

Estas tabelas sao as mais importantes para o negocio -- torneios, sessoes de grind, planejamento e templates. Sao as mais usadas pelos endpoints e as que mais se beneficiam da integridade referencial.

| # | Tabela | Alteracao no schema.ts |
|---|--------|------------------------|
| 1 | `tournamentTemplates` | Linha 225: adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| 2 | `weeklyPlans` | Linha 247: adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| 3 | `plannedTournaments` | Linha 261: adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| 4 | `grindSessions` | Linha 287: adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| 5 | `breakFeedbacks` | Linha 335: adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| 6 | `sessionTournaments` | Linha 350: adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| 7 | `preparationLogs` | Linha 378: adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| 8 | `customGroups` | Linha 395: adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| 9 | `userSettings` | Linha 427: adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` (manter `.unique()`) |

**Exemplo de alteracao para `tournamentTemplates` (antes/depois):**

Antes:
```typescript
userId: varchar("user_id").notNull(),
```

Depois:
```typescript
userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
```

**Exemplo para `userSettings` (manter unique):**

Antes:
```typescript
userId: varchar("user_id").unique().notNull(),
```

Depois:
```typescript
userId: varchar("user_id").unique().notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
```

---

### Batch 2: Tabelas Secundarias (8 tabelas)

Estas tabelas sao de funcionalidades auxiliares -- estudo, calendario, coaching. Sao menos criticas e menos usadas.

| # | Tabela | Alteracao no schema.ts |
|---|--------|------------------------|
| 10 | `coachingInsights` | Linha 412: adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| 11 | `studyCards` | Linha 444: adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| 12 | `studySessions` | Linha 496: adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| 13 | `activeDays` | Linha 510: adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| 14 | `weeklyRoutines` | Linha 1054: adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| 15 | `calendarCategories` | Linha 1067: adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| 16 | `calendarEvents` | Linha 1079: adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |
| 17 | `studySchedules` | Linha 1103: adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` |

---

### Procedimento de Implementacao (por batch)

1. **Antes de alterar o schema:** Executar query SQL no banco de producao para identificar registros orfaos em cada tabela do batch:
   ```sql
   -- Repetir para cada tabela do batch
   SELECT t.id, t.user_id
   FROM <tabela> t
   LEFT JOIN users u ON t.user_id = u.user_platform_id
   WHERE u.user_platform_id IS NULL;
   ```

2. **Se houver orfaos:** Decidir se devem ser deletados (dados de usuarios que ja nao existem) ou se o usuario precisa ser recriado. Na maioria dos casos, deletar e seguro -- sao dados sem dono.

3. **Alterar o schema.ts:** Adicionar `.references(() => users.userPlatformId, { onDelete: "cascade" })` em cada tabela do batch.

4. **Executar `npm run db:push`:** Aplica as constraints no banco. Se houver orfaos nao tratados no passo 2, este comando vai falhar com erro de FK violation.

5. **Verificar:** `npm run build` deve compilar sem erros de tipo. Testar endpoints principais do batch.

## Criterios de Aceite

### Batch 1
- [ ] `tournamentTemplates.userId` tem FK constraint para `users.userPlatformId` com `onDelete: cascade`
- [ ] `weeklyPlans.userId` tem FK constraint para `users.userPlatformId` com `onDelete: cascade`
- [ ] `plannedTournaments.userId` tem FK constraint para `users.userPlatformId` com `onDelete: cascade`
- [ ] `grindSessions.userId` tem FK constraint para `users.userPlatformId` com `onDelete: cascade`
- [ ] `breakFeedbacks.userId` tem FK constraint para `users.userPlatformId` com `onDelete: cascade`
- [ ] `sessionTournaments.userId` tem FK constraint para `users.userPlatformId` com `onDelete: cascade`
- [ ] `preparationLogs.userId` tem FK constraint para `users.userPlatformId` com `onDelete: cascade`
- [ ] `customGroups.userId` tem FK constraint para `users.userPlatformId` com `onDelete: cascade`
- [ ] `userSettings.userId` tem FK constraint para `users.userPlatformId` com `onDelete: cascade` E mantem constraint `unique`
- [ ] Nenhum registro orfao nas 9 tabelas (verificado por query antes do push)
- [ ] `npm run db:push` executa sem erros
- [ ] `npm run build` compila sem erros de tipo
- [ ] Endpoints de torneios, sessoes de grind, grade e templates continuam funcionando

### Batch 2
- [ ] `coachingInsights.userId` tem FK constraint para `users.userPlatformId` com `onDelete: cascade`
- [ ] `studyCards.userId` tem FK constraint para `users.userPlatformId` com `onDelete: cascade`
- [ ] `studySessions.userId` tem FK constraint para `users.userPlatformId` com `onDelete: cascade`
- [ ] `activeDays.userId` tem FK constraint para `users.userPlatformId` com `onDelete: cascade`
- [ ] `weeklyRoutines.userId` tem FK constraint para `users.userPlatformId` com `onDelete: cascade`
- [ ] `calendarCategories.userId` tem FK constraint para `users.userPlatformId` com `onDelete: cascade`
- [ ] `calendarEvents.userId` tem FK constraint para `users.userPlatformId` com `onDelete: cascade`
- [ ] `studySchedules.userId` tem FK constraint para `users.userPlatformId` com `onDelete: cascade`
- [ ] Nenhum registro orfao nas 8 tabelas (verificado por query antes do push)
- [ ] `npm run db:push` executa sem erros
- [ ] `npm run build` compila sem erros de tipo
- [ ] Endpoints de estudo, calendario e coaching continuam funcionando

### Geral (apos ambos os batches)
- [ ] Todas as 17 tabelas do Grupo C agora possuem FK constraint no banco PostgreSQL
- [ ] Nenhuma relation foi alterada (ja estavam corretas apos Fase 1)
- [ ] Nenhum campo foi renomeado
- [ ] O comportamento `onDelete: cascade` funciona corretamente -- ao deletar um usuario, todos os registros associados nas 17 tabelas sao deletados automaticamente

## Riscos

### Risco Alto: Registros orfaos impedem criacao da FK
Se existirem registros com `user_id` que nao corresponde a nenhum `user_platform_id` na tabela `users`, o PostgreSQL vai rejeitar a criacao da FK constraint e o `db:push` vai falhar.

**Probabilidade:** Media-alta. O sistema esta em producao sem FK constraints desde o inicio, entao e possivel que usuarios tenham sido deletados sem limpar registros associados.

**Mitigacao:** Antes de cada batch, executar a query de deteccao de orfaos (descrita no procedimento). Deletar orfaos ou decidir com o dev o que fazer com eles.

### Risco Medio: Cascade delete pode deletar dados inesperadamente
Com `onDelete: cascade`, se um usuario for deletado (por admin, por exemplo), TODOS os seus torneios, sessoes, templates, configuracoes, etc. serao deletados automaticamente pelo banco.

**Probabilidade:** Baixa. Deletar usuario e uma operacao rara e controlada (apenas admin).

**Mitigacao:** Isso e o comportamento desejado -- um usuario deletado nao deve ter dados orfaos. O sistema de admin ja deveria considerar isso. As 11 tabelas do Grupo A ja tem esse comportamento.

### Risco Baixo: Ordem de cascade em tabelas relacionadas
Algumas tabelas tem relacoes entre si alem da relacao com users. Por exemplo, `breakFeedbacks` tem `sessionId` que aponta para `grindSessions`, e `sessionTournaments` tambem. Se um usuario for deletado, o cascade pode tentar deletar `grindSessions` e `breakFeedbacks` ao mesmo tempo. O PostgreSQL lida com isso corretamente, mas vale verificar.

**Mitigacao:** O PostgreSQL resolve dependencias de cascade automaticamente. Nao e necessaria acao especial.

## Estimativa de Complexidade
Baixa. A alteracao e mecanica -- adicionar `.references()` em 17 linhas de um unico arquivo. O unico trabalho nao-trivial e a verificacao e limpeza de dados orfaos no banco de producao antes de aplicar cada batch.

## Arquivos Afetados
- `shared/schema.ts` -- 17 alteracoes pontuais (adicionar `.references()` em cada campo `userId`)

## Dependencias
- **Fase 1 concluida:** As relations ja devem estar corrigidas (apontando para `users.userPlatformId`) antes de adicionar as FK constraints. Se a Fase 1 nao foi aplicada, as relations estariam inconsistentes com as novas FKs. **Status: Ja implementada.**
- **Acesso ao banco de producao:** Necessario para executar queries de deteccao de orfaos antes de cada batch.
- **Backup do banco:** Recomendado antes de cada batch, caso a limpeza de orfaos delete dados que nao deveriam ser deletados.

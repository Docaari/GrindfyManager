# Spec: Consolidar Tabelas de Tracking Duplicadas

## Status
Concluida

## Resumo
Consolidar as duas tabelas de tracking de atividade do usuario (`user_activities` e `user_activity`) em uma unica tabela `user_activity`, eliminando a duplicidade sem perda de dados e mantendo compatibilidade com o admin dashboard e o sistema de analytics.

## Contexto
O codebase possui duas tabelas com propositos sobrepostos:

- `user_activities` (tabela "basica") -- usada pelo `subscriptionService.ts` para registrar eventos de engajamento (login, upload, grind_session, page_view).
- `user_activity` (tabela "avancada") -- usada pelo sistema de analytics admin (`/api/analytics/*`) e pelo `AnalyticsTracker` no frontend para rastrear page views, feature usage, duracoes de sessao, IP e user-agent.

Ambas rastreiam atividade do usuario, ambas tem `userId`, `page`, `metadata` e `createdAt`. A separacao cria confusao, fragmenta dados e gera bugs (por exemplo, `user_activity` nao e limpa na delecao de usuario, enquanto `user_activities` e).

Este e o item 5 da secao 10.2 (Inconsistencias Tecnicas) do CLAUDE.md.

## Schemas Atuais (exatos, lidos de `shared/schema.ts`)

### Tabela `user_activities` (linhas 113-121)
```typescript
export const userActivities = pgTable("user_activities", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  activityType: varchar("activity_type").notNull(), // login, logout, grind_session, upload, study_session, page_view
  page: varchar("page"),                            // dashboard, grind, studies, etc.
  sessionDuration: integer("session_duration"),      // em minutos
  metadata: jsonb("metadata"),                       // dados adicionais da atividade
  createdAt: timestamp("created_at").defaultNow(),
});
```

### Tabela `user_activity` (linhas 151-162)
```typescript
export const userActivity = pgTable("user_activity", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  page: varchar("page").notNull(),                   // dashboard, grind, warm-up, studies, etc.
  action: varchar("action").notNull(),               // page_view, feature_use, session_start, session_end
  feature: varchar("feature"),                       // upload, filter, export, etc.
  duration: integer("duration"),                     // session duration in seconds
  metadata: jsonb("metadata"),                       // additional context data
  ipAddress: varchar("ip_address"),
  userAgent: varchar("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});
```

### Diferencas-chave entre as tabelas

| Aspecto | `user_activities` | `user_activity` |
|---|---|---|
| Campo de tipo de evento | `activityType` (varchar) | `action` (varchar, NOT NULL) |
| Campo de pagina | `page` (nullable) | `page` (NOT NULL) |
| Campo de feature | nao tem | `feature` (nullable) |
| Duracao | `sessionDuration` (minutos) | `duration` (segundos) |
| IP/UserAgent | nao tem | `ipAddress`, `userAgent` |
| Relacoes Drizzle | Sim (`userActivitiesRelations`) | Nao |
| Limpeza na delecao de usuario | Sim (routes.ts:1438) | Nao (BUG) |
| Zod insert schema | `insertUserActivitiesSchema` | `insertUserActivitySchema` |
| Type export | `UserActivity` (aponta para `userActivities.$inferSelect`) | nenhum tipo dedicado |

## Uso Atual no Codebase

### `user_activities` -- 3 pontos de uso

1. **`server/subscriptionService.ts` (linhas 111-112)** -- INSERT: registra atividade via `trackUserActivity()` com campos `activityType`, `page`, `sessionDuration`, `metadata`.
2. **`server/routes.ts` (linha 1438-1439)** -- DELETE: limpeza ao deletar usuario via admin (`DELETE /api/admin/users/:id`).
3. **`shared/schema.ts` (linhas 799-804)** -- Drizzle relations definidas.

### `user_activity` -- 13+ pontos de uso (tabela principal de analytics)

1. **`POST /api/analytics/track` (routes.ts:4784-4807)** -- INSERT: registra atividade do frontend (page, action, feature, duration, ipAddress, userAgent).
2. **`GET /api/analytics/users` (routes.ts:4477)** -- SELECT: lista usuarios com metricas de atividade (totalSessions, totalDuration, avgSessionDuration, lastActivity, isActive).
3. **`GET /api/analytics/features` (routes.ts:4551)** -- SELECT: uso de features agregado (usageCount, uniqueUsers, avgDuration).
4. **`GET /api/analytics/executive` (routes.ts:4598)** -- SELECT: stats executivas (activeUsers, totalEvents, avgDuration, topPages, topFeatures, activityByHour, dailyTrend).
5. **`GET /api/analytics/activity` (routes.ts:4709)** -- SELECT: lista detalhada de atividades com filtro por usuario e periodo.
6. **`GET /api/admin/monitoring` (routes.ts:5027)** -- SELECT: monitoramento real-time (usuarios online nos ultimos 5min, atividade por hora, usuarios mais ativos).
7. **Admin dashboard stats (routes.ts:5078-5108)** -- SELECT: contagem de atividades nas ultimas 24h e 1h.
8. **Admin user data count (routes.ts:5892-5895)** -- SELECT: contagem de atividades por usuario na tela de admin.

### Frontend

1. **`client/src/components/AnalyticsTracker.tsx`** -- Wrapper que usa `useActivityTracker` para enviar eventos automaticamente.
2. **`client/src/hooks/useActivityTracker.ts`** -- Hook que chama `POST /api/analytics/track` com page_view, feature_use, session_start, session_end.
3. **`client/src/pages/Analytics.tsx`** -- Consome `GET /api/analytics/activity` para exibir dados de atividade.

### Testes existentes

- `tests/unit/dashboard/dashboard-schemas.test.ts` -- Testes de validacao Zod para ambos os schemas (`insertUserActivitySchema` e `insertUserActivitiesSchema`).

## Usuarios
- **Admin:** Visualiza analytics e monitoramento no admin dashboard (consome dados de `user_activity`)
- **Sistema (subscriptionService):** Registra eventos de engajamento (escreve em `user_activities`)
- **Frontend (AnalyticsTracker):** Registra page views e feature usage automaticamente (escreve em `user_activity`)

## Requisitos Funcionais

### RF-01: Unificar em tabela `user_activity` (a mais completa)
**Descricao:** A tabela `user_activity` sera mantida como a tabela unica de tracking. A tabela `user_activities` sera descontinuada e seus dados migrados.
**Decisao:** `user_activity` e a escolha correta porque: (a) tem mais campos, (b) tem 13+ pontos de uso vs 3, (c) e usada pelo sistema de analytics que e a funcionalidade principal de tracking.
**Regras de negocio:**
- O schema consolidado deve conter todos os campos de ambas as tabelas
- O campo `activityType` de `user_activities` sera mapeado para o campo `action` de `user_activity`
- O campo `sessionDuration` (em minutos) sera convertido para `duration` (em segundos) durante a migracao, multiplicando por 60
- O campo `page` permanece NOT NULL na tabela consolidada; registros migrados com `page` NULL receberao o valor `'unknown'`
**Criterio de aceitacao:**
- [ ] Tabela `user_activity` contem todos os campos necessarios
- [ ] Nenhum campo de `user_activities` ficou sem correspondencia na tabela consolidada

### RF-02: Migrar dados existentes de `user_activities` para `user_activity`
**Descricao:** Todos os registros de `user_activities` devem ser copiados para `user_activity` com mapeamento correto de campos.
**Regras de negocio:**
- Mapeamento de campos:
  - `user_activities.id` -> `user_activity.id` (manter original)
  - `user_activities.userId` -> `user_activity.userId`
  - `user_activities.activityType` -> `user_activity.action`
  - `user_activities.page` -> `user_activity.page` (usar `'unknown'` se NULL)
  - `user_activities.sessionDuration` -> `user_activity.duration` (multiplicar por 60 para converter minutos em segundos)
  - `user_activities.metadata` -> `user_activity.metadata`
  - `user_activities.createdAt` -> `user_activity.createdAt`
  - `user_activity.feature` -> NULL (nao existe em `user_activities`)
  - `user_activity.ipAddress` -> NULL (nao existe em `user_activities`)
  - `user_activity.userAgent` -> NULL (nao existe em `user_activities`)
- IDs originais sao preservados para evitar duplicatas se a migracao rodar mais de uma vez (usar INSERT ... ON CONFLICT DO NOTHING)
- A migracao deve rodar em transacao
**Criterio de aceitacao:**
- [ ] Todos os registros de `user_activities` existem em `user_activity` apos a migracao
- [ ] Campos mapeados corretamente (activityType -> action, sessionDuration*60 -> duration, page NULL -> 'unknown')
- [ ] Nenhum registro duplicado em `user_activity`
- [ ] Migracao e idempotente (rodar 2x nao causa erro nem duplicatas)

### RF-03: Atualizar `subscriptionService.ts` para usar `user_activity`
**Descricao:** O metodo `trackUserActivity()` em `subscriptionService.ts` deve inserir em `user_activity` em vez de `user_activities`.
**Regras de negocio:**
- Mapear `activityType` para o campo `action`
- Converter `sessionDuration` (minutos) para `duration` (segundos) multiplicando por 60
- Preencher `page` com `'unknown'` quando nao fornecido (campo e NOT NULL em `user_activity`)
- Manter a mesma interface publica do metodo `trackUserActivity()` para nao quebrar chamadores
**Criterio de aceitacao:**
- [ ] `subscriptionService.ts` importa `userActivity` em vez de `userActivities`
- [ ] INSERT usa o schema de `user_activity` com mapeamento correto
- [ ] A assinatura do metodo `trackUserActivity()` nao muda
- [ ] Dados inseridos sao visiveis nos endpoints de analytics existentes

### RF-04: Adicionar limpeza de `user_activity` na delecao de usuario
**Descricao:** Corrigir o bug onde `user_activity` nao e limpa ao deletar um usuario pelo admin.
**Regras de negocio:**
- Adicionar `DELETE FROM user_activity WHERE user_id = ?` na transacao de delecao de usuario em `routes.ts` (proximo a linha 1438)
- Nota: a FK ja tem `onDelete: "cascade"` no schema, entao o banco faz isso automaticamente. Porem, a delecao explicita no codigo garante consistencia mesmo se a constraint nao existir no banco real (problema comum em projetos migrados do Replit). Manter a delecao explicita.
**Criterio de aceitacao:**
- [ ] Deletar usuario via admin remove registros de `user_activity` do usuario
- [ ] Transacao de delecao inclui `user_activity` junto com `user_activities` (que sera removida depois)

### RF-05: Remover tabela `user_activities` e artefatos associados
**Descricao:** Apos migracao confirmada, remover a tabela antiga e todos os artefatos de codigo.
**Regras de negocio:**
- Remover de `shared/schema.ts`:
  - Definicao da tabela `userActivities` (linhas 113-121)
  - Relacoes `userActivitiesRelations` (linhas 799-804)
  - Schema Zod `insertUserActivitiesSchema` (linhas 995-998)
  - Type `UserActivity` (linha 1248) -- recriar apontando para `userActivity.$inferSelect`
  - Type `InsertUserActivity` (linha 1249) -- recriar apontando para `insertUserActivitySchema`
- Remover de `server/routes.ts`:
  - Import de `userActivities` (linha 57)
  - DELETE de `userActivities` na transacao de delecao de usuario (linhas 1438-1439, substituido pelo RF-04)
- Adicionar relacoes Drizzle para `userActivity` (atualmente nao tem):
  ```typescript
  export const userActivityRelations = relations(userActivity, ({ one }) => ({
    user: one(users, {
      fields: [userActivity.userId],
      references: [users.userPlatformId],
    }),
  }));
  ```
- DROP TABLE `user_activities` via migracao SQL
- Atualizar testes em `tests/unit/dashboard/dashboard-schemas.test.ts`:
  - Remover bloco `describe('insertUserActivitiesSchema', ...)`
  - Manter/atualizar bloco `describe('insertUserActivitySchema', ...)`
**Criterio de aceitacao:**
- [ ] Nenhuma referencia a `userActivities` ou `user_activities` existe no codebase
- [ ] `userActivity` tem relacoes Drizzle definidas
- [ ] Types `UserActivity` e `InsertUserActivity` apontam para a tabela correta
- [ ] Testes atualizados e passando
- [ ] Tabela `user_activities` removida do banco

### RF-06: Criar tabela de backup antes da migracao (reversibilidade)
**Descricao:** Antes de migrar e deletar, criar uma copia de seguranca da tabela `user_activities`.
**Regras de negocio:**
- Criar tabela `user_activities_backup` com `CREATE TABLE user_activities_backup AS SELECT * FROM user_activities`
- Manter a tabela de backup por 30 dias apos a migracao ser confirmada como bem-sucedida
- Documentar comando de rollback: `INSERT INTO user_activities SELECT * FROM user_activities_backup`
**Criterio de aceitacao:**
- [ ] Tabela `user_activities_backup` criada antes de qualquer delecao
- [ ] Backup contem todos os registros originais
- [ ] Comando de rollback documentado na migracao

## Requisitos Nao-Funcionais
- **Migracao sem downtime:** A migracao SQL deve rodar em transacao. Se falhar, rollback automatico.
- **Idempotencia:** Rodar a migracao multiplas vezes nao causa erro nem duplicatas (INSERT ... ON CONFLICT DO NOTHING).
- **Reversibilidade:** A tabela de backup permite restaurar dados se algo der errado.
- **Performance:** Nenhum impacto em queries existentes -- a tabela `user_activity` ja e a usada pelos endpoints de analytics.

## Endpoints Previstos
Nenhum endpoint novo. Endpoints existentes continuam funcionando sem alteracao de contrato:

| Metodo | Rota | Mudanca |
|---|---|---|
| POST | /api/analytics/track | Nenhuma (ja usa `user_activity`) |
| GET | /api/analytics/users | Nenhuma (ja usa `user_activity`) |
| GET | /api/analytics/features | Nenhuma (ja usa `user_activity`) |
| GET | /api/analytics/executive | Nenhuma (ja usa `user_activity`) |
| GET | /api/analytics/activity | Nenhuma (ja usa `user_activity`) |
| GET | /api/admin/monitoring | Nenhuma (ja usa `user_activity`) |
| DELETE | /api/admin/users/:id | Interna: adiciona cleanup de `user_activity`, remove cleanup de `user_activities` |

## Modelos de Dados Afetados

### user_activity (mantida, tabela consolidada final)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| id | varchar | PK, NOT NULL | nanoid |
| userId | varchar | NOT NULL, FK -> users.userPlatformId, ON DELETE CASCADE | |
| page | varchar | NOT NULL | 'unknown' para registros migrados sem page |
| action | varchar | NOT NULL | Absorve valores de `activityType`: login, logout, grind_session, upload, study_session, page_view, feature_use, session_start, session_end |
| feature | varchar | nullable | upload, filter, export, etc. |
| duration | integer | nullable | Em segundos. Dados migrados de `sessionDuration` (minutos) sao multiplicados por 60 |
| metadata | jsonb | nullable | Dados adicionais |
| ipAddress | varchar | nullable | IP do request |
| userAgent | varchar | nullable | User-Agent do request |
| createdAt | timestamp | DEFAULT now() | |

### user_activities (removida)
Tabela sera removida apos migracao. Backup em `user_activities_backup`.

### user_activities_backup (nova, temporaria)
Copia exata de `user_activities` para rollback. Remover apos 30 dias.

## Integracoes Externas
Nenhuma.

## Cenarios de Teste Derivados

### Happy Path
- [ ] Apos migracao, todos os registros de `user_activities` existem em `user_activity` com mapeamento correto
- [ ] `POST /api/analytics/track` continua inserindo em `user_activity` normalmente
- [ ] `subscriptionService.trackUserActivity()` insere em `user_activity` com campos corretos
- [ ] Endpoints de analytics retornam dados que incluem registros migrados
- [ ] Admin dashboard de monitoramento funciona normalmente

### Validacao de Migracao de Dados
- [ ] `activityType = 'login'` vira `action = 'login'`
- [ ] `sessionDuration = 45` (minutos) vira `duration = 2700` (segundos)
- [ ] `page = NULL` vira `page = 'unknown'`
- [ ] `feature`, `ipAddress`, `userAgent` ficam NULL para registros migrados
- [ ] `createdAt` preservado do registro original

### Regras de Negocio
- [ ] Migracao idempotente: rodar 2x nao cria duplicatas (ON CONFLICT DO NOTHING)
- [ ] Transacao: falha em qualquer passo da migracao faz rollback completo
- [ ] Delecao de usuario pelo admin limpa registros de `user_activity`

### Edge Cases
- [ ] `user_activities` vazia -- migracao roda sem erro
- [ ] Registro com `sessionDuration = NULL` -- `duration` fica NULL (nao 0)
- [ ] Registro com `metadata = NULL` -- permanece NULL
- [ ] IDs identicos entre as duas tabelas (improvavel mas possivel) -- ON CONFLICT DO NOTHING preserva o registro existente em `user_activity`

### Regressao
- [ ] Testes de `insertUserActivitySchema` continuam passando
- [ ] Nenhuma referencia a `userActivities` ou `insertUserActivitiesSchema` no codebase apos remocao
- [ ] Build TypeScript compila sem erros (`npm run check`)

## Fora de Escopo
- Alteracao de endpoints de analytics (contratos de API permanecem identicos)
- Refatoracao do `routes.ts` monolitico (spec separada)
- Criacao de indices na tabela `user_activity` (avaliar em spec de performance se necessario)
- Consolidacao da tabela `engagement_metrics` (tabela distinta com proposito diferente -- metricas agregadas, nao eventos individuais)
- Consolidacao de `access_logs` (tabela distinta para audit trail de seguranca)
- Alteracao do frontend `AnalyticsTracker` ou `useActivityTracker` (ja usam `user_activity` via API)

## Dependencias
- Nenhuma. Esta spec nao depende de outras features.

## Ordem de Execucao Recomendada

A implementacao deve seguir esta ordem para garantir reversibilidade:

1. **Fase 1 -- Preparacao (sem risco):**
   - RF-06: Criar backup de `user_activities`
   - RF-04: Adicionar cleanup de `user_activity` na delecao de usuario
   - RF-05 (parcial): Adicionar relacoes Drizzle para `user_activity`

2. **Fase 2 -- Migracao de dados:**
   - RF-02: Migrar dados de `user_activities` para `user_activity`
   - Validar contagens: `SELECT COUNT(*) FROM user_activities` deve ser igual a `SELECT COUNT(*) FROM user_activity WHERE id IN (SELECT id FROM user_activities_backup)`

3. **Fase 3 -- Troca de codigo:**
   - RF-01: Confirmar schema consolidado
   - RF-03: Atualizar `subscriptionService.ts`

4. **Fase 4 -- Limpeza (apos validacao):**
   - RF-05: Remover tabela `user_activities`, artefatos de codigo, atualizar testes
   - DROP TABLE `user_activities` (manter `user_activities_backup` por 30 dias)

## SQL de Migracao de Referencia

```sql
-- Fase 1: Backup
CREATE TABLE IF NOT EXISTS user_activities_backup AS SELECT * FROM user_activities;

-- Fase 2: Migrar dados
INSERT INTO user_activity (id, user_id, page, action, feature, duration, metadata, ip_address, user_agent, created_at)
SELECT
  id,
  user_id,
  COALESCE(page, 'unknown'),
  activity_type,
  NULL,
  CASE WHEN session_duration IS NOT NULL THEN session_duration * 60 ELSE NULL END,
  metadata,
  NULL,
  NULL,
  created_at
FROM user_activities
ON CONFLICT (id) DO NOTHING;

-- Fase 4: Remocao (apos validacao)
DROP TABLE IF EXISTS user_activities;

-- Rollback (se necessario):
-- CREATE TABLE user_activities AS SELECT * FROM user_activities_backup;
```

## Notas de Implementacao
- O tipo `UserActivity` em `shared/schema.ts` (linha 1248) atualmente aponta para `userActivities.$inferSelect`. Ao remover `userActivities`, recriar como `typeof userActivity.$inferSelect`. Isso pode causar erros de tipo no `subscriptionService.ts` que precisa ser atualizado primeiro (Fase 3 antes de Fase 4).
- A tabela `engagement_metrics` NAO faz parte desta consolidacao. Ela contem metricas agregadas (streaks, scores, totais) e nao eventos individuais.
- Os testes unitarios existentes testam apenas validacao de schemas Zod, nao queries ao banco. Nao precisam de banco para rodar.

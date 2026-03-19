# Spec: Remover Feature Weekly Planner

## Status
Aprovada

## Resumo
Remover a pagina Weekly Planner (rota `/planner`, label "Calendario") da aplicacao, incluindo seus componentes exclusivos, endpoints exclusivos e referencias em navegacao/roteamento. Manter tabelas do banco, schemas Drizzle e endpoints compartilhados com outras features.

## Contexto
A feature Weekly Planner (`/planner`) e uma pagina de calendario semanal que renderiza o componente `IntelligentCalendar` e consome o endpoint `/api/weekly-plans`. Esta feature esta listada no Sidebar como "Calendario" na secao "FERRAMENTAS" com tag PRO. A funcionalidade e pouco utilizada e sera removida para simplificar a aplicacao. As tabelas `weekly_plans` e `planned_tournaments` no banco serao mantidas pois contem dados de producao e sao usadas por outras features (GradePlanner, GrindSession, GrindSessionLive, generateWeeklyRoutine).

## Diagnostico Completo

### Arquivos Analisados e Classificacao

#### EXCLUSIVOS do Weekly Planner (DELETAR)

| Arquivo | Justificativa |
|---------|---------------|
| `client/src/pages/WeeklyPlanner.tsx` | Pagina da rota `/planner`. Unico consumidor de `IntelligentCalendar`. Unico arquivo que faz fetch de `/api/weekly-plans` no frontend. |
| `client/src/components/IntelligentCalendar.tsx` | Componente usado APENAS por `WeeklyPlanner.tsx` (unico import encontrado). |
| `client/src/components/WeeklyCalendar.tsx` | Componente NAO importado por nenhum arquivo (zero imports encontrados). Recebe `weeklyPlans` como prop. Codigo morto. |

#### COMPARTILHADOS (REMOVER APENAS A REFERENCIA ao `/planner`)

| Arquivo | Linha(s) | O que remover |
|---------|----------|---------------|
| `client/src/App.tsx` | L17 | Remover: `import WeeklyPlanner from "@/pages/WeeklyPlanner";` |
| `client/src/App.tsx` | L101-105 | Remover bloco: `<Route path="/planner" component={...}><WeeklyPlanner /></Route>` |
| `client/src/components/Sidebar.tsx` | L61 | Remover: `{ path: '/planner', icon: FileText, label: 'Calendario', permission: null, hasPro: true },` |
| `client/src/components/ProtectedRoute.tsx` | L72-76 | Remover bloco `/planner` do `pageInfoMap` (featureName: 'Calendario Integrado') |
| `client/src/components/ProtectedRoute.tsx` | L144 | Remover: `'/planner': 'Calendario',` do `routeToTag` |
| `client/src/components/AnalyticsTracker.tsx` | L36 | Remover: `'/planner': ['weekly_planning', 'tournament_schedule', 'suggestion_use'],` |
| `client/src/components/PermissionTestComponent.tsx` | L18 | Remover: `{ route: '/planner', name: 'Planner' },` |

#### BACKEND -- Endpoints EXCLUSIVOS do Weekly Planner (REMOVER)

| Metodo | Rota | Arquivo | Linhas | Justificativa |
|--------|------|---------|--------|---------------|
| GET | `/api/weekly-plans` | `server/routes.ts` | L2630-2639 | Consumido APENAS por `WeeklyPlanner.tsx` no frontend. Tambem chamado por `generateWeeklyRoutine` (ver nota abaixo). |
| POST | `/api/weekly-plans` | `server/routes.ts` | L2641-2651 | Consumido APENAS por `WeeklyPlanner.tsx` (nunca chamado no frontend atualmente, mas e o endpoint de criacao). |

**NOTA IMPORTANTE sobre `generateWeeklyRoutine`:** A funcao `generateWeeklyRoutine` (L143-209 de `routes.ts`) chama `storage.getWeeklyPlans()` na L148. Esta funcao e usada pelo endpoint `POST /api/weekly-routine/generate` (L4761) que pertence ao sistema de Calendario Avancado (IntelligentCalendar). Com a remocao do Weekly Planner, nenhum usuario criara novos `weekly_plans`, entao este trecho retornara array vazio. Nao e necessario remover a chamada -- ela e inofensiva e mantem compatibilidade futura.

#### BACKEND -- Endpoints COMPARTILHADOS (MANTER)

| Metodo | Rota | Usado por |
|--------|------|-----------|
| GET | `/api/planned-tournaments` | GradePlanner, GrindSession, GrindSessionLive |
| POST | `/api/planned-tournaments` | GradePlanner, GrindSessionLive |
| PUT | `/api/planned-tournaments/:id` | GradePlanner, GrindSessionLive |
| DELETE | `/api/planned-tournaments/:id` | GradePlanner |

#### STORAGE -- Metodos EXCLUSIVOS do Weekly Planner (MANTER por ora)

| Metodo | Arquivo | Linhas | Nota |
|--------|---------|--------|------|
| `getWeeklyPlans()` | `server/storage.ts` | L813-818 | Usado por `generateWeeklyRoutine`. Manter. |
| `getWeeklyPlan()` | `server/storage.ts` | L821-823 | Nao usado em nenhum endpoint ativo. Pode ser removido futuramente. |
| `createWeeklyPlan()` | `server/storage.ts` | L826-831 | Usado apenas por `POST /api/weekly-plans`. Pode ser removido futuramente. |
| `updateWeeklyPlan()` | `server/storage.ts` | L834-840 | Nao usado em nenhum endpoint ativo. Pode ser removido futuramente. |
| `deleteWeeklyPlan()` | `server/storage.ts` | L843-844 | Nao usado em nenhum endpoint ativo. Pode ser removido futuramente. |
| Interface declarations | `server/storage.ts` | L272-276 | Interface `IStorage` com os 5 metodos acima. |

**Decisao:** Manter os metodos de storage por agora. `getWeeklyPlans` e ativamente usado por `generateWeeklyRoutine`. Os demais sao codigo morto apos a remocao dos endpoints, mas remove-los exigiria alterar a interface `IStorage` e nao traz beneficio imediato.

#### SCHEMA e TABELAS (MANTER -- NAO TOCAR)

| Item | Arquivo | Linhas | Justificativa |
|------|---------|--------|---------------|
| Tabela `weeklyPlans` | `shared/schema.ts` | L245-257 | Dados em producao. Referenciada por `generateWeeklyRoutine`. |
| `weeklyPlansRelations` | `shared/schema.ts` | L600-606 | Relacao ORM. Manter. |
| `insertWeeklyPlanSchema` | `shared/schema.ts` | L870-874 | Usado em testes existentes. Manter. |
| Tipo `WeeklyPlan` | `shared/schema.ts` | L1013 | Tipo exportado. Manter. |
| Tipo `InsertWeeklyPlan` | `shared/schema.ts` | L1014 | Tipo exportado. Manter. |
| Relacao em `usersRelations` | `shared/schema.ts` | L559 | `weeklyPlans: many(weeklyPlans)`. Manter. |
| Tabela `plannedTournaments` | `shared/schema.ts` | L259+ | Usada extensivamente por GradePlanner, GrindSession. NAO tocar. |
| Import em `routes.ts` | `server/routes.ts` | L18 | `insertWeeklyPlanSchema` -- remover apenas se os endpoints forem removidos. |

#### TESTES (MANTER)

| Arquivo | Nota |
|---------|------|
| `tests/unit/grade-planner/grade-planner-schemas.test.ts` | Testa `insertWeeklyPlanSchema`. Manter -- schema continua existindo. |

## Requisitos Funcionais

### RF-01: Remover pagina Weekly Planner do frontend
**Descricao:** Deletar o arquivo da pagina e seus componentes exclusivos.
**Acoes:**
- Deletar `client/src/pages/WeeklyPlanner.tsx`
- Deletar `client/src/components/IntelligentCalendar.tsx`
- Deletar `client/src/components/WeeklyCalendar.tsx`
**Criterio de aceitacao:**
- [ ] Os tres arquivos nao existem mais no repositorio
- [ ] Nenhum outro arquivo importava esses componentes (confirmado pela investigacao)

### RF-02: Remover rota `/planner` do roteamento
**Descricao:** Remover import e registro de rota em App.tsx.
**Acoes:**
- Em `client/src/App.tsx` L17: remover `import WeeklyPlanner from "@/pages/WeeklyPlanner";`
- Em `client/src/App.tsx` L101-105: remover o bloco `<Route path="/planner" ...>`
**Criterio de aceitacao:**
- [ ] A rota `/planner` nao existe mais
- [ ] Acessar `/planner` exibe a pagina 404 (NotFound)
- [ ] Aplicacao compila sem erros

### RF-03: Remover link de navegacao do Sidebar
**Descricao:** Remover o item "Calendario" da secao FERRAMENTAS do Sidebar.
**Acoes:**
- Em `client/src/components/Sidebar.tsx` L61: remover a linha `{ path: '/planner', icon: FileText, label: 'Calendario', permission: null, hasPro: true },`
**Criterio de aceitacao:**
- [ ] O item "Calendario" nao aparece mais no menu lateral
- [ ] Os demais itens da secao FERRAMENTAS continuam funcionando

### RF-04: Remover referencias em componentes auxiliares
**Descricao:** Limpar referencias a `/planner` em ProtectedRoute, AnalyticsTracker e PermissionTestComponent.
**Acoes:**
- Em `client/src/components/ProtectedRoute.tsx` L72-76: remover bloco `/planner` do objeto `pageInfoMap`
- Em `client/src/components/ProtectedRoute.tsx` L144: remover `'/planner': 'Calendario',` do objeto `routeToTag`
- Em `client/src/components/AnalyticsTracker.tsx` L36: remover `'/planner': ['weekly_planning', 'tournament_schedule', 'suggestion_use'],`
- Em `client/src/components/PermissionTestComponent.tsx` L18: remover `{ route: '/planner', name: 'Planner' },`
**Criterio de aceitacao:**
- [ ] Nenhuma referencia a `/planner` existe no diretorio `client/src/`
- [ ] ProtectedRoute, AnalyticsTracker e PermissionTestComponent compilam sem erros

### RF-05: Remover endpoints exclusivos do backend
**Descricao:** Remover os endpoints GET e POST de `/api/weekly-plans` do routes.ts.
**Acoes:**
- Em `server/routes.ts` L2629-2651: remover o comentario `// Weekly plan routes` e os dois handlers (GET e POST)
- Em `server/routes.ts` L18: remover `insertWeeklyPlanSchema` do import de `@shared/schema` (verificar se nao e usado em outro lugar do routes.ts -- confirmado: so e usado na L2644 dentro do POST que sera removido)
**Criterio de aceitacao:**
- [ ] `GET /api/weekly-plans` retorna 404
- [ ] `POST /api/weekly-plans` retorna 404
- [ ] Servidor compila e inicia sem erros
- [ ] Nenhum outro endpoint foi afetado

## Fora de Escopo
- NAO deletar tabelas `weekly_plans` ou `planned_tournaments` do banco de dados
- NAO remover schemas Drizzle (`weeklyPlans`, `plannedTournaments`, relacoes, tipos) de `shared/schema.ts`
- NAO remover metodos de `storage.ts` (`getWeeklyPlans`, `createWeeklyPlan`, etc.)
- NAO remover a funcao `generateWeeklyRoutine` de `routes.ts` (ela usa `getWeeklyPlans` e pertence ao sistema de calendario)
- NAO tocar nos endpoints `/api/planned-tournaments` (compartilhados com GradePlanner e GrindSession)
- NAO remover testes existentes que referenciam `insertWeeklyPlanSchema`
- NAO fazer migracoes de banco de dados

## Dependencias
- Nenhuma. Esta remocao nao depende de outras features ou mudancas.

## Riscos
- **Baixo:** A funcao `generateWeeklyRoutine` continuara chamando `storage.getWeeklyPlans()`, que retornara array vazio para usuarios que nunca criaram weekly plans. Isso e inofensivo -- a funcao ja trata esse caso.
- **Baixo:** Dados existentes na tabela `weekly_plans` ficam orfaos (sem UI para acessa-los). Isso e intencional -- a tabela pode ser limpa em uma etapa futura de cleanup.

## Cenarios de Teste Derivados

### Happy Path
- [ ] Aplicacao compila sem erros apos todas as remocoes (`npm run build`)
- [ ] Sidebar renderiza sem o item "Calendario" na secao FERRAMENTAS
- [ ] Todas as demais rotas continuam funcionando normalmente

### Regressao -- Features que usam `planned_tournaments`
- [ ] GradePlanner (`/coach`) carrega e exibe torneios planejados normalmente
- [ ] GrindSession (`/grind`) carrega torneios planejados do dia normalmente
- [ ] GrindSessionLive (`/grind-live`) consegue adicionar/editar/remover torneios durante sessao
- [ ] `POST /api/weekly-routine/generate` continua funcionando (generateWeeklyRoutine)

### Navegacao
- [ ] Acessar `/planner` diretamente na URL exibe pagina 404
- [ ] Nenhum link para `/planner` existe na aplicacao

### Backend
- [ ] `GET /api/weekly-plans` retorna 404
- [ ] `POST /api/weekly-plans` retorna 404
- [ ] Endpoints de `/api/planned-tournaments` continuam respondendo normalmente

## Resumo de Acoes para o Implementer

### Arquivos para DELETAR (3 arquivos)
1. `client/src/pages/WeeklyPlanner.tsx`
2. `client/src/components/IntelligentCalendar.tsx`
3. `client/src/components/WeeklyCalendar.tsx`

### Arquivos para EDITAR (6 arquivos, ~12 linhas removidas)
1. **`client/src/App.tsx`** -- remover import (L17) e bloco de rota (L101-105)
2. **`client/src/components/Sidebar.tsx`** -- remover item do menu (L61)
3. **`client/src/components/ProtectedRoute.tsx`** -- remover 2 entradas: pageInfoMap (L72-76) e routeToTag (L144)
4. **`client/src/components/AnalyticsTracker.tsx`** -- remover entrada (L36)
5. **`client/src/components/PermissionTestComponent.tsx`** -- remover entrada (L18)
6. **`server/routes.ts`** -- remover 2 endpoints (L2629-2651) e import `insertWeeklyPlanSchema` (L18)

### Arquivos para NAO TOCAR
- `shared/schema.ts` (tabelas, relacoes, schemas, tipos)
- `server/storage.ts` (metodos de weekly plans)
- `server/routes.ts` funcao `generateWeeklyRoutine` (L143-209)
- Todos endpoints de `/api/planned-tournaments`
- `tests/unit/grade-planner/grade-planner-schemas.test.ts`

## Notas de Implementacao
- Apos remover o import de `FileText` na Sidebar.tsx, verificar se `FileText` e usado por outro item. Se nao for, remover do import de lucide-react.
- O import de `insertWeeklyPlanSchema` no routes.ts (L18) pode estar no mesmo destructuring de outros schemas -- remover apenas esse item do destructuring, nao a linha inteira.
- Verificar se o icon `FileText` importado na Sidebar.tsx e usado por outro item do menu. Pelo codigo analisado, nao parece ser usado em outro lugar da Sidebar, mas confirmar antes de remover.

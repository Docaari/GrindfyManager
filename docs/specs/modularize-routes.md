# Spec: Modularizar server/routes.ts

## Status
Concluida

## Resumo
Quebrar o arquivo monolitico `server/routes.ts` (~6.078 linhas, 162 registros de endpoint) em modulos separados por dominio dentro de `server/routes/`, removendo endpoints de debug/teste e mantendo zero breaking changes na API publica.

## Contexto
O arquivo `server/routes.ts` concentra toda a logica de roteamento da aplicacao em um unico arquivo. Isso dificulta navegacao, code review, e aumenta risco de conflitos em desenvolvimento paralelo. A modularizacao e listada como problema conhecido no CLAUDE.md (item 10.2.1). Alem disso, existem endpoints de debug/teste que devem ser removidos antes de producao.

## Usuarios
- **Desenvolvedores:** Navegam e editam rotas com mais facilidade ao trabalhar em dominios isolados.
- **Usuarios finais:** Nao percebem mudanca alguma (zero breaking changes).

## Requisitos Funcionais

### RF-01: Criar estrutura de modulos em server/routes/
**Descricao:** Criar um diretorio `server/routes/` com um arquivo por dominio. Cada arquivo exporta uma funcao que recebe a instancia do Express e registra suas rotas.
**Regras de negocio:**
- Cada modulo deve exportar uma funcao com assinatura: `export function register<Domain>Routes(app: Express): void` (ou `async` quando necessario, como no caso do modulo Suprema que usa dynamic import).
- O arquivo `server/routes/index.ts` deve ser o orquestrador que importa todos os modulos e os registra na ordem correta.
- A funcao `registerRoutes` em `server/routes.ts` deve ser substituida por `server/routes/index.ts` com a mesma assinatura: `export async function registerRoutes(app: Express): Promise<Server>`.
- O middleware global (helmet, rate-limit, cookie-parser, CSRF) deve permanecer no `server/routes/index.ts` (orquestrador), pois se aplica a todas as rotas.
**Criterio de aceitacao:**
- [ ] Diretorio `server/routes/` existe com os modulos listados no RF-02.
- [ ] `server/routes/index.ts` exporta `registerRoutes` com mesma assinatura da versao atual.
- [ ] O import em `server/index.ts` continua funcionando sem alteracao (ou com ajuste minimo de path de import).
- [ ] Arquivo original `server/routes.ts` e deletado apos migracao completa.

### RF-02: Distribuir endpoints nos modulos corretos
**Descricao:** Cada modulo deve conter os endpoints de seu dominio. A tabela abaixo define a distribuicao exata.

**Modulo `server/routes/auth.ts`** — 16 endpoints:
| Metodo | Rota | Linha atual |
|--------|------|-------------|
| GET | /api/csrf-token | 551 |
| GET | /api/auth/user | 573 |
| POST | /api/auth/register | 584 |
| POST | /api/auth/login | 656 |
| POST | /api/auth/refresh | 789 |
| POST | /api/auth/logout | 816 |
| GET | /api/auth/me | 830 |
| POST | /api/auth/verify-email | 839 |
| POST | /api/auth/resend-verification | 884 |
| POST | /api/auth/forgot-password | 901 |
| POST | /api/auth/reset-password | 933 |
| PATCH | /api/auth/update-profile | 1055 |
| GET | /api/auth/google | 1555 |
| GET | /api/auth/google/callback | 1569 |
| POST | /api/auth/send-verification | 1619 |
| POST | /api/auth/verify-reset-token | 1640 |

Dependencias deste modulo: `AuthService`, `requireAuth`, `OAuthService`, `EmailService`, `authRateLimit` (definido localmente ou passado como parametro), helpers `setAuthCookies`, `clearAuthCookies`, schemas de validacao (`loginSchema`, `registerSchema`, `forgotPasswordSchema`, `resetPasswordSchema`, `verifyEmailSchema`), `storage`, `db`, tabelas (`users`), `nanoid`.

**Modulo `server/routes/dashboard.ts`** — 3 endpoints:
| Metodo | Rota | Linha atual |
|--------|------|-------------|
| GET | /api/dashboard/stats | 1661 |
| GET | /api/dashboard/quick-stats | 1681 |
| GET | /api/dashboard/performance | 1727 |

Dependencias: `requireAuth`, `storage`, helpers `parseFiltersParam`, `mapFiltersToBackendFormat`.

**Modulo `server/routes/analytics.ts`** — 15 endpoints:
| Metodo | Rota | Linha atual |
|--------|------|-------------|
| GET | /api/analytics/dashboard-stats | 1740 |
| GET | /api/analytics/profile-dashboard-stats | 1757 |
| GET | /api/analytics/by-site | 1777 |
| GET | /api/analytics/by-buyin | 1790 |
| GET | /api/analytics/by-category | 1803 |
| GET | /api/analytics/by-day | 1817 |
| GET | /api/analytics/by-speed | 1830 |
| GET | /api/analytics/by-month | 1844 |
| GET | /api/analytics/by-field | 1858 |
| GET | /api/analytics/final-table | 1872 |
| GET | /api/analytics/users | 4477 |
| GET | /api/analytics/features | 4551 |
| GET | /api/analytics/executive | 4598 |
| GET | /api/analytics/activity | 4709 |
| POST | /api/analytics/track | 4784 |

Dependencias: `requireAuth`, `requirePermission`, `storage`, `db`, tabelas (`userActivity`, `analyticsDaily`, `userActivities`, `engagementMetrics`, `tournaments`, `grindSessions`, `users`), operadores Drizzle (`eq`, `and`, `gte`, `lte`, `sql`, `count`, `avg`, `desc`), helpers `parseFiltersParam`, `mapFiltersToBackendFormat`.

**Modulo `server/routes/tournaments.ts`** — 11 endpoints:
| Metodo | Rota | Linha atual |
|--------|------|-------------|
| GET | /api/tournaments | 1897 |
| POST | /api/tournaments/bulk-delete | 1914 |
| POST | /api/tournaments/bulk-delete/preview | 1968 |
| GET | /api/tournaments/sites | 1986 |
| DELETE | /api/tournaments/clear | 1997 |
| POST | /api/tournaments | 2007 |
| PUT | /api/tournaments/:id | 2018 |
| DELETE | /api/tournaments/:id | 2029 |
| GET | /api/tournament-library | 2040 |
| GET | /api/tournament-templates | 2054 |
| POST | /api/tournament-templates | 2064 |

Dependencias: `requireAuth`, `storage`, `db`, tabelas (`tournaments`), operadores Drizzle, schemas (`insertTournamentSchema`, `insertTournamentTemplateSchema`), helpers `parseFiltersParam`, `mapFiltersToBackendFormat`.

**Modulo `server/routes/grade-planner.ts`** — 6 endpoints:
| Metodo | Rota | Linha atual |
|--------|------|-------------|
| GET | /api/planned-tournaments | 2076 |
| GET | /api/tournament-suggestions | 2107 |
| POST | /api/planned-tournaments | 2122 |
| PUT | /api/planned-tournaments/:id | 2139 |
| DELETE | /api/planned-tournaments/:id | 2184 |
| GET | /api/coaching/recommendations | 1886 |

Dependencias: `requireAuth`, `storage`, schemas (`insertPlannedTournamentSchema`).

**Modulo `server/routes/grind-sessions.ts`** — 17 endpoints:
| Metodo | Rota | Linha atual |
|--------|------|-------------|
| GET | /api/grind-sessions | 2210 |
| GET | /api/grind-sessions/history | 2244 |
| GET | /api/grind-sessions/:sessionId/tournaments | 2394 |
| POST | /api/grind-sessions/reset-tournaments | 2501 |
| POST | /api/grind-sessions | 2516 |
| PUT | /api/grind-sessions/:id | 2651 |
| DELETE | /api/grind-sessions/:id | 2662 |
| GET | /api/preparation-logs | 2722 |
| POST | /api/preparation-logs | 2732 |
| GET | /api/break-feedbacks | 3510 |
| POST | /api/break-feedbacks | 3521 |
| GET | /api/session-tournaments | 3551 |
| GET | /api/session-tournaments/by-day/:dayOfWeek | 3566 |
| POST | /api/session-tournaments | 3581 |
| PUT | /api/session-tournaments/:id | 3628 |
| DELETE | /api/session-tournaments/:id | 3684 |
| GET | /api/session-tournaments/weekly-suggestions | 4333 |

Dependencias: `requireAuth`, `storage`, `db`, tabelas (`grindSessions`, `sessionTournaments`), operadores Drizzle, schemas (`insertGrindSessionSchema`, `insertPreparationLogSchema`, `insertBreakFeedbackSchema`, `insertSessionTournamentSchema`), `nanoid`.

**Modulo `server/routes/upload.ts`** — 8 endpoints:
| Metodo | Rota | Linha atual |
|--------|------|-------------|
| POST | /api/upload-history | 2853 |
| POST | /api/check-duplicates | 3185 |
| POST | /api/upload-with-duplicates | 3274 |
| POST | /api/settings/exchange-rates | 3399 |
| GET | /api/settings/exchange-rates | 3420 |
| GET | /api/upload-history | 3433 |
| GET | /api/upload-stats | 3452 |
| DELETE | /api/upload-history/:id | 3493 |

Dependencias: `requireAuth`, `storage`, `multer` (upload middleware com memoryStorage), `PokerCSVParser`, `csv-parser`, `Readable`, `db`, tabelas (`tournaments`, `uploadHistory`), schemas, helpers `isCoinFormat`, `isCoinPokerFormat`, `isBodogFormat`.

**Modulo `server/routes/studies.ts`** — 17 endpoints:
| Metodo | Rota | Linha atual |
|--------|------|-------------|
| GET | /api/study-cards | 3695 |
| POST | /api/study-cards | 3711 |
| GET | /api/study-cards/:id | 3732 |
| PATCH | /api/study-cards/:id | 3751 |
| DELETE | /api/study-cards/:id | 3760 |
| GET | /api/study-cards/:id/materials | 3770 |
| POST | /api/study-cards/:id/materials | 3779 |
| GET | /api/study-cards/:id/notes | 3793 |
| POST | /api/study-cards/:id/notes | 3802 |
| DELETE | /api/study-notes/:id | 3817 |
| DELETE | /api/study-materials/:id | 3826 |
| GET | /api/study-sessions | 3836 |
| POST | /api/study-sessions | 3845 |
| GET | /api/study-correlation/:studyCardId | 3898 |
| POST | /api/study-cards/:id/progress | 3963 |
| GET | /api/study-schedules | 4103 |
| POST | /api/study-schedules | 4113 |

Dependencias: `requireAuth`, `storage`, `db`, tabelas (`studyNotes`, `studyMaterials`, `tournaments`), operadores Drizzle, schemas (`insertStudyCardSchema`, `insertStudyMaterialSchema`, `insertStudyNoteSchema`, `insertStudySessionSchema`, `insertStudyScheduleSchema`).

**Modulo `server/routes/calendar.ts`** — 12 endpoints:
| Metodo | Rota | Linha atual |
|--------|------|-------------|
| GET | /api/active-days | 3859 |
| POST | /api/active-days/toggle | 3875 |
| GET | /api/weekly-routine | 3991 |
| POST | /api/weekly-routine/generate | 4007 |
| GET | /api/calendar-categories | 4129 |
| POST | /api/calendar-categories | 4162 |
| PUT | /api/calendar-categories/:id | 4177 |
| DELETE | /api/calendar-categories/:id | 4189 |
| GET | /api/calendar-events | 4200 |
| POST | /api/calendar-events | 4216 |
| PUT | /api/calendar-events/:id | 4283 |
| DELETE | /api/calendar-events/:id | 4310 |

Dependencias: `requireAuth`, `storage`, `db`, tabelas (`calendarEvents`), schemas (`insertActiveDaySchema`, `insertWeeklyRoutineSchema`, `insertCalendarCategorySchema`, `insertCalendarEventSchema`), funcao `generateWeeklyRoutine` (helper grande, ~200 linhas, com sub-helpers `createTimestamp`, `validateTimestamp`, `addHours`, `addMinutes`).

**Modulo `server/routes/admin.ts`** — 20 endpoints:
| Metodo | Rota | Linha atual |
|--------|------|-------------|
| GET | /api/admin/users | 1176 |
| POST | /api/admin/users | 1218 |
| PUT | /api/admin/users/:id | 1290 |
| DELETE | /api/admin/users/:id | 1375 |
| PATCH | /api/admin/users/:id/status | 1495 |
| GET | /api/admin/access-logs | 1515 |
| GET | /api/admin/dashboard-stats | 4810 |
| GET | /api/admin/permission-profiles | 4889 |
| POST | /api/admin/apply-permissions-batch | 4943 |
| GET | /api/admin/monitoring | 5027 |
| GET | /api/admin/subscriptions | 5319 |
| GET | /api/admin/subscription-stats | 5508 |
| GET | /api/admin/subscription-details | 5541 |
| POST | /api/admin/extend-subscription | 5567 |
| POST | /api/admin/update-subscription-plan | 5678 |
| GET | /api/admin/subscription-history | 5707 |
| POST | /api/admin/renew-subscription | 5743 |
| GET | /api/admin/billing-reports | 5780 |
| GET | /api/admin/data-metrics | 5851 |
| DELETE | /api/admin/data-cleanup/:userPlatformId/:category | 5971 |

Dependencias: `requireAuth`, `requirePermission('admin_full')`, `storage`, `AuthService`, `db`, tabelas (`users`, `permissions`, `userPermissions`, `accessLogs`, `tournaments`, `grindSessions`, `sessionTournaments`, `userSubscriptions`, `subscriptionPlans`, `uploadHistory`, `bugReports`), operadores Drizzle, schemas (`createUserSchema`, `updateUserSchema`), `nanoid`, helper `removeUserPermissions`.

**Modulo `server/routes/subscriptions.ts`** — 11 endpoints:
| Metodo | Rota | Linha atual |
|--------|------|-------------|
| GET | /api/subscription/status | 1082 |
| POST | /api/subscription/create | 1097 |
| GET | /api/subscription/history | 1119 |
| GET | /api/subscription/feature/:feature | 1129 |
| POST | /api/subscription/engagement | 1144 |
| GET | /api/subscription-plans | 5143 |
| GET | /api/subscriptions/current | 5153 |
| POST | /api/subscriptions | 5184 |
| PUT | /api/subscriptions/:id | 5226 |
| DELETE | /api/subscriptions/:id | 5251 |
| POST | /api/subscriptions/check-expiration | 5278 |

Dependencias: `requireAuth`, `requirePermission`, `subscriptionService`, `storage`, `db`, tabelas (`userSubscriptions`, `subscriptionPlans`, `users`), operadores Drizzle, helper `removeUserPermissions`.

**Modulo `server/routes/notifications.ts`** — 4 endpoints:
| Metodo | Rota | Linha atual |
|--------|------|-------------|
| GET | /api/notifications | 5401 |
| GET | /api/notifications/unread-count | 5411 |
| POST | /api/notifications/:id/mark-read | 5421 |
| POST | /api/notifications | 5431 |

Dependencias: `requireAuth`, `NotificationService`.

**Modulo `server/routes/bug-reports.ts`** — 7 endpoints:
| Metodo | Rota | Linha atual |
|--------|------|-------------|
| POST | /api/bug-reports | 4381 |
| GET | /api/bug-reports | 4396 |
| GET | /api/bug-reports/my | 4406 |
| GET | /api/bug-reports/stats | 4416 |
| GET | /api/bug-reports/:id | 4426 |
| PUT | /api/bug-reports/:id | 4448 |
| DELETE | /api/bug-reports/:id | 4459 |

Dependencias: `requireAuth`, `requirePermission('admin_full')`, `storage`, schemas (`insertBugReportSchema`).

**Modulo `server/routes/misc.ts`** — 12 endpoints:
| Metodo | Rota | Linha atual |
|--------|------|-------------|
| GET | /api/email-templates/:type | 2744 |
| GET | /api/custom-groups | 2772 |
| POST | /api/custom-groups | 2782 |
| GET | /api/coaching-insights | 2794 |
| POST | /api/coaching-insights | 2804 |
| PUT | /api/coaching-insights/:id | 2815 |
| GET | /api/user-settings | 2827 |
| POST | /api/user-settings | 2837 |
| GET | /api/user/stats | 5452 |
| GET | /api/profile-states | 5604 |
| PUT | /api/profile-states/:dayOfWeek | 5621 |
| POST | /api/webhooks/payment | 5844 |

Nota: Este modulo pode ser subdividido futuramente. Por ora, agrupa endpoints de user-settings, custom-groups, coaching-insights, email-templates, profile-states, webhooks e user stats.

Dependencias: `requireAuth`, `requirePermission`, `storage`, `db`, `EmailService`, tabelas (`profileStates`), schemas (`insertCustomGroupSchema`, `insertCoachingInsightSchema`, `insertUserSettingsSchema`, `insertProfileStateSchema`).

**Modulo `server/routes/suprema.ts`** — 1 endpoint:
| Metodo | Rota | Linha atual |
|--------|------|-------------|
| GET | /api/suprema/tournaments | 6057 |

Dependencias: `requireAuth`, dynamic imports de `./supremaCache` e `./supremaService`. A funcao de registro deve ser `async` por causa do dynamic import.

**Criterio de aceitacao:**
- [ ] Cada modulo contem exatamente os endpoints listados acima.
- [ ] Nenhum endpoint da API publica foi omitido ou alterado.
- [ ] A soma de endpoints em todos os modulos (apos remocao dos de debug/teste) e igual a 160.

### RF-03: Extrair helper functions para server/routes/helpers.ts
**Descricao:** As funcoes auxiliares definidas no topo de `server/routes.ts` (fora do `registerRoutes`) devem ser extraidas para um arquivo de helpers compartilhado entre os modulos.
**Funcoes a extrair para `server/routes/helpers.ts` (usadas por multiplos modulos):**
- `parseFiltersParam(raw)` — linha 81 — usada por dashboard, analytics, tournaments
- `mapFiltersToBackendFormat(frontendFilters)` — linha 91 — usada por dashboard, analytics, tournaments
- `removeUserPermissions(userId)` — linha 5392 — usada por admin e subscriptions

**Funcoes a extrair para o modulo `server/routes/calendar.ts` (ou arquivo auxiliar `server/routes/calendar-helpers.ts`):**
- `createTimestamp(weekStart, dayOfWeek, timeString)` — linha 113
- `validateTimestamp(timestamp, context)` — linha 140
- `generateWeeklyRoutine(userId, weekStart)` — linha 153 (~200 linhas)
- `addHours(timeString, hours)` — linha 371
- `addMinutes(timeString, minutes)` — linha 384

**Funcoes a manter no modulo `server/routes/upload.ts`:**
- `isCoinFormat(fileContent)` — linha 403
- `isCoinPokerFormat(fileContent)` — linha 413
- `isBodogFormat(filename)` — linha 434

**Funcoes a manter no modulo `server/routes/auth.ts`:**
- `setAuthCookies(res, accessToken, refreshToken)` — linha 439
- `clearAuthCookies(res)` — linha 457

**Regras de negocio:**
- Cada funcao deve ser exportada individualmente com `export function`.
- Helpers especificos de um unico dominio ficam no proprio modulo.
- Helpers usados por multiplos modulos ficam no `helpers.ts`.
**Criterio de aceitacao:**
- [ ] Arquivo `server/routes/helpers.ts` existe com as funcoes compartilhadas.
- [ ] Nenhuma funcao duplicada entre modulos.
- [ ] Todos os modulos importam helpers de `./helpers` ou do proprio modulo.

### RF-04: Remover endpoints de debug e teste
**Descricao:** Os seguintes endpoints devem ser removidos durante a modularizacao. Eles NAO devem ser incluidos em nenhum modulo.

**Endpoints a remover:**
| Metodo | Rota | Linha atual | Motivo |
|--------|------|-------------|--------|
| POST | /api/test/email | 971 | Endpoint de teste de email (admin debug) |
| GET | /api/test/next-user-id | 1027 | Endpoint de teste de geracao de ID (admin debug) |

**Nota sobre endpoints de debug mencionados no CLAUDE.md:**
O CLAUDE.md lista `GET /api/debug-user`, `POST /api/debug-upload-security`, e `GET /api/debug/date-range` como endpoints de debug para remocao. Porem, estes endpoints NAO existem mais no codigo atual de `server/routes.ts` (ja foram removidos em refatoracao anterior). Portanto, nao ha acao necessaria para eles.

**Criterio de aceitacao:**
- [ ] Os 2 endpoints de `/api/test/*` nao existem em nenhum modulo.
- [ ] Nenhum endpoint com prefixo `/api/debug` ou `/api/test` existe no codigo final.

### RF-05: Criar orquestrador server/routes/index.ts
**Descricao:** O arquivo orquestrador substitui `server/routes.ts` como ponto de entrada do roteamento.
**Regras de negocio:**
- Deve manter a configuracao de middleware global que existe hoje no inicio de `registerRoutes`:
  - `cookieParser()` — linha 464
  - `helmet(...)` com configuracao CSP completa — linhas 470-491
  - `authRateLimit` (definicao do rate limiter) — linhas 494-506. O rate limiter e passado como segundo parametro para o modulo auth, ou definido dentro do proprio modulo auth.
  - `csrfProtection` middleware — linhas 521-546, aplicado com `app.use('/api', csrfProtection)`
  - `setupSubscriptionProcessing()` — referenciado no import de subscriptionMiddleware
- Deve chamar cada modulo de rota na seguinte ordem (para garantir que rotas mais especificas sejam registradas antes de rotas com parametros):
  1. auth (inclui csrf-token)
  2. admin
  3. dashboard
  4. analytics
  5. tournaments
  6. grade-planner
  7. grind-sessions
  8. upload
  9. studies
  10. calendar
  11. subscriptions
  12. notifications
  13. bug-reports
  14. misc
  15. suprema (async — deve usar `await`)
- Deve retornar `httpServer` criado com `createServer(app)` — igual ao comportamento atual.
**Criterio de aceitacao:**
- [ ] Middleware global e aplicado antes de qualquer rota.
- [ ] Todos os 15 modulos sao registrados.
- [ ] A funcao retorna `Server` (httpServer).
- [ ] O import em `server/index.ts` funciona (atualizar path se necessario: de `./routes` para `./routes/index`).

## Requisitos Nao-Funcionais
- **Zero breaking changes:** Nenhuma rota publica deve mudar de path, metodo, middleware ou comportamento.
- **Zero alteracao de logica:** O corpo de cada handler deve ser copiado LITERALMENTE para o novo modulo. Nao corrigir bugs, nao refatorar logica, nao alterar mensagens de erro.
- **Testabilidade:** Apos a migracao, todos os 1142+ testes existentes devem continuar passando sem alteracao.
- **Performance:** A modularizacao nao deve impactar performance — e apenas reorganizacao de codigo, sem mudanca em runtime.

## Modelos de Dados Afetados
Nenhum. Esta spec nao altera schema, tabelas ou queries.

## Integracoes Externas
Nenhuma nova. As integracoes existentes (SMTP, OAuth Google, Suprema Poker, Stripe webhook) apenas mudam de arquivo.

## Cenarios de Teste Derivados

### Happy Path
- [ ] Servidor inicia sem erros apos modularizacao.
- [ ] Todos os 1142+ testes unitarios existentes passam sem alteracao.
- [ ] Cada grupo de endpoints responde identicamente (mesmo status code, mesmo body) antes e depois da migracao.

### Validacao de Estrutura
- [ ] `server/routes/` contem exatamente 17 arquivos: `index.ts`, `helpers.ts`, `auth.ts`, `dashboard.ts`, `analytics.ts`, `tournaments.ts`, `grade-planner.ts`, `grind-sessions.ts`, `upload.ts`, `studies.ts`, `calendar.ts`, `admin.ts`, `subscriptions.ts`, `notifications.ts`, `bug-reports.ts`, `misc.ts`, `suprema.ts`.
- [ ] `server/routes.ts` (arquivo original) foi deletado.
- [ ] Nenhum arquivo em `server/routes/` importa de `../routes.ts` (referencia circular).

### Endpoints Removidos
- [ ] `POST /api/test/email` retorna 404.
- [ ] `GET /api/test/next-user-id` retorna 404.

### Regressao de Middleware
- [ ] CSRF protection continua ativo em endpoints POST/PUT/DELETE.
- [ ] Rate limiting continua ativo em endpoints de auth (register, login).
- [ ] Helmet headers presentes em todas as respostas.
- [ ] requireAuth rejeita requests sem token em endpoints protegidos.
- [ ] requirePermission rejeita requests sem permissao em endpoints admin.

### Edge Cases
- [ ] Rotas com parametros (`:id`, `:sessionId`, `:dayOfWeek`, `:studyCardId`, `:userPlatformId`, `:category`, `:feature`, `:type`) continuam resolvendo corretamente.
- [ ] Upload com `multer` middleware continua funcionando (encadeamento de middlewares no modulo upload).
- [ ] Dynamic import de Suprema (`await import(...)`) funciona no modulo async.

## Fora de Escopo
- Nao refatorar a logica interna de nenhum endpoint.
- Nao alterar `server/storage.ts`, `server/auth.ts`, `server/db.ts` ou qualquer outro arquivo do server fora de `routes.ts`.
- Nao alterar schemas em `shared/schema.ts`.
- Nao criar routers Express (`express.Router()`) — usar registro direto no `app` passado como parametro. Isso mantem compatibilidade exata com o padrao atual.
- Nao consolidar ou renomear endpoints (ex: nao unificar `/api/subscription/*` com `/api/subscriptions/*`).
- Nao adicionar tipagem mais estrita nos handlers (ex: nao trocar `req: any` por tipos proprios).
- Nao adicionar ou remover middlewares.
- Nao implementar Express Router com prefixo (evita mudanca de semantica no path matching).

## Dependencias
Nenhuma dependencia externa. Esta spec usa apenas reorganizacao de arquivos TypeScript existentes.

## Notas de Implementacao

### Estrategia de migracao sugerida
1. Criar `server/routes/helpers.ts` com as funcoes auxiliares compartilhadas.
2. Criar cada modulo de rota um por um, copiando o codigo literal dos handlers.
3. Criar `server/routes/index.ts` que importa todos os modulos e configura middleware global.
4. Atualizar o import em `server/index.ts` (de `./routes` para `./routes/index` se necessario).
5. Rodar todos os testes existentes para validar.
6. Deletar `server/routes.ts` original.

### Sobre a passagem de dependencias
Cada modulo de rota recebe `app: Express` como parametro. As dependencias internas (storage, db, services) sao importadas diretamente dentro de cada modulo via import statements. O `authRateLimit` deve ser definido no `index.ts` e passado como segundo parametro para o modulo auth, ou definido dentro do proprio modulo auth (preferencia do implementador, desde que o comportamento seja identico).

### Contagem final de endpoints
- Total atual no routes.ts: 162 registros de endpoint
- Endpoints removidos: 2 (test/email, test/next-user-id)
- Endpoints finais: 160, distribuidos em 15 modulos de dominio

### Estrutura de arquivos resultante
```
server/routes/
  index.ts              # Orquestrador: middleware global + registro de modulos
  helpers.ts            # parseFiltersParam, mapFiltersToBackendFormat, removeUserPermissions
  auth.ts               # 16 endpoints — /api/auth/*, /api/csrf-token
  admin.ts              # 20 endpoints — /api/admin/*
  dashboard.ts          #  3 endpoints — /api/dashboard/*
  analytics.ts          # 15 endpoints — /api/analytics/*
  tournaments.ts        # 11 endpoints — /api/tournaments*, /api/tournament-library, /api/tournament-templates
  grade-planner.ts      #  6 endpoints — /api/planned-tournaments*, /api/tournament-suggestions, /api/coaching/recommendations
  grind-sessions.ts     # 17 endpoints — /api/grind-sessions*, /api/preparation-logs*, /api/break-feedbacks*, /api/session-tournaments*
  upload.ts             #  8 endpoints — /api/upload-history*, /api/upload-stats, /api/check-duplicates, /api/upload-with-duplicates, /api/settings/exchange-rates
  studies.ts            # 17 endpoints — /api/study-cards*, /api/study-notes*, /api/study-materials*, /api/study-sessions*, /api/study-correlation*, /api/study-schedules*
  calendar.ts           # 12 endpoints — /api/active-days*, /api/weekly-routine*, /api/calendar-categories*, /api/calendar-events*
  subscriptions.ts      # 11 endpoints — /api/subscription/*, /api/subscription-plans, /api/subscriptions/*
  notifications.ts      #  4 endpoints — /api/notifications/*
  bug-reports.ts        #  7 endpoints — /api/bug-reports/*
  misc.ts               # 12 endpoints — /api/email-templates*, /api/custom-groups*, /api/coaching-insights*, /api/user-settings*, /api/user/stats, /api/profile-states*, /api/webhooks/payment
  suprema.ts            #  1 endpoint  — /api/suprema/tournaments
```

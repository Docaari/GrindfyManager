# CLAUDE.md — Grindfy Manager

## 1. Visao Geral do Projeto

**Grindfy** e uma plataforma SaaS de gestao e analise de performance para jogadores profissionais de poker (MTT - Multi-Table Tournaments). O sistema permite importar historicos de torneios de multiplas redes de poker, analisar performance via dashboard analitico, planejar grades semanais de torneios, acompanhar sessoes de grind em tempo real, estudar estrategia e receber coaching baseado em dados.

- **Publico-alvo:** Jogadores profissionais e semi-profissionais de poker online (MTT)
- **Repositorio:** https://github.com/Docaari/GrindfyManager.git
- **Origem:** Projeto importado do Replit, em processo de organizacao para deploy independente
- **Idioma da UI:** Portugues (Brasil)

### Modulos Principais (PRD)

| Setor | Nome | Descricao |
|-------|------|-----------|
| 1 | Analise de Dados | Upload de historicos, Dashboard de performance, Biblioteca de torneios |
| 2 | Assistente de Grind | Grade semanal, Warm-up (preparacao mental), Grind em tempo real |
| 3 | Grade Coach (futuro) | Analise preditiva com IA, sugestoes personalizadas |
| 4 | Relatorios Avancados (futuro) | Analises comparativas, exportacao de dados |

---

## 2. Stack Tecnologica

### Frontend
| Tecnologia | Versao | Uso |
|-----------|--------|-----|
| React | ^18.3.1 | Framework UI |
| TypeScript | 5.6.3 | Tipagem estatica |
| Vite | ^5.4.19 | Build tool e dev server |
| Wouter | ^3.3.5 | Roteamento client-side |
| TanStack React Query | ^5.60.5 | Gerenciamento de estado servidor |
| Tailwind CSS | ^3.4.17 | Estilizacao |
| Radix UI | ^1.x–^2.x | Componentes primitivos (dialog, select, tabs, toast, etc.) |
| shadcn/ui | via Radix + CVA | Sistema de componentes |
| Recharts | ^2.15.4 | Graficos e visualizacoes |
| Framer Motion | ^11.13.1 | Animacoes |
| React Hook Form | ^7.55.0 | Formularios |
| Zod | ^3.24.2 | Validacao de schemas |
| Lucide React | ^0.453.0 | Icones |
| date-fns | ^3.6.0 | Manipulacao de datas |
| react-beautiful-dnd | ^13.1.1 | Drag and drop |
| xlsx | ^0.18.5 | Leitura de arquivos Excel |
| cmdk | ^1.1.1 | Command palette |
| embla-carousel-react | ^8.6.0 | Carousel |
| react-resizable-panels | ^2.1.7 | Paineis redimensionaveis |

### Backend
| Tecnologia | Versao | Uso |
|-----------|--------|-----|
| Node.js | 20.x | Runtime |
| Express | ^4.21.2 | Servidor HTTP |
| TypeScript | 5.6.3 | Tipagem estatica |
| Drizzle ORM | ^0.39.1 | ORM type-safe |
| Drizzle Kit | ^0.30.4 | Migracoes e schema push |
| pg (node-postgres) | ^8.19.0 | Driver PostgreSQL |
| @neondatabase/serverless | ^0.10.4 | Driver Neon (producao) |
| bcryptjs | ^3.0.2 | Hash de senhas |
| jsonwebtoken | ^9.0.2 | Autenticacao JWT |
| multer | ^2.0.1 | Upload de arquivos |
| csv-parser | ^3.2.0 | Parsing de CSV |
| nodemailer | ^7.0.5 | Envio de emails |
| express-rate-limit | ^7.5.1 | Rate limiting |
| helmet | ^8.1.0 | Seguranca HTTP headers |
| express-session | ^1.18.1 | Sessoes |
| passport | ^0.7.0 | Autenticacao (legado Replit Auth) |
| stripe | ^18.3.0 | Pagamentos (preparado) |
| nanoid | ^5.1.5 | Geracao de IDs |
| memoizee | ^0.4.17 | Cache/memoizacao |
| ws | ^8.18.0 | WebSockets |
| openid-client | ^6.6.2 | OAuth/OpenID Connect |

### Build & Dev
| Tecnologia | Versao | Uso |
|-----------|--------|-----|
| esbuild | ^0.25.0 | Bundle do servidor para producao |
| tsx | ^4.19.1 | Execucao de TypeScript em dev |
| cross-env | ^10.1.0 | Variaveis de ambiente cross-platform |
| autoprefixer | ^10.4.20 | PostCSS |
| postcss | ^8.4.47 | Processamento CSS |

### Banco de Dados
| Tecnologia | Uso |
|-----------|-----|
| PostgreSQL 16 | Banco de dados principal |
| Neon Serverless | Hosting do banco em producao |

---

## 3. Estrutura de Diretorios

```
grindfy/
├── client/                     # Frontend React
│   └── src/
│       ├── App.tsx             # Componente raiz com rotas (Wouter)
│       ├── main.tsx            # Entry point React
│       ├── index.css           # Estilos globais Tailwind
│       ├── pages/              # Paginas da aplicacao
│       │   ├── Dashboard.tsx           # Dashboard principal de performance
│       │   ├── TournamentLibrary.tsx   # Biblioteca de torneios
│       │   ├── TournamentLibraryNew.tsx# Versao nova da biblioteca
│       │   ├── GradePlanner.tsx        # Planejador de grade semanal
│       │   ├── GradeCoach.tsx          # Coach de grade com sugestoes
│       │   ├── GrindSession.tsx        # Sessao de grind (dashboard)
│       │   ├── GrindSessionLive.tsx    # Sessao de grind em tempo real
│       │   ├── SessionHistory.tsx      # Historico de sessoes
│       │   ├── MentalPrep.tsx          # Preparacao mental / warm-up
│       │   ├── WeeklyPlanner.tsx       # Planejador semanal
│       │   ├── Estudos.tsx             # Pagina de estudos
│       │   ├── Studies.tsx             # Pagina de estudos (alternativa)
│       │   ├── Calculadoras.tsx        # Calculadoras de poker
│       │   ├── Settings.tsx            # Configuracoes do usuario
│       │   ├── Analytics.tsx           # Analytics avancado
│       │   ├── UploadHistory.tsx       # Historico de uploads
│       │   ├── Home.tsx                # Pagina home pos-login
│       │   ├── Landing.tsx             # Landing page publica
│       │   ├── Login.tsx / LoginPage.tsx             # Login
│       │   ├── Register.tsx / RegisterPage.tsx       # Registro
│       │   ├── ForgotPassword.tsx / ForgotPasswordPage.tsx  # Recuperar senha
│       │   ├── ResetPassword.tsx / ResetPasswordPage.tsx    # Resetar senha
│       │   ├── VerifyEmailPage.tsx     # Verificacao de email
│       │   ├── RegistrationConfirmationPage.tsx  # Confirmacao de registro
│       │   ├── AdminUsers.tsx          # Admin: gestao de usuarios
│       │   ├── AdminDashboard.tsx      # Admin: dashboard
│       │   ├── AdminBugs.tsx           # Admin: gestao de bug reports
│       │   ├── Subscriptions.tsx       # Gestao de assinaturas
│       │   ├── SubscriptionDemo.tsx    # Demo de assinaturas
│       │   ├── not-found.tsx           # Pagina 404
│       │   ├── Dashboard_backup.tsx            # [BACKUP] - deve ser removido
│       │   ├── GradePlanner.tsx.backup         # [BACKUP] - deve ser removido
│       │   ├── SessionHistory_backup.tsx       # [BACKUP] - deve ser removido
│       │   ├── SessionHistory_original.tsx     # [BACKUP] - deve ser removido
│       │   └── GrideCoach.tsx                  # [DUPLICATA com typo] - deve ser removido
│       ├── components/         # Componentes reutilizaveis
│       │   ├── Sidebar.tsx             # Sidebar principal de navegacao
│       │   ├── DashboardFilters.tsx    # Filtros do dashboard
│       │   ├── DynamicCharts.tsx       # Graficos dinamicos (recharts)
│       │   ├── FileUpload.tsx          # Upload de arquivos CSV/XLSX
│       │   ├── AutoUpload.tsx          # Upload automatizado
│       │   ├── BreakFeedbackPopup.tsx  # Popup de feedback de break
│       │   ├── BreakHistoryPopup.tsx   # Historico de breaks
│       │   ├── BugReportModal.tsx      # Modal de reporte de bugs
│       │   ├── ImprovementSuggestionModal.tsx  # Modal de sugestao de melhorias
│       │   ├── IntelligentCalendar.tsx # Calendario inteligente
│       │   ├── AdvancedCalendar.tsx    # Calendario avancado
│       │   ├── AnalyticsCharts.tsx     # Graficos de analytics
│       │   ├── AnalyticsTracker.tsx    # Tracker de analytics
│       │   ├── DataMonitoring.tsx      # Monitoramento de dados (admin)
│       │   ├── MentalSlider.tsx        # Slider de estado mental
│       │   ├── MetricsCard.tsx         # Card de metricas
│       │   ├── MultiSelect.tsx         # Multi-select
│       │   ├── FilterPopup.tsx         # Popup de filtros
│       │   ├── EditUserModal.tsx       # Modal de edicao de usuario
│       │   ├── DeleteUserModal.tsx     # Modal de exclusao de usuario
│       │   ├── EditItemModal.tsx       # Modal generico de edicao
│       │   ├── ApproveItemModal.tsx    # Modal de aprovacao
│       │   ├── HumanizedDate.tsx       # Componente de data humanizada
│       │   ├── InputField.tsx          # Campo de input
│       │   ├── DynamicCharts.tsx.backup  # [BACKUP] - deve ser removido
│       │   ├── EditUserModalEmpty.tsx    # [VARIANTE] - provavelmente nao usado
│       │   ├── EditUserModalFixed.tsx    # [VARIANTE] - provavelmente nao usado
│       │   ├── EditUserModalSimple.tsx   # [VARIANTE] - provavelmente nao usado
│       │   └── FilterPopupSimple.tsx     # [VARIANTE] - provavelmente nao usado
│       ├── contexts/           # Contextos React
│       │   ├── AuthContext.tsx         # Contexto de autenticacao (JWT)
│       │   ├── NotificationContext.tsx # Contexto de notificacoes
│       │   └── SidebarContext.tsx      # Contexto do sidebar
│       ├── hooks/              # Hooks customizados
│       │   ├── useAuth.tsx             # Hook de autenticacao
│       │   ├── usePermission.ts        # Hook de permissoes
│       │   ├── useActivityTracker.ts   # Hook de rastreamento de atividade
│       │   ├── useProfileStates.ts     # Hook de estados de perfil
│       │   ├── useRegisterSessionForm.ts      # Hook do form de sessao
│       │   ├── useRegisterSessionValidation.ts # Hook de validacao de sessao
│       │   ├── use-mobile.tsx          # Hook de deteccao mobile
│       │   └── use-toast.ts            # Hook de toast notifications
│       ├── lib/                # Utilitarios
│       │   ├── authUtils.ts            # Utilitarios de autenticacao
│       │   ├── chartColors.ts          # Paleta de cores dos graficos
│       │   ├── permissions.ts          # Constantes de permissoes
│       │   ├── queryClient.ts          # Configuracao do React Query
│       │   └── utils.ts               # Utilitarios gerais (cn, etc.)
│       └── types/
│           └── index.ts                # Tipos TypeScript do frontend
├── server/                     # Backend Express
│   ├── index.ts                # Entry point do servidor (porta 5000)
│   ├── routes.ts               # Todas as rotas da API (~7000 linhas, 173 endpoints)
│   ├── storage.ts              # Camada de acesso a dados (Drizzle queries)
│   ├── db.ts                   # Configuracao do pool PostgreSQL
│   ├── auth.ts                 # Servico de autenticacao JWT + middleware
│   ├── csvParser.ts            # Parser inteligente de CSV de poker (multi-rede)
│   ├── emailService.ts         # Servico de envio de emails (Nodemailer)
│   ├── oauth.ts                # Servico OAuth (Google)
│   ├── subscriptionService.ts  # Servico de assinaturas
│   ├── subscriptionMiddleware.ts # Middleware de assinaturas
│   ├── notificationService.ts  # Servico de notificacoes
│   ├── vite.ts                 # Integracao Vite dev server
│   └── vite.ts                 # Integracao Vite dev server
├── shared/                     # Codigo compartilhado entre client e server
│   ├── schema.ts               # Schema Drizzle ORM (~1288 linhas) + Zod schemas + tipos
│   └── permissions.ts          # Definicoes de permissoes
├── migrations/                 # Migracoes Drizzle Kit
│   ├── 0000_mature_gladiator.sql  # Migracao inicial
│   └── meta/                      # Metadados das migracoes
├── docs/                       # Documentacao do projeto
│   ├── architecture/           # Diagramas C4, data-model, fluxos, ADRs (Mermaid)
│   ├── api/                    # Documentacao de endpoints
│   ├── prd/                    # Product Requirements Documents
│   ├── deploy/                 # Instrucoes de deploy (Render, etc.)
│   ├── migrations/             # Documentacao de migracoes e reconstrucoes
│   ├── reports/                # Relatorios de auditoria e validacao
│   └── specs/                  # Especificacoes de features (PM-Spec)
├── tests/                      # Testes automatizados (Vitest)
│   ├── unit/                   # Testes unitarios
│   │   ├── auth/               # Auth: service, middleware, schemas, email (89 testes)
│   │   ├── upload/             # Upload: csv-parser, schemas (78 testes)
│   │   ├── grind-session/      # Grind: schemas de sessao e torneios (95 testes)
│   │   ├── grade-planner/      # Grade: schemas de planejamento (77 testes)
│   │   └── dashboard/          # Dashboard: schemas, filtros, metricas (118 testes)
│   └── fixtures/               # CSVs de teste para parser multi-rede (14 arquivos)
├── attached_assets/            # Assets importados (imagens, PRDs, prompts do Replit)
├── dist/                       # Build de producao (gerado)
├── node_modules/               # Dependencias (gerado)
├── vitest.config.ts            # Configuracao do Vitest (test runner)
├── drizzle.config.ts           # Configuracao do Drizzle Kit
├── vite.config.ts              # Configuracao do Vite
├── tailwind.config.ts          # Configuracao do Tailwind CSS
├── tsconfig.json               # Configuracao TypeScript
├── postcss.config.js           # Configuracao PostCSS
├── components.json             # Configuracao shadcn/ui
├── package.json                # Dependencias e scripts
└── package-lock.json           # Lockfile
```

---

## 4. Variaveis de Ambiente

Arquivo `.env` na raiz do projeto:

| Variavel | Descricao | Exemplo |
|----------|-----------|---------|
| `DATABASE_URL` | Connection string PostgreSQL | `postgresql://user:pass@host:5433/dbname` |
| `JWT_SECRET` | Chave secreta para tokens JWT de acesso | string segura |
| `JWT_REFRESH_SECRET` | Chave secreta para refresh tokens JWT | string segura |
| `PORT` | Porta do servidor (padrao: 3000) | `3000` |
| `SMTP_HOST` | Host do servidor SMTP | `smtp.gmail.com` |
| `SMTP_PORT` | Porta do servidor SMTP (padrao: 587) | `587` |
| `SMTP_USER` | Usuario SMTP para autenticacao | `admin@grindfyapp.com` |
| `SMTP_PASS` | Senha/App Password SMTP | string segura |
| `SMTP_FROM_NAME` | Nome exibido no remetente (padrao: Grindfy) | `Grindfy` |
| `SMTP_FROM_ADDRESS` | Endereco do remetente (padrao: SMTP_USER) | `admin@grindfyapp.com` |

**Variaveis possivelmente necessarias em producao (referenciadas no codigo mas nao no .env atual):**

| Variavel | Descricao | Referencia |
|----------|-----------|------------|
| `BASE_URL` | URL base para links em emails (producao) | `https://app.grindfy.com` |
| `REPL_ID` | ID do Replit (legado, condicional no vite.config.ts) | vite.config.ts:13 |
| `GOOGLE_CLIENT_ID` | OAuth Google | server/oauth.ts |
| `GOOGLE_CLIENT_SECRET` | OAuth Google | server/oauth.ts |
| `STRIPE_SECRET_KEY` | Stripe para pagamentos | server/routes.ts (webhook) |

---

## 5. Scripts Disponiveis

| Script | Comando | Descricao |
|--------|---------|-----------|
| `dev` | `cross-env NODE_ENV=development tsx --env-file=.env server/index.ts` | Inicia servidor dev com Vite HMR na porta 3000 |
| `build` | `vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist` | Build de producao: frontend (Vite) + backend (esbuild) |
| `start` | `NODE_ENV=production node dist/index.js` | Inicia servidor de producao |
| `check` | `tsc` | Type-check sem emitir arquivos |
| `db:push` | `node --env-file=.env node_modules/drizzle-kit/bin.cjs push` | Push do schema Drizzle para o banco (sem migracao) |

**Nota:** O servidor roda na porta **3000** por padrao (configuravel via `PORT` no .env), servindo API e frontend na mesma porta.

---

## 6. Modelos de Dados (Drizzle Schema)

Schema definido em `shared/schema.ts`. Todas as tabelas usam `varchar` como primary key com IDs gerados via `nanoid`.

### Tabelas Principais

| Tabela | Descricao | Campos-chave |
|--------|-----------|--------------|
| `users` | Usuarios do sistema | id, userPlatformId (USER-XXXX), email, password, role, status, subscriptionPlan, emailVerified |
| `sessions` | Sessoes Express (connect-pg-simple) | sid, sess (jsonb), expire |
| `tournaments` | Torneios importados do historico | userId, name, buyIn, prize, position, site, format, category, speed, fieldSize, datePlayed |
| `tournament_templates` | Templates agrupados da biblioteca | userId, name, site, format, category, avgBuyIn, avgRoi, totalPlayed |
| `planned_tournaments` | Torneios planejados na grade | userId, dayOfWeek, profile (A/B/C), site, time, buyIn, type, speed, status |
| `weekly_plans` | Planos semanais | userId, weekStart, targetBuyins, targetProfit, targetVolume |
| `grind_sessions` | Sessoes de grind | userId, date, status (planned/active/completed), profitLoss, duration, metricas mentais |
| `session_tournaments` | Torneios de uma sessao de grind em tempo real | sessionId, site, buyIn, result, position, bounty, prize, status |
| `break_feedbacks` | Feedback durante breaks | sessionId, foco, energia, confianca, inteligenciaEmocional, interferencias |
| `preparation_logs` | Logs de preparacao mental | sessionId, mentalState, focusLevel, confidenceLevel, exercisesCompleted |

### Tabelas de Estudo

| Tabela | Descricao |
|--------|-----------|
| `study_cards` | Cards de estudo com topicos de poker (3bet, ICM, etc.) |
| `study_materials` | Materiais de estudo (video, artigo, pdf) |
| `study_notes` | Notas de estudo |
| `study_sessions` | Sessoes de estudo com duracao e scores |
| `study_schedules` | Agendamentos de estudo |

### Tabelas de Calendario

| Tabela | Descricao |
|--------|-----------|
| `calendar_categories` | Categorias customizaveis de eventos |
| `calendar_events` | Eventos do calendario com recorrencia |
| `weekly_routines` | Rotinas semanais auto-geradas |
| `active_days` | Dias ativos na grade (por usuario) |
| `profile_states` | Perfil ativo por dia (A, B ou C) |

### Tabelas de Admin/Sistema

| Tabela | Descricao |
|--------|-----------|
| `permissions` | Permissoes do sistema (admin_full, etc.) |
| `user_permissions` | Relacao usuario-permissao com expiracao |
| `subscriptions` | Assinaturas de usuarios |
| `subscription_plans` | Planos de assinatura disponiveis |
| `user_subscriptions` | Assinaturas ativas dos usuarios |
| `notifications` | Notificacoes do sistema |
| `bug_reports` | Reports de bugs dos usuarios |
| `upload_history` | Historico de uploads de CSV/XLSX |
| `access_logs` | Logs de acesso e tentativas negadas |
| `user_activities` | Tracking de atividade do usuario |
| `user_activity` | Tracking avancado de atividade (analytics) |
| `analytics_daily` | Resumo diario de analytics |
| `engagement_metrics` | Metricas de engajamento |
| `user_settings` | Configuracoes do usuario (moeda, notificacoes, exchange rates) |
| `custom_groups` | Grupos customizados de templates |
| `custom_group_templates` | Relacao grupo-template |
| `coaching_insights` | Insights de coaching |

---

## 7. Endpoints da API (173 endpoints)

Todos os endpoints estao definidos em `server/routes.ts` (~7000 linhas).

### Autenticacao (`/api/auth/`)

| Metodo | Endpoint | Auth | Descricao |
|--------|----------|------|-----------|
| POST | `/api/auth/register` | Nao | Registro de novo usuario |
| POST | `/api/auth/login` | Nao | Login com email/senha (JWT) |
| POST | `/api/auth/login-test` | Nao | Login de teste (debug) |
| POST | `/api/auth/logout` | Sim | Logout |
| POST | `/api/auth/refresh` | Nao | Refresh do token JWT |
| GET | `/api/auth/user` | Sim | Dados do usuario autenticado |
| GET | `/api/auth/me` | Sim | Dados do usuario (alternativo) |
| PATCH | `/api/auth/update-profile` | Sim | Atualizar perfil |
| POST | `/api/auth/verify-email` | Nao | Verificar email via token |
| POST | `/api/auth/resend-verification` | Nao | Reenviar email de verificacao |
| POST | `/api/auth/send-verification` | Nao | Enviar verificacao |
| POST | `/api/auth/forgot-password` | Nao | Solicitar reset de senha |
| POST | `/api/auth/reset-password` | Nao | Resetar senha com token |
| POST | `/api/auth/verify-reset-token` | Nao | Verificar token de reset |
| GET | `/api/auth/google` | Nao | Iniciar OAuth Google |
| GET | `/api/auth/google/callback` | Nao | Callback OAuth Google |

### Dashboard & Analytics

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/api/dashboard/stats` | Estatisticas gerais do dashboard |
| GET | `/api/dashboard/quick-stats` | Estatisticas rapidas |
| GET | `/api/dashboard/performance` | Performance detalhada |
| GET | `/api/analytics/dashboard-stats` | Stats do dashboard (analytics) |
| GET | `/api/analytics/profile-dashboard-stats` | Stats por perfil |
| GET | `/api/analytics/by-site` | Analise por site/rede |
| GET | `/api/analytics/by-buyin` | Analise por faixa de buy-in |
| GET | `/api/analytics/by-category` | Analise por categoria (Vanilla/PKO/Mystery) |
| GET | `/api/analytics/by-day` | Analise por dia da semana |
| GET | `/api/analytics/by-speed` | Analise por velocidade |
| GET | `/api/analytics/by-month` | Analise por mes |
| GET | `/api/analytics/by-field` | Analise por tamanho de field |
| GET | `/api/analytics/final-table` | Analise de mesas finais |

### Torneios

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/api/tournaments` | Listar torneios do usuario |
| POST | `/api/tournaments` | Criar torneio |
| PUT | `/api/tournaments/:id` | Atualizar torneio |
| DELETE | `/api/tournaments/:id` | Deletar torneio |
| GET | `/api/tournaments/sites` | Listar sites disponiveis |
| DELETE | `/api/tournaments/clear` | Limpar todos torneios |
| POST | `/api/tournaments/bulk-delete` | Deletar torneios em massa |
| POST | `/api/tournaments/bulk-delete/preview` | Preview de bulk delete |

### Biblioteca & Templates

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/api/tournament-library` | Biblioteca de torneios agrupados |
| GET | `/api/tournament-templates` | Templates de torneios |
| POST | `/api/tournament-templates` | Criar template |
| GET | `/api/tournament-suggestions` | Sugestoes de torneios |

### Grade & Planejamento

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/api/planned-tournaments` | Torneios planejados |
| POST | `/api/planned-tournaments` | Adicionar torneio planejado |
| PUT | `/api/planned-tournaments/:id` | Atualizar torneio planejado |
| DELETE | `/api/planned-tournaments/:id` | Remover torneio planejado |
| GET | `/api/weekly-plans` | Planos semanais |
| POST | `/api/weekly-plans` | Criar plano semanal |
| GET | `/api/profile-states` | Estados de perfil por dia |
| PUT | `/api/profile-states/:dayOfWeek` | Atualizar perfil do dia |
| POST | `/api/active-days/toggle` | Alternar dia ativo |

### Sessoes de Grind

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/api/grind-sessions` | Listar sessoes |
| GET | `/api/grind-sessions/history` | Historico de sessoes |
| POST | `/api/grind-sessions` | Criar sessao |
| PUT | `/api/grind-sessions/:id` | Atualizar sessao |
| DELETE | `/api/grind-sessions/:id` | Deletar sessao |
| GET | `/api/grind-sessions/:sessionId/tournaments` | Torneios de uma sessao |
| POST | `/api/grind-sessions/reset-tournaments` | Reset torneios da sessao |
| GET | `/api/session-tournaments/weekly-suggestions` | Sugestoes semanais |

### Upload & Import

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| POST | `/api/upload-history` | Upload de arquivo CSV/XLSX com parsing inteligente |
| DELETE | `/api/upload-history/:id` | Deletar registro de upload |

### Estudos

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET/POST | `/api/study-cards` | CRUD de cards de estudo |
| POST | `/api/study-cards/:id/progress` | Atualizar progresso |
| GET | `/api/study-correlation/:studyCardId` | Correlacao estudo-performance |
| GET/POST | `/api/study-schedules` | Agendamentos de estudo |

### Calendario

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET/POST/PUT/DELETE | `/api/calendar-categories` | CRUD categorias |
| GET/POST/PUT/DELETE | `/api/calendar-events` | CRUD eventos |
| GET | `/api/weekly-routine` | Rotina semanal |
| POST | `/api/weekly-routine/generate` | Gerar rotina automatica |

### Admin

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/api/admin/users` | Listar todos usuarios |
| POST | `/api/admin/users` | Criar usuario (admin) |
| PUT | `/api/admin/users/:id` | Editar usuario |
| DELETE | `/api/admin/users/:id` | Deletar usuario |
| PATCH | `/api/admin/users/:id/status` | Mudar status do usuario |
| GET | `/api/admin/access-logs` | Logs de acesso |
| GET | `/api/admin/dashboard-stats` | Stats do admin |
| GET | `/api/admin/monitoring` | Monitoramento do sistema |
| GET | `/api/admin/permission-profiles` | Perfis de permissao |
| POST | `/api/admin/apply-permissions-batch` | Aplicar permissoes em batch |
| GET | `/api/admin/data-metrics` | Metricas de dados |
| DELETE | `/api/admin/data-cleanup/:userPlatformId/:category` | Limpeza de dados |
| GET | `/api/admin/subscriptions` | Assinaturas (admin) |
| GET | `/api/admin/subscription-stats` | Stats de assinaturas |
| GET | `/api/admin/subscription-details` | Detalhes de assinaturas |
| POST | `/api/admin/extend-subscription` | Estender assinatura |
| POST | `/api/admin/update-subscription-plan` | Atualizar plano |
| GET | `/api/admin/subscription-history` | Historico de assinaturas |
| POST | `/api/admin/renew-subscription` | Renovar assinatura |
| GET | `/api/admin/billing-reports` | Relatorios de cobranca |

### Assinaturas & Pagamentos

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/api/subscription/status` | Status da assinatura |
| POST | `/api/subscription/create` | Criar assinatura |
| GET | `/api/subscription/history` | Historico de assinatura |
| GET | `/api/subscription/feature/:feature` | Verificar acesso a feature |
| POST | `/api/subscription/engagement` | Engagement da assinatura |
| GET | `/api/subscription-plans` | Listar planos |
| GET/POST/PUT/DELETE | `/api/subscriptions` | CRUD assinaturas |
| POST | `/api/subscriptions/check-expiration` | Verificar expiracao |
| POST | `/api/webhooks/payment` | Webhook de pagamento |

### Notificacoes

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/api/notifications` | Listar notificacoes |
| GET | `/api/notifications/unread-count` | Contagem de nao lidas |
| POST | `/api/notifications/:id/mark-read` | Marcar como lida |
| POST | `/api/notifications` | Criar notificacao |

### Bug Reports

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| POST | `/api/bug-reports` | Reportar bug |
| GET | `/api/bug-reports` | Listar bugs (admin) |
| GET | `/api/bug-reports/my` | Meus bug reports |
| GET | `/api/bug-reports/stats` | Estatisticas de bugs |
| GET | `/api/bug-reports/:id` | Detalhe do bug |
| PUT | `/api/bug-reports/:id` | Atualizar bug |
| DELETE | `/api/bug-reports/:id` | Deletar bug |

### Debug/Teste (remover antes de producao)

| Metodo | Endpoint | Descricao | Status |
|--------|----------|-----------|--------|
| ~~GET~~ | ~~`/api/debug-user`~~ | ~~Debug de usuario autenticado~~ | Removido (2026-03-19) |
| ~~POST~~ | ~~`/api/debug-upload-security`~~ | ~~Debug de seguranca de upload~~ | Removido (2026-03-19) |
| ~~GET~~ | ~~`/api/debug/date-range`~~ | ~~Debug de range de datas~~ | Removido (2026-03-19) |
| POST | `/api/test/email` | Teste de envio de email (admin) | Pendente remocao |
| GET | `/api/test/next-user-id` | Teste de geracao de ID | Pendente remocao |

---

## 8. Convencoes de Codigo Observadas

### Geral
- **Idioma do codigo:** Ingles para nomes de variaveis, funcoes e classes
- **Idioma da UI:** Portugues (Brasil) para labels, mensagens e textos
- **IDs:** Gerados com `nanoid()`, nunca auto-increment
- **User IDs:** Formato sequencial `USER-XXXX` (userPlatformId), usado como foreign key na maioria das tabelas
- **Schemas:** Definidos com Drizzle no `shared/schema.ts`, validacao com `drizzle-zod` + `zod`
- **API responses:** JSON direto (`res.json(data)`) sem wrapper padronizado
- **Erros:** `try/catch` com `console.error` e `res.status(4xx/5xx).json({ message })`

### Frontend
- **Componentes:** Functional components com hooks
- **Estilizacao:** Tailwind CSS com `cn()` helper (clsx + tailwind-merge)
- **Estado servidor:** TanStack React Query com `useQuery`/`useMutation`
- **Formularios:** React Hook Form + Zod resolvers
- **Roteamento:** Wouter (`useLocation`, `Route`, `Switch`)
- **Path aliases:** `@/` = `client/src/`, `@shared/` = `shared/`, `@assets/` = `attached_assets/`
- **UI Components:** shadcn/ui pattern (Radix primitives + CVA)

### Backend
- **Middleware de auth:** `requireAuth` (JWT), `requirePermission('permission_name')`
- **Validacao:** Zod schemas parseados antes de operacoes (`schema.parse(req.body)`)
- **Storage pattern:** Todas queries passam por `storage.ts` (camada de abstracao)
- **Upload:** Multer com memory storage, parsing via `PokerCSVParser`
- **Rate limiting:** `express-rate-limit` em endpoints de auth

### Redes de Poker Suportadas no Parser
O `server/csvParser.ts` interpreta arquivos de:
- WPN (Americas Cardroom, BlackChip Poker)
- GGNetwork (GGPoker, Natural8)
- PokerStars
- PartyPoker
- 888poker
- Bodog/Bovada
- CoinPoker
- Chico Network
- Revolution Network
- iPoker Network

---

## 9. Erros Conhecidos da IA

_(Secao para documentar erros recorrentes cometidos por IA ao trabalhar neste codebase)_

<!-- Adicione entradas conforme erros forem identificados -->

---

## 10. Problemas Identificados

### 10.1 Cleanup Realizado (2026-03-19)

Os seguintes problemas foram resolvidos:

| Problema | Resolucao |
|----------|-----------|
| **Debug/fix scripts na raiz** (9 arquivos) | Deletados: auditoria_permissoes_completa.js, debug_*.js (4), fix_user_permissions.js, reactivate_user_0001.js, cookies.txt |
| **SQL de migracao soltos** (4 arquivos) | Deletados: migration.sql, migration_script.js, render_migration.sql, postgresql_reconstruction_complete.sql |
| **Test scripts JS na raiz** (8 arquivos) | Deletados: test_admin_access.js, test_hash.js, test_permissions_*.js (3), test_premium_user_fix.js, test_registration_debug.js, test_routine.js, test_upload_system.js, test_session_data.sql |
| **Test CSVs na raiz** (14 arquivos) | Movidos para `tests/fixtures/` |
| **Restos do Replit** (.replit, replit.md) | Deletados |
| **Docs soltos na raiz** (6 arquivos) | Movidos: PRD → docs/prd/, DATABASE_RECONSTRUCTION_SUMMARY → docs/migrations/, RENDER_* → docs/deploy/, relatorio/debug_validation → docs/reports/ |
| **Credenciais SMTP hardcoded** | Movidas para variaveis de ambiente (SMTP_HOST, SMTP_USER, SMTP_PASS, etc.) |
| **Tokens em memoria documentados** | Documentado em 10.5 item 11 como problema conhecido |

| **Plugins Replit no vite.config.ts** | Removidos: @replit/vite-plugin-cartographer, @replit/vite-plugin-runtime-error-modal (devDeps + imports) |
| **server/replitAuth.ts** | Deletado (import comentado removido de routes.ts) |
| **Backups em pages/** (6 arquivos) | Deletados: Dashboard_backup, GradePlanner.backup, SessionHistory_backup, SessionHistory_original, DynamicCharts.backup, index_backup.css |
| **Variantes nao usadas em components/** (2 arquivos) | Deletados: EditUserModalEmpty, EditUserModalSimple. Mantidos: EditUserModalFixed (usado por AdminUsers), FilterPopupSimple (exporta FilterState usado por 2 componentes) |
| **attached_assets/ limpo** (225 arquivos removidos) | Deletados: 195 Pasted-* (prompts Replit), CSVs de exemplo, PRDs duplicados, screenshots de debug. Restam 14 arquivos: 2 logos do app (usados no codigo) + 12 logos de redes de poker |

**Nota sobre duplicatas de paginas (nao sao backups):**
Todas as duplicatas de paginas foram consolidadas (2026-03-19 e 2026-03-20). Os pares LoginPage/Login, RegisterPage/Register, ForgotPasswordPage/ForgotPassword, ResetPasswordPage/ResetPassword e HomePage/Home foram resolvidos.

### 10.2 Inconsistencias Tecnicas

| # | Problema | Status | Spec |
|---|----------|--------|------|
| 1 | ~~**routes.ts monolitico:** ~6.078 linhas com 162 endpoints~~ | **Resolvido** (2026-03-20). Modularizado em 17 arquivos em server/routes/ | `docs/specs/modularize-routes.md` |
| 2 | ~~**Endpoints duplicados:** forgot-password x3, reset-password x3, verify-email x2~~ | **Resolvido** (2026-03-19) | — |
| 3 | ~~**Endpoints de debug em producao:** /api/debug-* e /api/test/*~~ | **Resolvido** (2026-03-19 + 2026-03-20) | Removidos na modularizacao |
| 4 | ~~**Console.logs de debug no upload**~~ | **Resolvido** (2026-03-19, 937 logs removidos) | — |
| 5 | ~~**Tabelas duplicadas de tracking:** `user_activities` e `user_activity`~~ | **Resolvido** (2026-03-20). Consolidado em `user_activity` | `docs/specs/consolidate-tracking-tables.md` |
| 6 | ~~**.env commitado**~~ | **Resolvido**. `.env` esta no `.gitignore` e nao e rastreado pelo git | — |
| 7 | **Servidor escuta em 0.0.0.0:** Host hardcoded — adequado para containers, pode precisar de `localhost` em dev local | Pendente (baixa prioridade) | — |
| 8 | ~~**Tokens de verificacao/reset em memoria (Map)**~~ | **Resolvido** (2026-03-19). Migrado para tabela `auth_tokens` no banco | `docs/specs/fix-tokens-to-database.md` |
| 9 | ~~**Duplicatas de paginas:** LoginPage/Login, RegisterPage/Register, etc.~~ | **Resolvido** (2026-03-20). Todas as duplicatas consolidadas, incluindo HomePage.tsx | `docs/specs/consolidate-duplicate-pages.md` |

# Spec: Subscription Reform -- Trial + Single Plan Model

## Status
Proposta

## Resumo
Substituir o modelo atual de 4 tiers de assinatura (basico/premium/pro/admin) por um modelo simplificado com trial de 14 dias e plano unico com acesso total. Usuarios registram, recebem trial completo, e apos 14 dias precisam assinar (mensal R$29,90 ou anual R$19,90/mes) para manter acesso. Super-admins continuam com acesso irrestrito.

## Contexto
O sistema atual de permissoes por tier (basico/premium/pro/admin) com tags, SUBSCRIPTION_PROFILES e mapeamentos de paginas e complexo, fragil e nao reflete o modelo de negocio desejado. O novo modelo e binario: o usuario tem acesso total (trial ativo OU assinatura ativa OU super-admin) ou nao tem acesso a nada (apenas pagina de assinatura + settings). Isso simplifica drasticamente o codigo de permissoes no frontend e backend.

### O que existe hoje (sera substituido)
- `shared/permissions.ts`: 376 linhas com TAGS, SUBSCRIPTION_PROFILES (basico/premium/pro/admin), funcoes de verificacao por tag/pagina/rota, mapeamentos complexos de permissao-para-tag
- `client/src/hooks/usePermission.ts`: Hook que mapeia permission names para tags e verifica via plano
- `client/src/components/ProtectedRoute.tsx`: Verifica acesso a rotas mapeando para tags
- `client/src/components/AccessDenied.tsx`: Mostra plano atual vs plano necessario
- `server/auth.ts`: `requirePermission` middleware que verifica `user.permissions` array
- `users.subscriptionPlan` default `basico` no schema e no registro
- `subscriptionPlans` table com plans multi-tier
- `userSubscriptions` table vinculando usuario a plano
- `subscriptions` table com planType basico/premium/pro
- Sidebar mostra items com `ProTag` e filtra por `hasPermission`

## Usuarios
- **Usuario regular**: Registra, usa trial de 14 dias, assina para continuar
- **Super-admin** (ricardo.agnolo@hotmail.com, admin@grindfyapp.com): Acesso total permanente, sem restricao de trial ou assinatura

## Requisitos Funcionais

### RF-01: Novo modelo de subscriptionPlan
**Descricao:** O campo `users.subscriptionPlan` passa a aceitar apenas 4 valores: `trial`, `active`, `expired`, `admin`. O campo `users.subscriptionType` (atualmente `free`) sera removido por ser redundante.
**Regras de negocio:**
- `trial` -- usuario dentro do periodo de 14 dias de trial (acesso total)
- `active` -- usuario com assinatura paga ativa (acesso total)
- `expired` -- trial expirado ou assinatura vencida (sem acesso)
- `admin` -- super-admin com acesso permanente
- A verificacao de acesso e binaria: `trial` (com trial nao expirado), `active`, ou `admin` = acesso total. `expired` ou trial com `trialEndsAt` no passado = sem acesso.
- Nao existem mais tiers diferenciados de features. Todos os usuarios com acesso veem tudo.
**Criterio de aceitacao:**
- [ ] Campo `subscriptionPlan` aceita apenas `trial | active | expired | admin`
- [ ] Zod schema `adminEditUserSchema` atualizado para novos valores
- [ ] Valores antigos (`basico`, `premium`, `pro`) nao sao mais referenciados em nenhum lugar do codigo

### RF-02: Novos campos na tabela users
**Descricao:** Adicionar `trialEndsAt` e `subscriptionEndsAt` a tabela `users` para controle temporal de acesso.
**Regras de negocio:**
- `trialEndsAt`: timestamp, preenchido no registro com `now() + 14 dias`. Null para admins.
- `subscriptionEndsAt`: timestamp, preenchido quando usuario assina. Null enquanto em trial. Atualizado quando assinatura e renovada.
- A logica de acesso verifica:
  1. Se `subscriptionPlan === 'admin'` -> acesso total (ignora datas)
  2. Se `subscriptionPlan === 'trial'` E `trialEndsAt > now()` -> acesso total
  3. Se `subscriptionPlan === 'active'` E `subscriptionEndsAt > now()` -> acesso total
  4. Qualquer outro caso -> sem acesso (usuario deve ser redirecionado para pagina de assinatura)
- Quando `trialEndsAt` expira e usuario nao assinou, o `subscriptionPlan` deve ser atualizado para `expired` (pode ser feito via check no login/refresh ou via cron, mas a verificacao de acesso SEMPRE checa a data independente do valor do campo, como defense in depth)
**Criterio de aceitacao:**
- [ ] Campo `trialEndsAt` existe na tabela users (timestamp, nullable)
- [ ] Campo `subscriptionEndsAt` existe na tabela users (timestamp, nullable)
- [ ] Migracao SQL criada para adicionar os campos
- [ ] Migracao SQL atualiza usuarios existentes: usuarios com `subscriptionPlan` in (`basico`, `premium`, `pro`) recebem `subscriptionPlan = 'active'` e `subscriptionEndsAt = now() + 365 dias` (migrar generosamente); usuarios com `admin` mantam `admin`

### RF-03: Registro com trial automatico de 14 dias
**Descricao:** Ao registrar, o usuario recebe automaticamente 14 dias de trial com acesso total a todas as features.
**Regras de negocio:**
- No endpoint `POST /api/auth/register`, definir `subscriptionPlan: 'trial'` (em vez de `basico`)
- Definir `trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)` (14 dias a partir do registro)
- `subscriptionEndsAt` permanece `null` durante o trial
- O email de boas-vindas pode mencionar o trial de 14 dias (melhoria futura, fora de escopo desta spec)
**Criterio de aceitacao:**
- [ ] Novo usuario registrado tem `subscriptionPlan = 'trial'`
- [ ] Novo usuario registrado tem `trialEndsAt` = data de registro + 14 dias
- [ ] Novo usuario registrado tem `subscriptionEndsAt = null`

### RF-04: Simplificacao do sistema de permissoes (shared/permissions.ts)
**Descricao:** Substituir todo o sistema de tags/tiers por uma funcao binaria de verificacao de acesso.
**Regras de negocio:**
- Remover: `TAGS`, `SUBSCRIPTION_PROFILES`, `hasPageAccess`, `hasTagAccess`, `getUserTags`, `getRequiredPlanForTag`, `getRequiredPlanForPage`, `getMinimumPlanForRoute`, `hasRouteAccess`, `getPlanDisplayName`, `LEGACY_PERMISSIONS_MAP`
- Manter: `SUPER_ADMIN_EMAILS`, `isSuperAdmin`
- Adicionar nova funcao `hasFullAccess(subscriptionPlan: string, trialEndsAt: string | Date | null, subscriptionEndsAt: string | Date | null, userEmail?: string): boolean` que implementa a logica do RF-02
- Adicionar funcao helper `getTrialDaysRemaining(trialEndsAt: string | Date | null): number` que retorna dias restantes do trial (0 se expirado ou null)
- Adicionar funcao helper `getSubscriptionDaysRemaining(subscriptionEndsAt: string | Date | null): number`
- Manter acesso a paginas de admin (analytics, admin-users, admin-bugs) restrito a super-admins via `isSuperAdmin` check separado (nao pelo subscriptionPlan)
**Criterio de aceitacao:**
- [ ] `hasFullAccess` retorna `true` para super-admin independente de datas
- [ ] `hasFullAccess` retorna `true` para trial com `trialEndsAt` no futuro
- [ ] `hasFullAccess` retorna `true` para active com `subscriptionEndsAt` no futuro
- [ ] `hasFullAccess` retorna `false` para trial com `trialEndsAt` no passado
- [ ] `hasFullAccess` retorna `false` para expired
- [ ] `hasFullAccess` retorna `false` para active com `subscriptionEndsAt` no passado
- [ ] Todas as funcoes e constantes antigas de tier sao removidas
- [ ] Arquivo reduzido para menos de 60 linhas

### RF-05: Simplificacao do usePermission hook e AuthContext
**Descricao:** Substituir o hook `usePermission` e o `hasPermission` do AuthContext por logica binaria.
**Regras de negocio:**
- `AuthContext` user type deve incluir `trialEndsAt: string | null` e `subscriptionEndsAt: string | null`
- `hasPermission` no AuthContext deve ser substituido por `hasAccess: boolean` (computed) que usa `hasFullAccess`
- Adicionar `isAdmin: boolean` (computed) que usa `isSuperAdmin(user.email)`
- `usePermission` hook: simplificar para retornar `hasFullAccess(...)` para qualquer permission que nao seja admin. Para permissions admin (`admin_full`, `analytics_access`, `user_management`), retornar `isSuperAdmin(user.email)`.
- O endpoint `GET /api/auth/user` e `GET /api/auth/me` devem retornar `trialEndsAt` e `subscriptionEndsAt` no response
- O login response tambem deve incluir `trialEndsAt` e `subscriptionEndsAt`
**Criterio de aceitacao:**
- [ ] AuthContext expoe `hasAccess` (boolean) e `isAdmin` (boolean) no contexto
- [ ] `usePermission('qualquer_coisa')` retorna `true` se usuario tem acesso total
- [ ] `usePermission('admin_full')` retorna `true` apenas para super-admins
- [ ] User object no frontend inclui `trialEndsAt` e `subscriptionEndsAt`
- [ ] Login response inclui `trialEndsAt` e `subscriptionEndsAt`

### RF-06: Simplificacao do ProtectedRoute
**Descricao:** Substituir a verificacao por tag no ProtectedRoute por verificacao binaria de acesso.
**Regras de negocio:**
- Se usuario nao tem acesso (`hasAccess === false`), mostrar componente AccessDenied atualizado (RF-07) para todas as rotas protegidas
- Rotas admin (`/analytics`, `/admin/users`, `/admin/bugs`) continuam restritas a super-admins via `isAdmin`
- Rotas publicas (`/`, `/login`, `/register`, `/settings`, `/subscriptions`) nao passam por ProtectedRoute
- Remover todo o mapeamento routeToTag e a logica de getMinimumPlanForRoute
**Criterio de aceitacao:**
- [ ] ProtectedRoute usa `hasAccess` do AuthContext em vez de hasTagAccess
- [ ] Rotas admin verificam `isAdmin` em vez de tags
- [ ] Mapeamento routeToTag removido
- [ ] Codigo reduzido para menos de 40 linhas

### RF-07: AccessDenied atualizado para trial/subscription
**Descricao:** Atualizar componente AccessDenied para refletir o novo modelo sem tiers.
**Regras de negocio:**
- Remover props `currentPlan` e `requiredPlan` (nao existem mais tiers)
- Se usuario esta em trial expirado: mostrar mensagem "Seu periodo de teste terminou" com botao "Assinar agora" que redireciona para `/subscriptions`
- Se usuario esta com assinatura expirada: mostrar mensagem "Sua assinatura expirou" com botao "Renovar assinatura" que redireciona para `/subscriptions`
- Em ambos os casos, mostrar os beneficios do plano (lista de todas as features) para incentivar a conversao
- Nao mostrar comparacao de planos (nao existem tiers)
**Criterio de aceitacao:**
- [ ] Interface simplificada sem mencao a tiers/planos diferentes
- [ ] Mensagem diferente para trial expirado vs assinatura expirada
- [ ] Botao de acao leva para `/subscriptions`
- [ ] Props atualizadas: `reason: 'trial_expired' | 'subscription_expired'`

### RF-08: Simplificacao do requirePermission middleware (backend)
**Descricao:** Atualizar o middleware `requirePermission` no backend para logica binaria.
**Regras de negocio:**
- `requireAuth` continua funcionando como esta (valida JWT)
- `requirePermission` deve ser simplificado: se permission e admin (`admin_full`, `user_management`, `analytics_access`), verifica super-admin. Para qualquer outra permission, verifica se usuario tem acesso total (trial ativo OU assinatura ativa OU admin).
- `getUserWithPermissions` em `auth.ts` deve retornar `trialEndsAt` e `subscriptionEndsAt` junto com os outros campos
- Adicionar middleware `requireActiveSubscription` como alternativa mais clara: verifica apenas se usuario tem acesso total (para rotas que qualquer usuario pagante pode acessar)
- Adicionar middleware `requireAdmin` como alternativa para rotas admin-only
- A tabela `userPermissions` e `permissions` podem ser mantidas no banco por enquanto (para nao quebrar migracoes), mas o codigo nao deve mais depender delas para verificacao de acesso de features. Remocao das tabelas fica para uma spec futura.
**Criterio de aceitacao:**
- [ ] `requirePermission` usa logica binaria (trial/active/admin vs expired)
- [ ] `requireActiveSubscription` middleware criado e funcional
- [ ] `requireAdmin` middleware criado e funcional
- [ ] `getUserWithPermissions` retorna `trialEndsAt` e `subscriptionEndsAt`
- [ ] Nenhuma rota de feature depende de `userPermissions` table para controle de acesso

### RF-09: Nova pagina de assinatura
**Descricao:** Substituir a pagina atual de Subscriptions por uma pagina limpa com 2 planos (mensal e anual) em BRL.
**Regras de negocio:**
- Mostrar 2 cards lado a lado:
  - **Mensal**: R$29,90/mes, cobranca mensal, sem fidelidade
  - **Anual**: R$19,90/mes (R$238,80/ano), cobranca anual, economia de 33%
- Card anual deve ter destaque visual ("Mais popular" ou "Melhor valor") e badge de desconto
- Se usuario esta em trial ativo, mostrar banner no topo: "Voce tem X dias restantes no seu periodo de teste gratuito"
- Se usuario ja tem assinatura ativa, mostrar status atual: tipo (mensal/anual), data de renovacao, e opcao de cancelar
- Botao de assinar: por enquanto (sem Stripe implementado), abrir modal com instrucoes de pagamento manual ou redirecionar para link de pagamento externo (placeholder). O botao deve existir e chamar `POST /api/subscription/subscribe` que registra a intencao -- o admin ativa manualmente.
- Moeda: BRL (R$) hardcoded. Nao usar campo `currency` da tabela `subscription_plans`.
- Features listadas em ambos os cards (identicas, ja que nao ha diferenca de tier):
  - Dashboard analitico completo
  - Import de historicos multi-site
  - Biblioteca de torneios
  - Planejamento de grade semanal
  - Sessoes de grind em tempo real
  - Preparacao mental / Warm-up
  - Sistema de estudos
  - Calendario inteligente
  - Calculadoras profissionais
**Criterio de aceitacao:**
- [ ] Pagina mostra exatamente 2 planos: Mensal (R$29,90) e Anual (R$19,90/mes)
- [ ] Card anual tem destaque visual
- [ ] Trial banner aparece quando usuario esta em trial com dias restantes
- [ ] Assinatura ativa mostra status e opcao de cancelamento
- [ ] Precos em BRL com formatacao brasileira (R$ XX,XX)
- [ ] Lista de features identica nos dois cards

### RF-10: Sidebar atualizado com status de trial/assinatura
**Descricao:** Atualizar sidebar para mostrar status de trial ou assinatura no lugar do sistema atual de ProTag.
**Regras de negocio:**
- Remover componente `ProTag` de todos os items do menu
- Remover logica de `hasPro` nos items do sidebar
- Se usuario em trial: mostrar badge "Trial - X dias" no rodape do sidebar (antes do link de Assinatura), com cor amarela/amber
- Se usuario com assinatura ativa: mostrar badge "Assinante" com cor verde
- Se usuario com trial/assinatura expirada: mostrar badge "Expirado" com cor vermelha e link para assinar
- Super-admins: nao mostrar badge de trial/assinatura
- Remover filtro `hasPermission` dos items do menu (todos os items ficam visiveis para usuarios com acesso). Items admin continuam filtrados por `isSuperAdmin`.
**Criterio de aceitacao:**
- [ ] ProTag removido do sidebar
- [ ] Badge de trial com countdown aparece para usuarios em trial
- [ ] Badge "Assinante" aparece para usuarios com assinatura ativa
- [ ] Badge "Expirado" aparece para usuarios com acesso expirado
- [ ] Items de menu nao sao mais filtrados por permission (exceto admin items)

### RF-11: Endpoint de assinatura manual
**Descricao:** Criar endpoint para registrar intencao de assinatura e endpoint admin para ativar assinatura.
**Regras de negocio:**
- `POST /api/subscription/subscribe` (auth required): Registra intencao de assinatura. Body: `{ billingCycle: 'monthly' | 'annual' }`. Cria registro na tabela `subscriptions` com status `pending`. Retorna instrucoes de pagamento.
- `POST /api/admin/activate-subscription` (admin only): Admin ativa assinatura de um usuario. Body: `{ userId: string, billingCycle: 'monthly' | 'annual' }`. Atualiza `users.subscriptionPlan` para `active`, seta `users.subscriptionEndsAt` para `now() + 30 dias` (mensal) ou `now() + 365 dias` (anual). Atualiza registro em `subscriptions` para status `active`.
- `POST /api/admin/cancel-subscription` (admin only): Admin cancela assinatura. Seta `subscriptionPlan` para `expired`, mantem `subscriptionEndsAt` como referencia historica.
- `GET /api/subscription/status` (auth required): Retorna status atual do usuario: `{ plan: 'trial' | 'active' | 'expired', trialEndsAt, subscriptionEndsAt, billingCycle, daysRemaining }`.
**Criterio de aceitacao:**
- [ ] `POST /api/subscription/subscribe` cria registro pendente
- [ ] `POST /api/admin/activate-subscription` ativa assinatura com datas corretas
- [ ] `POST /api/admin/cancel-subscription` cancela assinatura
- [ ] `GET /api/subscription/status` retorna status completo e correto
- [ ] Todos os endpoints validam auth e admin conforme especificado

### RF-12: Expiracao automatica de trial e assinatura
**Descricao:** Garantir que usuarios com trial/assinatura expirada percam acesso automaticamente.
**Regras de negocio:**
- A verificacao principal e feita em tempo real via `hasFullAccess` (checa datas). Isso garante que mesmo sem um job de background, o acesso e cortado imediatamente apos expirar.
- Adicionalmente, no login e no refresh token, verificar se `trialEndsAt` ou `subscriptionEndsAt` passou. Se sim, atualizar `subscriptionPlan` para `expired` no banco. Isso garante que o campo do banco reflete a realidade para queries admin e relatorios.
- Nao implementar cron job nesta fase. A verificacao no login/refresh e suficiente.
**Criterio de aceitacao:**
- [ ] `hasFullAccess` checa datas em tempo real (defense in depth, nao depende do campo subscriptionPlan estar correto)
- [ ] Login atualiza `subscriptionPlan` para `expired` quando trial/assinatura venceu
- [ ] Token refresh atualiza `subscriptionPlan` para `expired` quando trial/assinatura venceu
- [ ] Usuario com trial expirado que faz login recebe `subscriptionPlan: 'expired'` no response

## Requisitos Nao-Funcionais
- **Performance:** A funcao `hasFullAccess` deve ser pura (sem I/O, sem queries) -- apenas comparacao de datas e strings. Nenhum impacto em latencia.
- **Seguranca:** Backend DEVE verificar acesso independentemente do frontend. O frontend pode esconder UI, mas o backend DEVE rejeitar requests de usuarios sem acesso com HTTP 403.
- **Retrocompatibilidade:** Usuarios existentes com planos `basico`/`premium`/`pro` devem ser migrados para `active` com `subscriptionEndsAt` generoso (1 ano). Nenhum usuario existente deve perder acesso imediatamente apos o deploy.
- **Simplicidade:** A meta e reduzir a complexidade. O arquivo `shared/permissions.ts` deve cair de ~376 linhas para menos de 60 linhas.

## Endpoints Previstos

### Endpoints novos
| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| POST | /api/subscription/subscribe | Registrar intencao de assinatura | JWT |
| POST | /api/admin/activate-subscription | Admin ativa assinatura de usuario | JWT + Super-admin |
| POST | /api/admin/cancel-subscription | Admin cancela assinatura de usuario | JWT + Super-admin |

### Endpoints alterados
| Metodo | Rota | Alteracao |
|---|---|---|
| POST | /api/auth/register | `subscriptionPlan: 'trial'`, seta `trialEndsAt` |
| POST | /api/auth/login | Response inclui `trialEndsAt`, `subscriptionEndsAt`; checa expiracao |
| POST | /api/auth/refresh | Checa expiracao de trial/assinatura |
| GET | /api/auth/user | Response inclui `trialEndsAt`, `subscriptionEndsAt` |
| GET | /api/auth/me | Response inclui `trialEndsAt`, `subscriptionEndsAt` |
| GET | /api/subscription/status | Response simplificado com novo modelo |

### Endpoints removidos
| Metodo | Rota | Motivo |
|---|---|---|
| GET | /api/subscription-plans | Substituido por planos hardcoded na UI |
| POST | /api/subscriptions | Substituido por /api/subscription/subscribe |
| GET | /api/subscriptions/current | Substituido por /api/subscription/status |
| PUT | /api/subscriptions/:id | Nao aplicavel (sem auto-renew configuravel por agora) |
| DELETE | /api/subscriptions/:id | Substituido por /api/admin/cancel-subscription |

## Modelos de Dados Afetados

### users (alteracao)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| subscriptionPlan | varchar | not null, default 'trial' | Valores: trial, active, expired, admin. **Alterado** de default 'basico' |
| trialEndsAt | timestamp | nullable | **Novo.** Data de fim do trial. Preenchido no registro. |
| subscriptionEndsAt | timestamp | nullable | **Novo.** Data de fim da assinatura paga. Null durante trial. |
| subscriptionType | varchar | - | **Removido** (campo nao utilizado, sempre 'free') |

### subscriptions (alteracao)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| planType | varchar | not null | **Alterado:** Valores passam a ser `monthly`, `annual` (em vez de basic/premium/pro) |
| status | varchar | default 'pending' | Sem alteracao nos valores: active, expired, pending, cancelled |
| billingCycle | varchar | nullable | **Novo.** `monthly` ou `annual` |
| amount | decimal(10,2) | not null | **Novo.** Valor pago (2990 para mensal, 23880 para anual -- em centavos) |
| currency | varchar | default 'BRL' | **Novo.** Sempre BRL |

### subscriptionPlans (sem alteracao)
Tabela mantida no banco mas nao utilizada pelo novo fluxo. Os planos sao hardcoded na UI (mensal R$29,90 e anual R$19,90/mes). Remocao da tabela fica para spec futura.

### userSubscriptions (sem alteracao)
Tabela mantida no banco mas nao utilizada pelo novo fluxo. Remocao fica para spec futura.

## Integracoes Externas
| Servico | Proposito | Quando |
|---|---|---|
| Nenhum nesta fase | Gateway de pagamento (Stripe) sera integrado em spec futura | - |

## Cenarios de Teste Derivados

### Happy Path
- [ ] Usuario registra e recebe `subscriptionPlan: 'trial'` com `trialEndsAt` = +14 dias
- [ ] Usuario em trial acessa todas as features (dashboard, grind, upload, etc.)
- [ ] Super-admin acessa tudo independente de trial/assinatura
- [ ] Admin ativa assinatura mensal: `subscriptionPlan: 'active'`, `subscriptionEndsAt: +30 dias`
- [ ] Admin ativa assinatura anual: `subscriptionPlan: 'active'`, `subscriptionEndsAt: +365 dias`
- [ ] Usuario com assinatura ativa acessa todas as features
- [ ] Pagina de subscriptions mostra 2 planos com precos corretos em BRL
- [ ] Sidebar mostra "Trial - X dias" para usuario em trial
- [ ] Sidebar mostra "Assinante" para usuario com assinatura ativa

### Validacao de Input
- [ ] `POST /api/subscription/subscribe` rejeita `billingCycle` invalido (nem monthly nem annual)
- [ ] `POST /api/admin/activate-subscription` rejeita userId inexistente
- [ ] `POST /api/admin/activate-subscription` rejeita se caller nao e super-admin (403)
- [ ] `POST /api/admin/cancel-subscription` rejeita se caller nao e super-admin (403)

### Regras de Negocio
- [ ] Trial expirado (trialEndsAt no passado) -> usuario nao acessa features
- [ ] Assinatura expirada (subscriptionEndsAt no passado) -> usuario nao acessa features
- [ ] Login com trial expirado atualiza `subscriptionPlan` para `expired` no banco
- [ ] Token refresh com trial expirado atualiza `subscriptionPlan` para `expired` no banco
- [ ] `hasFullAccess` retorna false mesmo se `subscriptionPlan === 'trial'` mas `trialEndsAt` esta no passado (defense in depth)
- [ ] `hasFullAccess` retorna false mesmo se `subscriptionPlan === 'active'` mas `subscriptionEndsAt` esta no passado (defense in depth)
- [ ] Usuarios existentes com `basico`/`premium`/`pro` sao migrados para `active` com 1 ano de acesso
- [ ] ProtectedRoute redireciona para AccessDenied quando `hasAccess === false`
- [ ] Rotas admin (/analytics, /admin/*) acessiveis apenas por super-admins

### Edge Cases
- [ ] Usuario com `trialEndsAt = null` e `subscriptionPlan = 'trial'` -> sem acesso (defensivo)
- [ ] Usuario com `subscriptionEndsAt = null` e `subscriptionPlan = 'active'` -> sem acesso (defensivo)
- [ ] Usuario com `trialEndsAt` exatamente agora (no segundo) -> sem acesso (usar `<` estrito, nao `<=`)
- [ ] Admin ativa assinatura para usuario que ja tem assinatura ativa -> estende a data (nao sobrescreve se data existente e maior)
- [ ] Admin cancela assinatura de usuario que ja esta expirado -> operacao idempotente (sem erro)
- [ ] Super-admin nao tem campos trial/subscription, funciona mesmo assim
- [ ] OAuth (Google) login de novo usuario tambem recebe trial de 14 dias

## Fora de Escopo
- Integracao com Stripe ou qualquer gateway de pagamento (spec futura)
- Emails de notificacao de trial expirando (spec futura)
- Pagamento automatico / checkout online (por agora e manual via admin)
- Remocao das tabelas `subscriptionPlans`, `userSubscriptions`, `permissions`, `userPermissions` do banco (manter para retrocompatibilidade de migracoes)
- Cron job para expiracao em background (verificacao no login/refresh e suficiente)
- Periodo de graca apos expiracao
- Cupons de desconto
- Free tier permanente com features limitadas
- Webhook de pagamento Stripe
- Historico detalhado de pagamentos

## Dependencias
- Nenhuma feature precisa existir antes desta. Este e um refactor do sistema existente.
- Migracao de banco deve ser executada antes do deploy do codigo novo.

## Notas de Implementacao (opcional)
- **Ordem sugerida de implementacao:**
  1. Migracao de banco (adicionar campos, migrar dados existentes)
  2. `shared/permissions.ts` (nova funcao `hasFullAccess`)
  3. `server/auth.ts` (atualizar getUserWithPermissions, middlewares)
  4. `server/routes/auth.ts` (registro com trial, login com expiracao check)
  5. Novos endpoints de subscription (subscribe, activate, cancel, status)
  6. `client/src/contexts/AuthContext.tsx` (novos campos, hasAccess, isAdmin)
  7. `client/src/hooks/usePermission.ts` (simplificar)
  8. `client/src/components/ProtectedRoute.tsx` (simplificar)
  9. `client/src/components/AccessDenied.tsx` (atualizar)
  10. `client/src/pages/Subscriptions.tsx` (reescrever)
  11. `client/src/components/Sidebar.tsx` (atualizar, remover ProTag)
  12. Limpar referencias a basico/premium/pro em todo o codebase
- **Migracao SQL sugerida:**
  ```sql
  ALTER TABLE users ADD COLUMN trial_ends_at TIMESTAMP;
  ALTER TABLE users ADD COLUMN subscription_ends_at TIMESTAMP;
  -- Migrar usuarios existentes generosamente
  UPDATE users SET subscription_plan = 'active', subscription_ends_at = NOW() + INTERVAL '365 days'
    WHERE subscription_plan IN ('basico', 'premium', 'pro');
  UPDATE users SET subscription_plan = 'admin'
    WHERE subscription_plan = 'admin' OR email IN ('ricardo.agnolo@hotmail.com', 'admin@grindfyapp.com');
  ALTER TABLE users ALTER COLUMN subscription_plan SET DEFAULT 'trial';
  ```
- **ProTag component:** Pode ser deletado inteiramente. Verificar se e usado em algum outro lugar alem do Sidebar antes de remover.
- **Tabela `subscriptions`:** Continuar usando para historico de assinaturas, mas a fonte de verdade para acesso atual sao os campos na tabela `users` (`subscriptionPlan`, `trialEndsAt`, `subscriptionEndsAt`).

## Arquivos Afetados (resumo)

### Backend
| Arquivo | Acao |
|---|---|
| `shared/schema.ts` | Adicionar campos `trialEndsAt`, `subscriptionEndsAt` a users; atualizar default de `subscriptionPlan`; atualizar Zod schemas |
| `shared/permissions.ts` | Reescrever: manter `isSuperAdmin`, adicionar `hasFullAccess`, remover todo o resto |
| `server/auth.ts` | Atualizar `getUserWithPermissions` para retornar novos campos; simplificar `requirePermission`; adicionar `requireActiveSubscription` e `requireAdmin` |
| `server/routes/auth.ts` | Registro com trial; login com check de expiracao; responses com novos campos |
| `server/routes/subscriptions.ts` (ou novo arquivo) | Novos endpoints de subscribe/activate/cancel/status |
| `migrations/` | Nova migracao SQL |

### Frontend
| Arquivo | Acao |
|---|---|
| `client/src/contexts/AuthContext.tsx` | Adicionar `trialEndsAt`, `subscriptionEndsAt`, `hasAccess`, `isAdmin` ao contexto |
| `client/src/hooks/usePermission.ts` | Simplificar para logica binaria |
| `client/src/components/ProtectedRoute.tsx` | Simplificar para usar `hasAccess` |
| `client/src/components/AccessDenied.tsx` | Atualizar props e mensagens para trial/subscription |
| `client/src/components/Sidebar.tsx` | Remover ProTag, adicionar badge de status trial/assinante/expirado |
| `client/src/components/ProTag.tsx` | Deletar |
| `client/src/pages/Subscriptions.tsx` | Reescrever com 2 planos BRL |
| `client/src/pages/AdminUsers.tsx` | Atualizar referencias a basico/premium/pro |
| `client/src/components/EditUserModalFixed.tsx` | Atualizar opcoes de subscriptionPlan |

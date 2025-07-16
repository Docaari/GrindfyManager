# Sistema de Planos - GrindFy

## Visão Geral

O GrindFy possui um sistema robusto de planos de assinatura que controla o acesso às funcionalidades da plataforma. O sistema combina **planos automáticos** com **permissões individuais** para máxima flexibilidade.

## Planos Disponíveis

### 1. Plano Básico
- **Acesso**: Grade + Grind
- **Páginas**: 
  - `/coach` (Grade Planner)
  - `/grind` (Grind Sessions)
- **Funcionalidades**:
  - Planejamento de torneios
  - Sessões de grind básicas
  - Acompanhamento de performance simples

### 2. Plano Premium
- **Acesso**: Básico + Dashboard + Import
- **Páginas**:
  - Todas do Básico
  - `/dashboard` (Analytics Dashboard)
  - `/import` (Upload de Dados)
- **Funcionalidades**:
  - Análise avançada de performance
  - Importação de dados CSV/Excel
  - Relatórios detalhados

### 3. Plano Pro
- **Acesso**: Premium + Ferramentas Avançadas
- **Páginas**:
  - Todas do Premium
  - `/warm-up` (Preparação Mental)
  - `/calendario` (Calendário Inteligente)
  - `/estudos` (Sistema de Estudos)
  - `/biblioteca` (Biblioteca de Recursos)
  - `/performance` (Analytics Avançado)
- **Funcionalidades**:
  - Preparação mental completa
  - Planejamento de calendário
  - Sistema de estudos
  - Biblioteca de recursos
  - Analytics avançado

### 4. Plano Admin
- **Acesso**: Pro + Ferramentas Administrativas
- **Páginas**:
  - Todas do Pro
  - `/admin/users` (Gestão de Usuários)
  - `/admin/bugs` (Gestão de Bugs)
- **Funcionalidades**:
  - Gestão completa de usuários
  - Sistema de bug reports
  - Controle de permissões
  - Relatórios administrativos

## Sistema de Tags PRO

### Como Funciona
- Funcionalidades **PRO** são marcadas visualmente com tags especiais
- Usuários sem acesso veem uma tela de upgrade
- Sistema bloqueia acesso funcional (não apenas visual)

### Páginas com Tags PRO
- **Biblioteca**: Recursos avançados de poker
- **Warm Up**: Preparação mental
- **Calendário**: Planejamento inteligente
- **Estudos**: Sistema de aprendizado
- **Ferramentas**: Analytics avançado

### Comportamento Visual
- Tag "PRO" aparece em cards/botões
- Cores diferenciadas para indicar restrição
- Hover effects mostram necessidade de upgrade

## Como Alterar Planos

### Via Interface Admin
1. Fazer login como administrador
2. Acessar `/admin/users`
3. Localizar o usuário desejado
4. Clicar em "Editar"
5. Selecionar novo plano no dropdown
6. Salvar alterações

### Via Banco de Dados
```sql
UPDATE users 
SET subscription_plan = 'premium' 
WHERE email = 'usuario@exemplo.com';
```

## Sistema de Permissões

### Duplo Sistema
O sistema utiliza duas camadas:
1. **Planos Automáticos**: Permissões baseadas no plano
2. **Permissões Individuais**: Acesso específico por página

### Mapeamento de Permissões
```javascript
const PERMISSION_TO_TAG_MAP = {
  'grade_planner_access': 'Grade',
  'grind_access': 'Grind',
  'dashboard_access': 'Dashboard',
  'upload_access': 'Import',
  'warm_up_access': 'Warm Up',
  'weekly_planner_access': 'Calendario',
  'studies_access': 'Estudos',
  'performance_access': 'Biblioteca',
  'admin_full': 'Admin Full'
};
```

### Validação de Acesso
1. Verifica se é super-admin (bypass completo)
2. Verifica permissões do plano automático
3. Verifica permissões individuais
4. Permite acesso se qualquer validação passar

## Super-Admin System

### Configuração
- Email: `ricardo.agnolo@hotmail.com`
- Acesso: **Irrestrito** a todas as funcionalidades
- Bypass: Ignora todas as validações de plano

### Funcionalidades Exclusivas
- Acesso total sem restrições
- Não pode ser bloqueado ou removido
- Sempre tem acesso admin completo

## Fluxo de Acesso

### 1. Usuário Tenta Acessar Página
```
Usuário → ProtectedRoute → Verificação de Permissões → Acesso/Bloqueio
```

### 2. Validação de Permissões
```javascript
// Ordem de verificação:
1. isSuperAdmin(email) → Acesso total
2. hasTagAccess(subscriptionPlan, requiredTag) → Plano automático
3. hasTagAccess(permissions, requiredTag) → Permissão individual
4. Bloqueio se nenhuma validação passar
```

### 3. Redirecionamento para Upgrade
- Usuário sem acesso vê modal de upgrade
- Informações sobre plano necessário
- Botão para contatar admin/suporte

## Configuração Técnica

### Estrutura de Dados
```sql
-- Tabela users
subscription_plan: 'basico' | 'premium' | 'pro' | 'admin'

-- Tabela user_permissions
permission_name: string (ex: 'dashboard_access')
user_platform_id: string (ex: 'USER-0001')
```

### Middleware de Autenticação
```javascript
// Todas as rotas protegidas passam por:
requireAuth → getUserWithPermissions → Validação de Acesso
```

## Manutenção e Monitoramento

### Logs Importantes
- Logs de acesso de usuários
- Tentativas de acesso não autorizadas
- Mudanças de plano

### Métricas de Acompanhamento
- Distribuição de usuários por plano
- Páginas mais acessadas
- Taxa de upgrade entre planos

## Resolução de Problemas

### Usuário Não Consegue Acessar
1. Verificar plano atual no banco
2. Confirmar permissões individuais
3. Validar se não é problema de cache
4. Verificar logs de acesso

### Sistema de Fallback
- Super-admin sempre tem acesso
- Planos automáticos como backup
- Permissões individuais como override

## Atualizações Futuras

### Funcionalidades Planejadas
- Sistema de trial temporário
- Downgrade automático
- Notificações de expiração
- Relatórios de uso por plano

---

**Última Atualização**: Janeiro 2025
**Versão**: 1.0
**Responsável**: Sistema de Autenticação GrindFy
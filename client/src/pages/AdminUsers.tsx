import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Lock, Unlock, Search, Users, Shield, Activity, AlertCircle, CheckCircle, XCircle, Trash2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { usePermission } from '@/hooks/usePermission';
import { useAuth } from '@/contexts/AuthContext';
import AccessDenied from '@/components/AccessDenied';
import DataMonitoring from '@/components/DataMonitoring';
import UserLevelIndicator from '@/components/UserLevelIndicator';
import HumanizedDate from '@/components/HumanizedDate';
import EditUserModalFixed from '@/components/EditUserModalFixed';
import DeleteUserModal from '@/components/DeleteUserModal';
import EmailPreviewCard from '@/components/admin/EmailPreviewCard';

// 🎯 ETAPA 3.1 - Interface atualizada para incluir userPlatformId
interface User {
  id: string;
  userPlatformId: string; // USER-0001, USER-0002, etc.
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  status: 'active' | 'inactive' | 'blocked';
  subscriptionPlan: 'trial' | 'active' | 'expired' | 'admin';
  permissions: string[];
  createdAt: string;
  lastLogin?: string;
}

// 🎯 ETAPA 3.3 - Interface atualizada para incluir userPlatformId nos logs
interface AccessLog {
  id: string;
  userId: string;
  userPlatformId?: string; // USER-0001, USER-0002, etc.
  action: string;
  status: 'success' | 'failed';
  ipAddress: string;
  timestamp: string;
  userAgent?: string;
  details?: string;
}

const AdminUsers: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const hasPermission = usePermission('user_management');
  const { user: currentUser } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [isNewEditModalOpen, setIsNewEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'blocked' | 'inactive'>('all');
  const [planFilter, setPlanFilter] = useState<'all' | 'trial' | 'active' | 'expired' | 'admin'>('all');
  const [logsLimit, setLogsLimit] = useState(25);

  // Fetch users with corrected API call
  const { data: users = [], isLoading: usersLoading, error: usersError } = useQuery<User[]>({
    queryKey: ['/api/admin/users'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/users');
      return Array.isArray(response) ? response : [];
    }
  });

  // Fetch access logs
  const { data: accessLogs = [] } = useQuery<AccessLog[]>({
    queryKey: ['/api/admin/access-logs'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/access-logs');
      return Array.isArray(response) ? response : [];
    }
  });

  // Fetch subscription statistics
  const { data: subscriptionStats } = useQuery({
    queryKey: ['/api/admin/subscription-stats'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/subscription-stats');
      return response || {};
    }
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: ({ id, userData }: { id: string; userData: Partial<User> }) =>
      apiRequest('PUT', `/api/admin/users/${id}`, userData),
    onSuccess: () => {
      toast({ title: 'Usuário atualizado com sucesso!' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao atualizar usuário',
        description: error.message || 'Erro desconhecido',
        variant: 'destructive'
      });
    }
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/admin/users/${id}`),
    onSuccess: () => {
      toast({ title: 'Usuário removido com sucesso!' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao remover usuário',
        description: error.message || 'Erro desconhecido',
        variant: 'destructive'
      });
    }
  });

  const handleToggleStatus = (user: User) => {
    const action = user.status === 'active' ? 'bloquear' : 'desbloquear';
    if (!window.confirm(`Tem certeza que deseja ${action} o usuário ${user.username}?`)) {
      return;
    }
    const newStatus = user.status === 'active' ? 'blocked' : 'active';
    updateUserMutation.mutate({
      id: user.id,
      userData: { status: newStatus }
    });
  };

  const openEditDialog = (user: User) => {
    setEditingUser(user);
    setIsNewEditModalOpen(true);
  };

  const handleDeleteUser = (user: User) => {
    setUserToDelete(user);
    setIsDeleteModalOpen(true);
  };

  // 🎯 ETAPA 3.2 - Sistema de busca melhorado incluindo userPlatformId
  const filteredUsers = users.filter(user => {
    const matchesSearch =
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.userPlatformId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.firstName && user.firstName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (user.lastName && user.lastName.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
    const matchesPlan = planFilter === 'all' || user.subscriptionPlan === planFilter;
    return matchesSearch && matchesStatus && matchesPlan;
  });

  const getPlanBadgeColor = (plan: string) => {
    switch (plan) {
      case 'admin': return 'bg-red-100 text-red-800';
      case 'active': return 'bg-green-100 text-green-800';
      case 'trial': return 'bg-amber-100 text-amber-800';
      case 'expired': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPlanLabel = (plan: string) => {
    switch (plan) {
      case 'admin': return 'Admin';
      case 'active': return 'Assinante';
      case 'trial': return 'Trial';
      case 'expired': return 'Expirado';
      default: return plan;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-yellow-100 text-yellow-800';
      case 'blocked': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="w-4 h-4" />;
      case 'inactive': return <AlertCircle className="w-4 h-4" />;
      case 'blocked': return <XCircle className="w-4 h-4" />;
      default: return <AlertCircle className="w-4 h-4" />;
    }
  };

  if (!hasPermission) {
    return <AccessDenied
      featureName="Gerenciamento de Usuários"
      description="Acesso ao painel de gerenciamento de usuários da plataforma."
      currentPlan={currentUser?.subscriptionPlan || "free"}
      requiredPlan="admin"
      pageName="Usuarios"
      onViewPlans={() => window.location.href = '/subscriptions'}
    />;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Gerenciamento de Usuários</h1>
        <Button onClick={() => { setEditingUser(null); setIsNewEditModalOpen(true); }} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Criar Usuário
        </Button>
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="statistics">Estatísticas</TabsTrigger>
          <TabsTrigger value="logs">Logs de Acesso</TabsTrigger>
          <TabsTrigger value="emails">E-mails</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoramento</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por email, nome, ID (USER-0001) ou username..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {filteredUsers.length} usuários
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-sm font-medium text-gray-500 mr-1">Status:</span>
            {(['all', 'active', 'blocked', 'inactive'] as const).map((s) => (
              <Button
                key={s}
                variant={statusFilter === s ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? 'Todos' : s === 'active' ? 'Ativos' : s === 'blocked' ? 'Bloqueados' : 'Inativos'}
              </Button>
            ))}
            <span className="text-sm font-medium text-gray-500 ml-4 mr-1">Plano:</span>
            {(['all', 'trial', 'active', 'expired', 'admin'] as const).map((p) => (
              <Button
                key={p}
                variant={planFilter === p ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPlanFilter(p)}
              >
                {p === 'all' ? 'Todos' : p === 'trial' ? 'Trial' : p === 'active' ? 'Assinante' : p === 'expired' ? 'Expirado' : 'Admin'}
              </Button>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Lista de Usuários ({filteredUsers.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="flex justify-center p-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : usersError ? (
                <div className="flex justify-center p-8">
                  <div className="text-red-500">
                    Erro ao carregar usuários: {usersError.message}
                  </div>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="flex justify-center p-8">
                  <div className="text-gray-500">
                    Nenhum usuário encontrado
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredUsers.map((user) => (
                    <div key={user.id} className="border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-lg">{user.username}</span>
                              {/* 🎯 ETAPA 3.1 - Exibir userPlatformId destacado */}
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                {user.userPlatformId}
                              </Badge>
                              <Badge className={getStatusColor(user.status)}>
                                {getStatusIcon(user.status)}
                                {user.status === 'active' ? 'Ativo' :
                                 user.status === 'inactive' ? 'Inativo' : 'Bloqueado'}
                              </Badge>
                              <Badge className={getPlanBadgeColor(user.subscriptionPlan)}>
                                {getPlanLabel(user.subscriptionPlan)}
                              </Badge>
                              <UserLevelIndicator permissions={user.permissions} />
                            </div>
                            <span className="text-sm text-gray-600 dark:text-gray-400">{user.email}</span>
                            {user.firstName && user.lastName && (
                              <span className="text-sm text-gray-500">
                                {user.firstName} {user.lastName}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openEditDialog(user)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Editar usuário</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleToggleStatus(user)}
                                >
                                  {user.status === 'active' ? 
                                    <Lock className="h-4 w-4" /> : 
                                    <Unlock className="h-4 w-4" />
                                  }
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{user.status === 'active' ? 'Bloquear usuário' : 'Desbloquear usuário'}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDeleteUser(user)}
                                  className="text-red-600 hover:text-red-800"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Remover usuário</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                      
                      <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                        <span>
                          Criado em: <HumanizedDate date={user.createdAt} />
                        </span>
                        {user.lastLogin && (
                          <span>
                            Último login: <HumanizedDate date={user.lastLogin} />
                          </span>
                        )}
                        <span>
                          Permissões: {user.permissions.length}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statistics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{users.length}</div>
                <p className="text-xs text-muted-foreground">
                  {users.filter(u => u.status === 'active').length} ativos
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Usuários Ativos</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {users.filter(u => u.status === 'active').length}
                </div>
                <p className="text-xs text-muted-foreground">
                  {users.length > 0 ? ((users.filter(u => u.status === 'active').length / users.length) * 100).toFixed(1) : '0'}% do total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Usuários Bloqueados</CardTitle>
                <XCircle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {users.filter(u => u.status === 'blocked').length}
                </div>
                <p className="text-xs text-muted-foreground">
                  {users.length > 0 ? ((users.filter(u => u.status === 'blocked').length / users.length) * 100).toFixed(1) : 0}% do total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Logs de Acesso</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{accessLogs.length}</div>
                <p className="text-xs text-muted-foreground">
                  {accessLogs.filter(log => log.status === 'success').length} sucessos
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Logs de Acesso Recentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {accessLogs.slice(0, logsLimit).map((log) => {
                  // 🎯 ETAPA 3.3 - Buscar userPlatformId do usuario relacionado ao log
                  const logUser = users.find(u => u.id === log.userId);

                  return (
                    <div key={log.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Badge variant={log.status === 'success' ? 'default' : 'destructive'}>
                          {log.status === 'success' ? 'Sucesso' : 'Falha'}
                        </Badge>
                        <span className="text-sm">{log.action}</span>
                        {logUser && (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                            {logUser.userPlatformId}
                          </Badge>
                        )}
                        {log.ipAddress && (
                          <span className="text-xs text-gray-400 font-mono">{log.ipAddress}</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        <HumanizedDate date={log.timestamp} />
                      </div>
                    </div>
                  );
                })}
                {accessLogs.length > logsLimit && (
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLogsLimit(prev => prev + 25)}
                    >
                      Mostrar mais
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="emails" className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Email de Confirmação */}
            <EmailPreviewCard 
              type="verification"
              title="Email de Confirmação"
              description="Enviado para verificação de nova conta"
              icon={<Mail className="h-5 w-5 text-blue-600" />}
              badges={[
                { text: "Verificação de Email", variant: "outline" },
                { text: "Ativo", variant: "outline", className: "text-green-600 border-green-600" }
              ]}
            />

            {/* Email de Boas-vindas */}
            <EmailPreviewCard 
              type="welcome"
              title="Email de Boas-vindas"
              description="Enviado após verificação da conta"
              icon={<Mail className="h-5 w-5 text-green-600" />}
              badges={[
                { text: "Onboarding", variant: "outline" },
                { text: "Ativo", variant: "outline", className: "text-green-600 border-green-600" }
              ]}
            />

            {/* Email de Redefinição de Senha */}
            <EmailPreviewCard 
              type="password-reset"
              title="Email de Reset de Senha"
              description="Enviado para redefinir senha esquecida"
              icon={<Mail className="h-5 w-5 text-orange-600" />}
              badges={[
                { text: "Recuperação", variant: "outline" },
                { text: "Ativo", variant: "outline", className: "text-green-600 border-green-600" }
              ]}
            />
          </div>

          {/* Seção de Configurações de Email */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-gray-600" />
                Configurações de Email
              </CardTitle>
              <p className="text-sm text-gray-600">
                Informações sobre o sistema de emails da plataforma
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="font-semibold text-sm">SMTP Ativo</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    Gmail SMTP configurado
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Mail className="h-4 w-4 text-blue-600" />
                    <span className="font-semibold text-sm">Remetente</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    admin@grindfyapp.com
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="h-4 w-4 text-purple-600" />
                    <span className="font-semibold text-sm">Templates</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    3 emails configurados
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-4 w-4 text-green-600" />
                    <span className="font-semibold text-sm">Status</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    Sistema operacional
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-4">
          <DataMonitoring />
        </TabsContent>
      </Tabs>

      {/* Modal de Criacao/Edicao de Usuario */}
      <EditUserModalFixed
        isOpen={isNewEditModalOpen}
        onClose={() => {
          setIsNewEditModalOpen(false);
          setEditingUser(null);
        }}
        user={editingUser}
        onUserUpdated={() => queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] })}
      />

      {/* Modal de Exclusão de Usuário */}
      {userToDelete && (
        <DeleteUserModal
          isOpen={isDeleteModalOpen}
          onClose={() => {
            setIsDeleteModalOpen(false);
            setUserToDelete(null);
          }}
          user={userToDelete}
        />
      )}
    </div>
  );
};

export default AdminUsers;
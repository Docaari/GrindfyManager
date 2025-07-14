import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Lock, Unlock, Search, Users, Shield, Activity, AlertCircle, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import RealtimeMonitoring from '@/components/RealtimeMonitoring';
import UserLevelIndicator from '@/components/UserLevelIndicator';
import HumanizedDate from '@/components/HumanizedDate';
import EditUserModalSimple from '@/components/EditUserModalSimple';
import EditUserModal from '@/components/EditUserModalEmpty';

interface User {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  status: 'active' | 'inactive' | 'blocked';
  permissions: string[];
  createdAt: string;
  lastLogin?: string;
}

interface AccessLog {
  id: string;
  userId: string;
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
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isNewEditModalOpen, setIsNewEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Fetch users with corrected API call
  const { data: users = [], isLoading: usersLoading, error: usersError } = useQuery<User[]>({
    queryKey: ['/api/admin/users'],
    queryFn: () => apiRequest('GET', '/api/admin/users')
  });

  // Fetch access logs
  const { data: accessLogs = [] } = useQuery<AccessLog[]>({
    queryKey: ['/api/admin/access-logs'],
    queryFn: () => apiRequest('GET', '/api/admin/access-logs')
  });

  // Fetch subscription statistics
  const { data: subscriptionStats } = useQuery({
    queryKey: ['/api/admin/subscription-stats'],
    queryFn: () => apiRequest('GET', '/api/admin/subscription-stats')
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
    if (window.confirm(`Tem certeza que deseja remover o usuário ${user.username}?`)) {
      deleteUserMutation.mutate(user.id);
    }
  };

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.firstName && user.firstName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (user.lastName && user.lastName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

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

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Gerenciamento de Usuários</h1>
        <Button onClick={() => setIsCreateDialogOpen(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Criar Usuário
        </Button>
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="statistics">Estatísticas</TabsTrigger>
          <TabsTrigger value="logs">Logs de Acesso</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoramento</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar usuários..."
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
                              <Badge className={getStatusColor(user.status)}>
                                {getStatusIcon(user.status)}
                                {user.status === 'active' ? 'Ativo' : 
                                 user.status === 'inactive' ? 'Inativo' : 'Bloqueado'}
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
                <div className="text-2xl font-bold">{subscriptionStats?.totalSubscriptions || 0}</div>
                <p className="text-xs text-muted-foreground">
                  {subscriptionStats?.activeSubscriptions || 0} ativos
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
                  {((users.filter(u => u.status === 'active').length / users.length) * 100).toFixed(1)}% do total
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
                {accessLogs.slice(0, 10).map((log) => (
                  <div key={log.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Badge variant={log.status === 'success' ? 'default' : 'destructive'}>
                        {log.status === 'success' ? 'Sucesso' : 'Falha'}
                      </Badge>
                      <span className="text-sm">{log.action}</span>
                    </div>
                    <div className="text-sm text-gray-500">
                      <HumanizedDate date={log.timestamp} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-4">
          <RealtimeMonitoring />
        </TabsContent>
      </Tabs>

      {/* Modal de Criação de Usuário */}
      <EditUserModal
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onUserCreated={() => queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] })}
      />

      {/* Modal de Edição de Usuário */}
      <EditUserModalSimple
        isOpen={isNewEditModalOpen}
        onClose={() => {
          setIsNewEditModalOpen(false);
          setEditingUser(null);
        }}
        user={editingUser}
        onUserUpdated={() => queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] })}
      />
    </div>
  );
};

export default AdminUsers;
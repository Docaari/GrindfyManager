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

  // Fetch users
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
          <TabsTrigger value="logs">Logs de Acesso</TabsTrigger>
          <TabsTrigger value="subscription">Assinaturas</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoramento</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Buscar usuários por email, username ou nome..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
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
                    <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div>
                          <h3 className="font-medium">{user.username}</h3>
                          <p className="text-sm text-gray-600">{user.email}</p>
                          {(user.firstName || user.lastName) && (
                            <p className="text-sm text-gray-500">
                              {user.firstName} {user.lastName}
                            </p>
                          )}
                        </div>
                        <UserLevelIndicator permissions={user.permissions} />
                        <Badge variant={user.status === 'active' ? 'default' : 'destructive'}>
                          {user.status === 'active' ? 'Ativo' : user.status === 'blocked' ? 'Bloqueado' : 'Inativo'}
                        </Badge>
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
                            <TooltipContent>Editar usuário</TooltipContent>
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
                              {user.status === 'active' ? 'Bloquear' : 'Desbloquear'}
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
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Remover usuário</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
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
              <div className="space-y-3">
                {accessLogs.slice(0, 10).map((log) => (
                  <div key={log.id} className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <p className="font-medium">Usuário: {log.userId}</p>
                      <p className="text-sm text-gray-600">Ação: {log.action}</p>
                      {log.ipAddress && (
                        <p className="text-xs text-gray-500">IP: {log.ipAddress}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <Badge variant={log.status === 'success' ? 'default' : 'destructive'}>
                        {log.status === 'success' ? 'Sucesso' : 'Falha'}
                      </Badge>
                      {log.timestamp && (
                        <p className="text-xs text-gray-500 mt-1">
                          <HumanizedDate date={log.timestamp} relative />
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscription" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Estatísticas de Assinatura</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-green-600">
                    {subscriptionStats?.active || 0}
                  </h3>
                  <p className="text-sm text-gray-600">Assinaturas Ativas</p>
                </div>
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-yellow-600">
                    {subscriptionStats?.expiring || 0}
                  </h3>
                  <p className="text-sm text-gray-600">Expirando em Breve</p>
                </div>
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-red-600">
                    {subscriptionStats?.expired || 0}
                  </h3>
                  <p className="text-sm text-gray-600">Expiradas</p>
                </div>
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-blue-600">
                    {subscriptionStats?.trial || 0}
                  </h3>
                  <p className="text-sm text-gray-600">Trial</p>
                </div>
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
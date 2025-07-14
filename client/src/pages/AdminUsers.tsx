import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Lock, Unlock, Search, Eye, EyeOff, Users, Shield, Activity, AlertCircle, CheckCircle, XCircle, Settings, Star, Crown, Gem } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import PermissionManager from '@/components/PermissionManager';
import RealtimeMonitoring from '@/components/RealtimeMonitoring';
import PermissionBadge from '@/components/PermissionBadge';
import UserLevelIndicator from '@/components/UserLevelIndicator';
import HumanizedDate from '@/components/HumanizedDate';
import SelectionCounter from '@/components/SelectionCounter';

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

interface Permission {
  id: string;
  name: string;
  description: string;
  category: string;
}

const PREDEFINED_ROLES = {
  'admin_full': {
    name: 'Acesso Completo',
    description: 'Acesso total a todas as funcionalidades',
    permissions: ['admin_full', 'user_management', 'system_config', 'premium_features', 'analytics_full']
  },
  'basic_access': {
    name: 'Acesso Básico',
    description: 'Funcionalidades essenciais apenas',
    permissions: ['tournaments_view', 'dashboard_view', 'import_data']
  },
  'custom': {
    name: 'Personalizado',
    description: 'Escolha manual das permissões',
    permissions: []
  }
};

const AVAILABLE_PERMISSIONS = [
  { id: 'admin_full', name: 'Administração Completa', description: 'Acesso total ao sistema', category: 'Admin' },
  { id: 'user_management', name: 'Gestão de Usuários', description: 'Criar, editar e gerenciar usuários', category: 'Admin' },
  { id: 'system_config', name: 'Configuração do Sistema', description: 'Alterar configurações globais', category: 'Admin' },
  { id: 'premium_features', name: 'Funcionalidades Premium', description: 'Acessar recursos premium', category: 'Features' },
  { id: 'analytics_full', name: 'Analytics Completo', description: 'Acesso a todas as análises', category: 'Analytics' },
  { id: 'tournaments_view', name: 'Visualizar Torneios', description: 'Ver biblioteca de torneios', category: 'Basic' },
  { id: 'tournaments_edit', name: 'Editar Torneios', description: 'Criar e editar torneios', category: 'Basic' },
  { id: 'dashboard_view', name: 'Dashboard', description: 'Acessar dashboard principal', category: 'Basic' },
  { id: 'import_data', name: 'Importar Dados', description: 'Fazer upload de arquivos CSV', category: 'Basic' },
  { id: 'grind_sessions', name: 'Sessões de Grind', description: 'Gerenciar sessões de jogo', category: 'Features' },
  { id: 'mental_prep', name: 'Preparação Mental', description: 'Acessar ferramentas mentais', category: 'Features' },
  { id: 'coaching_tools', name: 'Ferramentas de Coaching', description: 'Usar sistema de coaching', category: 'Features' },
  { id: 'studies_management', name: 'Gestão de Estudos', description: 'Gerenciar estudos e materiais', category: 'Features' }
];

const AdminUsers: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isLogsDialogOpen, setIsLogsDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>('custom');
  const [showPassword, setShowPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    firstName: '',
    lastName: '',
    password: '',
    permissions: [] as string[],
    status: 'active' as const
  });

  // Fetch users
  const { data: users = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ['/api/admin/users'],
    queryFn: () => apiRequest('/api/admin/users')
  });

  // Fetch access logs
  const { data: accessLogs = [] } = useQuery<AccessLog[]>({
    queryKey: ['/api/admin/access-logs'],
    queryFn: () => apiRequest('/api/admin/access-logs')
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: (userData: typeof formData) => 
      apiRequest('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(userData)
      }),
    onSuccess: () => {
      toast({ title: 'Usuário criado com sucesso!' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao criar usuário',
        description: error.message || 'Erro desconhecido',
        variant: 'destructive'
      });
    }
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: ({ id, userData }: { id: string; userData: Partial<User> }) =>
      apiRequest(`/api/admin/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(userData)
      }),
    onSuccess: () => {
      toast({ title: 'Usuário atualizado com sucesso!' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      setIsEditDialogOpen(false);
      setSelectedUser(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao atualizar usuário',
        description: error.message || 'Erro desconhecido',
        variant: 'destructive'
      });
    }
  });

  // Toggle user status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'blocked' }) =>
      apiRequest(`/api/admin/users/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      }),
    onSuccess: () => {
      toast({ title: 'Status do usuário atualizado!' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao atualizar status',
        description: error.message || 'Erro desconhecido',
        variant: 'destructive'
      });
    }
  });

  const resetForm = () => {
    setFormData({
      email: '',
      username: '',
      firstName: '',
      lastName: '',
      password: '',
      permissions: [],
      status: 'active'
    });
    setSelectedRole('custom');
  };

  const handleRoleChange = (role: string) => {
    setSelectedRole(role);
    if (role !== 'custom') {
      setFormData(prev => ({
        ...prev,
        permissions: PREDEFINED_ROLES[role as keyof typeof PREDEFINED_ROLES].permissions
      }));
    }
  };

  const handlePermissionToggle = (permissionId: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permissionId)
        ? prev.permissions.filter(p => p !== permissionId)
        : [...prev.permissions, permissionId]
    }));
  };

  const handleCreateUser = () => {
    createUserMutation.mutate(formData);
  };

  const handleUpdateUser = () => {
    if (selectedUser) {
      updateUserMutation.mutate({
        id: selectedUser.id,
        userData: formData
      });
    }
  };

  const handleToggleStatus = (user: User) => {
    const newStatus = user.status === 'active' ? 'blocked' : 'active';
    toggleStatusMutation.mutate({ id: user.id, status: newStatus });
  };

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const userAccessLogs = accessLogs.filter(log => 
    selectedUser ? log.userId === selectedUser.id : true
  );

  const openEditDialog = (user: User) => {
    setSelectedUser(user);
    setFormData({
      email: user.email,
      username: user.username,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      password: '',
      permissions: user.permissions,
      status: user.status
    });
    setIsEditDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800">Ativo</Badge>;
      case 'blocked':
        return <Badge className="bg-red-100 text-red-800">Bloqueado</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800">Inativo</Badge>;
    }
  };

  const getPermissionsByCategory = () => {
    const categories: Record<string, Permission[]> = {};
    AVAILABLE_PERMISSIONS.forEach(permission => {
      if (!categories[permission.category]) {
        categories[permission.category] = [];
      }
      categories[permission.category].push(permission);
    });
    return categories;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Gestão de Usuários</h1>
          <p className="text-gray-600 mt-2">Gerencie usuários, permissões e monitore atividades</p>
        </div>

        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="users">Usuários</TabsTrigger>
            <TabsTrigger value="permissions">Permissões</TabsTrigger>
            <TabsTrigger value="activity">Atividade</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-6">

            {/* Statistics Cards - MELHORIA UX/UI */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <Card className="bg-white border-gray-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Total de Usuários</p>
                      <p className="text-2xl font-bold text-gray-900">{users.length}</p>
                    </div>
                    <div className="p-2 bg-blue-100 rounded-full">
                      <Users className="w-6 h-6 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-white border-gray-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Usuários Ativos</p>
                      <p className="text-2xl font-bold text-green-600">{users.filter(u => u.status === 'active').length}</p>
                    </div>
                    <div className="p-2 bg-green-100 rounded-full">
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-white border-gray-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Usuários Bloqueados</p>
                      <p className="text-2xl font-bold text-red-600">{users.filter(u => u.status === 'blocked').length}</p>
                    </div>
                    <div className="p-2 bg-red-100 rounded-full">
                      <XCircle className="w-6 h-6 text-red-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-white border-gray-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Logs de Atividade</p>
                      <p className="text-2xl font-bold text-purple-600">{accessLogs.length}</p>
                    </div>
                    <div className="p-2 bg-purple-100 rounded-full">
                      <Activity className="w-6 h-6 text-purple-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Header Actions e Filtros Avançados - MELHORIA UX/UI */}
            <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Gestão de Usuários</h2>
                <div className="flex items-center space-x-3">
                  <Dialog open={isLogsDialogOpen} onOpenChange={setIsLogsDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="flex items-center space-x-2">
                        <Activity size={16} />
                        <span>Logs de Atividade</span>
                      </Button>
                    </DialogTrigger>
                  </Dialog>
                  <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-red-600 hover:bg-red-700 flex items-center space-x-2">
                        <Plus size={16} />
                        <span>Criar Usuário</span>
                      </Button>
                    </DialogTrigger>
                  </Dialog>
                </div>
              </div>
              
              {/* Filtros Avançados */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                  <Input
                    placeholder="Buscar por email ou username..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                
                <Select defaultValue="all">
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Status</SelectItem>
                    <SelectItem value="active">Ativos</SelectItem>
                    <SelectItem value="blocked">Bloqueados</SelectItem>
                    <SelectItem value="inactive">Inativos</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select defaultValue="all">
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por permissão" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Permissões</SelectItem>
                    <SelectItem value="admin_full">Administradores</SelectItem>
                    <SelectItem value="user_management">Gestão de Usuários</SelectItem>
                    <SelectItem value="basic_access">Acesso Básico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Users Table - MELHORIAS VISUAIS IMPLEMENTADAS */}
            <Card className="bg-white border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-gray-900 flex items-center space-x-2">
                  <Users className="h-5 w-5" />
                  <span>Usuários ({filteredUsers.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="text-left p-4 text-gray-700 font-semibold">Usuário</th>
                        <th className="text-left p-4 text-gray-700 font-semibold">Status</th>
                        <th className="text-left p-4 text-gray-700 font-semibold">Permissões</th>
                        <th className="text-left p-4 text-gray-700 font-semibold">Último Login</th>
                        <th className="text-left p-4 text-gray-700 font-semibold">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((user) => (
                        <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="p-4">
                            <div className="flex items-center space-x-3">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2">
                                  <div className="font-medium text-gray-900">{user.username || user.email}</div>
                                  <UserLevelIndicator permissions={user.permissions} />
                                </div>
                                <div className="text-sm text-gray-600">{user.email}</div>
                                {(user.firstName || user.lastName) && (
                                  <div className="text-sm text-gray-500">{user.firstName} {user.lastName}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <Badge 
                              className={`
                                flex items-center space-x-1 w-fit
                                ${user.status === 'active' 
                                  ? 'bg-green-100 text-green-800 border-green-200' 
                                  : user.status === 'blocked' 
                                    ? 'bg-red-100 text-red-800 border-red-200' 
                                    : 'bg-gray-100 text-gray-800 border-gray-200'
                                }
                              `}
                            >
                              {user.status === 'active' ? (
                                <><CheckCircle className="h-3 w-3" /><span>Ativo</span></>
                              ) : user.status === 'blocked' ? (
                                <><XCircle className="h-3 w-3" /><span>Bloqueado</span></>
                              ) : (
                                <><AlertCircle className="h-3 w-3" /><span>Inativo</span></>
                              )}
                            </Badge>
                          </td>
                          <td className="p-4">
                            <div className="space-y-2">
                              {/* Permissões agrupadas por categoria */}
                              <div className="flex flex-wrap gap-1">
                                {user.permissions.slice(0, 4).map(permission => {
                                  const category = permission.includes('admin') || permission.includes('user_management') || permission.includes('system_config') 
                                    ? 'admin' 
                                    : permission.includes('analytics') || permission.includes('reports') || permission.includes('executive')
                                      ? 'analytics'
                                      : permission.includes('access') || permission.includes('features') || permission.includes('premium')
                                        ? 'features'
                                        : 'core';
                                  
                                  return (
                                    <PermissionBadge 
                                      key={permission} 
                                      permission={permission} 
                                      category={category}
                                      variant="small"
                                    />
                                  );
                                })}
                                {user.permissions.length > 4 && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge variant="outline" className="text-xs cursor-help">
                                          +{user.permissions.length - 4}
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs">
                                        <div className="space-y-2">
                                          <div className="font-medium">Todas as permissões:</div>
                                          <div className="space-y-1">
                                            {user.permissions.slice(4).map(permission => (
                                              <div key={permission} className="text-sm">
                                                {permission}
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                              <div className="text-xs text-gray-500">
                                {user.permissions.length} permissões
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <HumanizedDate date={user.lastLogin} />
                          </td>
                          <td className="p-4">
                            <div className="flex space-x-2">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openEditDialog(user)}
                                      className="flex items-center space-x-1 hover:bg-green-50 hover:border-green-200"
                                    >
                                      <Settings size={14} />
                                      <span className="hidden sm:inline">Editar Permissões</span>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Gerenciar acesso do usuário</p>
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
                                      className={`
                                        flex items-center space-x-1
                                        ${user.status === 'active' 
                                          ? 'hover:bg-red-50 hover:border-red-200 hover:text-red-700' 
                                          : 'hover:bg-green-50 hover:border-green-200 hover:text-green-700'
                                        }
                                      `}
                                    >
                                      {user.status === 'active' ? (
                                        <><Lock size={14} /><span className="hidden sm:inline">Bloquear</span></>
                                      ) : (
                                        <><Unlock size={14} /><span className="hidden sm:inline">Desbloquear</span></>
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{user.status === 'active' ? 'Bloquear usuário' : 'Desbloquear usuário'}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

        {/* Create User Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="max-w-6xl w-[90vw] h-[85vh] bg-gray-800 border-gray-700 flex flex-col">
            <DialogHeader className="flex-shrink-0 pb-4 border-b border-gray-700">
              <DialogTitle className="text-white text-xl">Criar Novo Usuário</DialogTitle>
              <div className="flex items-center gap-4 mt-2">
                <div className="text-sm text-gray-300">
                  Permissões selecionadas: <span className="text-green-400 font-medium">{formData.permissions.length}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRoleChange('admin_full')}
                    className="text-xs border-gray-600 hover:bg-gray-700"
                  >
                    Admin Completo
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRoleChange('basic_access')}
                    className="text-xs border-gray-600 hover:bg-gray-700"
                  >
                    Usuário Básico
                  </Button>
                </div>
              </div>
            </DialogHeader>
            
            <div className="flex-1 overflow-hidden flex flex-col gap-4 pt-4">
              {/* Basic Info - Optimized Layout */}
              <div className="flex-shrink-0 space-y-3">
                {/* Row 1: Email + Username */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email" className="text-white font-semibold text-sm">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      required
                      className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500 h-9"
                    />
                  </div>
                  <div>
                    <Label htmlFor="username" className="text-white font-semibold text-sm">Username *</Label>
                    <Input
                      id="username"
                      value={formData.username}
                      onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                      required
                      className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500 h-9"
                    />
                  </div>
                </div>

                {/* Row 2: Nome + Sobrenome */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName" className="text-white font-semibold text-sm">Nome</Label>
                    <Input
                      id="firstName"
                      value={formData.firstName}
                      onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                      className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500 h-9"
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName" className="text-white font-semibold text-sm">Sobrenome</Label>
                    <Input
                      id="lastName"
                      value={formData.lastName}
                      onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                      className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500 h-9"
                    />
                  </div>
                </div>

                {/* Row 3: Senha */}
                <div>
                  <Label htmlFor="password" className="text-white font-semibold text-sm">Senha *</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                      required
                      className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500 h-9"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 h-7 w-7"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </Button>
                  </div>
                </div>

                {/* Perfil Selection */}
                <div>
                  <Label className="text-white font-semibold text-sm">Perfil de Permissões</Label>
                  <Select value={selectedRole} onValueChange={handleRoleChange}>
                    <SelectTrigger className="bg-gray-700 border-gray-600 text-white focus:border-blue-500 h-9">
                      <SelectValue placeholder="Selecione um perfil" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PREDEFINED_ROLES).map(([key, role]) => (
                        <SelectItem key={key} value={key}>
                          {role.name} - {role.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Permissions - 3 Column Layout */}
              <div className="flex-1 overflow-hidden">
                <Label className="text-white font-semibold text-sm mb-2 block">Permissões por Categoria</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 h-full overflow-y-auto pr-2">
                  {Object.entries(getPermissionsByCategory()).map(([category, permissions]) => (
                    <div key={category} className="border border-gray-600 rounded-lg p-3 bg-gray-700 h-fit">
                      <h4 className="font-semibold mb-2 text-white text-sm">{category}</h4>
                      <div className="space-y-2">
                        {permissions.map(permission => (
                          <div key={permission.id} className="flex items-start space-x-2">
                            <Checkbox
                              id={permission.id}
                              checked={formData.permissions.includes(permission.id)}
                              onCheckedChange={() => handlePermissionToggle(permission.id)}
                              className="mt-0.5 h-4 w-4"
                            />
                            <div className="flex-1 min-w-0">
                              <Label htmlFor={permission.id} className="text-gray-200 font-medium text-xs block cursor-pointer leading-tight">
                                {permission.name}
                              </Label>
                              <p className="text-gray-400 text-xs mt-0.5 leading-tight">{permission.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Fixed Footer */}
            <div className="flex-shrink-0 flex justify-end space-x-2 pt-4 border-t border-gray-700 bg-gray-800">
              <Button
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
                className="border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreateUser}
                disabled={createUserMutation.isPending}
                className="bg-[#16a34a] hover:bg-green-700 text-white font-semibold"
              >
                {createUserMutation.isPending ? 'Criando...' : 'Criar Usuário'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit User Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-6xl w-[90vw] h-[85vh] bg-gray-800 border-gray-700 flex flex-col">
            <DialogHeader className="flex-shrink-0 pb-4 border-b border-gray-700">
              <DialogTitle className="text-white text-xl">Editar Usuário</DialogTitle>
              <div className="flex items-center gap-4 mt-2">
                <div className="text-sm text-gray-300">
                  Permissões selecionadas: <span className="text-green-400 font-medium">{formData.permissions.length}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRoleChange('admin_full')}
                    className="text-xs border-gray-600 hover:bg-gray-700"
                  >
                    Admin Completo
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRoleChange('basic_access')}
                    className="text-xs border-gray-600 hover:bg-gray-700"
                  >
                    Usuário Básico
                  </Button>
                </div>
              </div>
            </DialogHeader>
            
            <div className="flex-1 overflow-hidden flex flex-col gap-4 pt-4">
              {/* Basic Info - Optimized Layout */}
              <div className="flex-shrink-0 space-y-3">
                {/* Row 1: Email + Username */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-email" className="text-white font-semibold text-sm">Email *</Label>
                    <Input
                      id="edit-email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      required
                      className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500 h-9"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-username" className="text-white font-semibold text-sm">Username *</Label>
                    <Input
                      id="edit-username"
                      value={formData.username}
                      onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                      required
                      className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500 h-9"
                    />
                  </div>
                </div>

                {/* Status */}
                <div>
                  <Label className="text-white font-semibold text-sm">Status</Label>
                  <Select 
                    value={formData.status} 
                    onValueChange={(value: 'active' | 'blocked') => 
                      setFormData(prev => ({ ...prev, status: value }))
                    }
                  >
                    <SelectTrigger className="bg-gray-700 border-gray-600 text-white focus:border-blue-500 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="blocked">Bloqueado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Permissions - 3 Column Layout */}
              <div className="flex-1 overflow-hidden">
                <Label className="text-white font-semibold text-sm mb-2 block">Permissões por Categoria</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 h-full overflow-y-auto pr-2">
                  {Object.entries(getPermissionsByCategory()).map(([category, permissions]) => (
                    <div key={category} className="border border-gray-600 rounded-lg p-3 bg-gray-700 h-fit">
                      <h4 className="font-semibold mb-2 text-white text-sm">{category}</h4>
                      <div className="space-y-2">
                        {permissions.map(permission => (
                          <div key={permission.id} className="flex items-start space-x-2">
                            <Checkbox
                              id={`edit-${permission.id}`}
                              checked={formData.permissions.includes(permission.id)}
                              onCheckedChange={() => handlePermissionToggle(permission.id)}
                              className="mt-0.5 h-4 w-4"
                            />
                            <div className="flex-1 min-w-0">
                              <Label htmlFor={`edit-${permission.id}`} className="text-gray-200 font-medium text-xs block cursor-pointer leading-tight">
                                {permission.name}
                              </Label>
                              <p className="text-gray-400 text-xs mt-0.5 leading-tight">{permission.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Fixed Footer */}
            <div className="flex-shrink-0 flex justify-end space-x-2 pt-4 border-t border-gray-700 bg-gray-800">
              <Button
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
                className="border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleUpdateUser}
                disabled={updateUserMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white font-semibold"
              >
                {updateUserMutation.isPending ? 'Atualizando...' : 'Atualizar Usuário'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Access Logs Dialog */}
        <Dialog open={isLogsDialogOpen} onOpenChange={setIsLogsDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-gray-800 border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-white">Logs de Atividade</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left p-2 text-white font-semibold">Data/Hora</th>
                      <th className="text-left p-2 text-white font-semibold">Usuário</th>
                      <th className="text-left p-2 text-white font-semibold">Ação</th>
                      <th className="text-left p-2 text-white font-semibold">Status</th>
                      <th className="text-left p-2 text-white font-semibold">IP</th>
                      <th className="text-left p-2 text-white font-semibold">Detalhes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userAccessLogs.map((log) => (
                      <tr key={log.id} className="border-b border-gray-700 hover:bg-gray-700">
                        <td className="p-2 text-sm text-gray-200">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="p-2 text-sm text-gray-200">
                          {users.find(u => u.id === log.userId)?.email || 'Usuário não encontrado'}
                        </td>
                        <td className="p-2 text-sm text-gray-200">{log.action}</td>
                        <td className="p-2">
                          <Badge className={log.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                            {log.status === 'success' ? 'Sucesso' : 'Falha'}
                          </Badge>
                        </td>
                        <td className="p-2 text-sm text-gray-200">{log.ipAddress}</td>
                        <td className="p-2 text-sm text-gray-200">{log.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </DialogContent>
        </Dialog>
          </TabsContent>

          <TabsContent value="permissions" className="space-y-6">
            <PermissionManager />
          </TabsContent>

          <TabsContent value="activity" className="space-y-6">
            <RealtimeMonitoring />
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
};

export default AdminUsers;
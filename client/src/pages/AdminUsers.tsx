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
import EditUserModalSimple from '@/components/EditUserModalSimple';
import EditUserModal from '@/components/EditUserModalEmpty';
import { PermissionTag, getPermissionTags, getPermissionsFromTags } from '@/components/PermissionTag';

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
  'basico': {
    name: 'Básico',
    description: 'Apenas ferramentas de jogo',
    permissions: getPermissionsFromTags(['GRIND']),
    tags: ['GRIND']
  },
  'premium': {
    name: 'Premium',
    description: 'Jogo + análises de dados',
    permissions: getPermissionsFromTags(['GRIND', 'ANALISE_DB']),
    tags: ['GRIND', 'ANALISE_DB']
  },
  'pro': {
    name: 'Pro',
    description: 'Acesso completo a todas as funcionalidades',
    permissions: getPermissionsFromTags(['GRIND', 'ANALISE_DB', 'PREMIUM']),
    tags: ['GRIND', 'ANALISE_DB', 'PREMIUM']
  },
  'custom': {
    name: 'Personalizado',
    description: 'Escolha manual das permissões',
    permissions: [],
    tags: []
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
  const [isLogsDialogOpen, setIsLogsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>('basico');
  const [showPassword, setShowPassword] = useState(false);
  const [isNewEditModalOpen, setIsNewEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [extendSubscriptionUser, setExtendSubscriptionUser] = useState<User | null>(null);
  const [extendDays, setExtendDays] = useState(30);
  const [selectedUserForPermissions, setSelectedUserForPermissions] = useState<User | null>(null);
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);


  
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

  // Fetch subscription statistics
  const { data: subscriptionStats } = useQuery({
    queryKey: ['/api/admin/subscription-stats'],
    queryFn: () => apiRequest('/api/admin/subscription-stats')
  });

  // Fetch subscription details
  const { data: subscriptionDetails } = useQuery({
    queryKey: ['/api/admin/subscription-details'],
    queryFn: () => apiRequest('/api/admin/subscription-details')
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: (userData: typeof formData) => 
      apiRequest('POST', '/api/admin/users', userData),
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
      apiRequest('PUT', `/api/admin/users/${id}`, userData),
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
      apiRequest('PATCH', `/api/admin/users/${id}/status`, { status }),
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

  // Extend subscription mutation
  const extendSubscriptionMutation = useMutation({
    mutationFn: ({ userId, days }: { userId: string; days: number }) =>
      apiRequest('POST', '/api/admin/extend-subscription', { userId, days }),
    onSuccess: () => {
      toast({ title: 'Assinatura estendida com sucesso!' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/subscription-details'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/subscription-stats'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao estender assinatura',
        description: error.message || 'Erro desconhecido',
        variant: 'destructive'
      });
    }
  });

  // Update subscription plan mutation
  const updateSubscriptionPlanMutation = useMutation({
    mutationFn: ({ userId, planId }: { userId: string; planId: string }) =>
      apiRequest('POST', '/api/admin/update-subscription-plan', { userId, planId }),
    onSuccess: () => {
      toast({ title: 'Plano de assinatura atualizado!' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/subscription-details'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/subscription-stats'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao atualizar plano',
        description: error.message || 'Erro desconhecido',
        variant: 'destructive'
      });
    }
  });

  // Renew subscription mutation
  const renewSubscriptionMutation = useMutation({
    mutationFn: ({ userId, planId, paymentMethod }: { userId: string; planId: string; paymentMethod?: string }) =>
      apiRequest('POST', '/api/admin/renew-subscription', { userId, planId, paymentMethod }),
    onSuccess: () => {
      toast({ title: 'Assinatura renovada com sucesso!' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/subscription-details'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/subscription-stats'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao renovar assinatura',
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
    if (PREDEFINED_ROLES[role as keyof typeof PREDEFINED_ROLES]) {
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

  // Nova função para o modal melhorado
  const openNewEditModal = (user: User) => {
    console.log('🔍 MODAL CLICK DEBUG - Botão Editar clicado para usuário:', user.email);
    console.log('🔍 MODAL CLICK DEBUG - Estado atual isNewEditModalOpen:', isNewEditModalOpen);
    setEditingUser(user);
    setIsNewEditModalOpen(true);
    console.log('🔍 MODAL CLICK DEBUG - Estado após setIsNewEditModalOpen(true)');
  };

  // Função para salvar usuário no novo modal
  const handleSaveUser = async (userData: Partial<User>, newPassword?: string) => {
    if (!editingUser) return;

    const payload: any = userData;
    if (newPassword) {
      payload.password = newPassword;
    }

    await updateUserMutation.mutateAsync({
      id: editingUser.id,
      userData: payload
    });

    setIsNewEditModalOpen(false);
    setEditingUser(null);
  };

  // Função para gerenciar permissões do usuário
  const handleManagePermissions = (user: User) => {
    setSelectedUserForPermissions(user);
    setIsPermissionModalOpen(true);
  };

  // Função para excluir usuário (se necessário)
  const handleDeleteUser = async (userId: string) => {
    await apiRequest('DELETE', `/api/admin/users/${userId}`);
    
    queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-[#24c25e]/20 text-[#24c25e] border-[#24c25e]/30">Ativo</Badge>;
      case 'blocked':
        return <Badge className="bg-[#ef4444]/20 text-[#ef4444] border-[#ef4444]/30">Bloqueado</Badge>;
      default:
        return <Badge className="bg-gray-700 text-gray-300 border-gray-600">Inativo</Badge>;
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
    <div className="min-h-screen bg-[#374151] p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Gestão de Usuários</h1>
          <p className="text-gray-300 mt-2">Gerencie usuários, permissões e monitore atividades</p>
        </div>

        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-gray-800 border-gray-700">
            <TabsTrigger 
              value="users" 
              className="data-[state=active]:bg-[#24c25e] data-[state=active]:text-white text-gray-300 hover:text-white transition-colors duration-200"
            >
              Usuários
            </TabsTrigger>
            <TabsTrigger 
              value="subscriptions" 
              className="data-[state=active]:bg-[#24c25e] data-[state=active]:text-white text-gray-300 hover:text-white transition-colors duration-200"
            >
              Assinaturas
            </TabsTrigger>
            <TabsTrigger 
              value="permissions" 
              className="data-[state=active]:bg-[#24c25e] data-[state=active]:text-white text-gray-300 hover:text-white transition-colors duration-200"
            >
              Permissões
            </TabsTrigger>
            <TabsTrigger 
              value="activity" 
              className="data-[state=active]:bg-[#24c25e] data-[state=active]:text-white text-gray-300 hover:text-white transition-colors duration-200"
            >
              Atividade
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-6">

            {/* Statistics Cards - PALETA GRINDFY */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <Card className="bg-gray-800 border-gray-700 hover:shadow-lg transition-all duration-200 hover:scale-105">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-400">Total de Usuários</p>
                      <p className="text-2xl font-bold text-white">{users.length}</p>
                    </div>
                    <div className="p-2 bg-blue-500/20 rounded-full">
                      <Users className="w-6 h-6 text-[#3b82f6]" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-gray-800 border-gray-700 hover:shadow-lg transition-all duration-200 hover:scale-105">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-400">Usuários Ativos</p>
                      <p className="text-2xl font-bold text-[#24c25e]">{users.filter(u => u.status === 'active').length}</p>
                    </div>
                    <div className="p-2 bg-green-500/20 rounded-full">
                      <CheckCircle className="w-6 h-6 text-[#24c25e]" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-gray-800 border-gray-700 hover:shadow-lg transition-all duration-200 hover:scale-105">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-400">Usuários Bloqueados</p>
                      <p className="text-2xl font-bold text-[#ef4444]">{users.filter(u => u.status === 'blocked').length}</p>
                    </div>
                    <div className="p-2 bg-red-500/20 rounded-full">
                      <XCircle className="w-6 h-6 text-[#ef4444]" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-gray-800 border-gray-700 hover:shadow-lg transition-all duration-200 hover:scale-105">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-400">Logs de Atividade</p>
                      <p className="text-2xl font-bold text-[#3b82f6]">{accessLogs.length}</p>
                    </div>
                    <div className="p-2 bg-blue-500/20 rounded-full">
                      <Activity className="w-6 h-6 text-[#3b82f6]" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Header Actions e Filtros Avançados - PALETA GRINDFY */}
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-white">Gestão de Usuários</h2>
                <div className="flex items-center space-x-3">
                  <Dialog open={isLogsDialogOpen} onOpenChange={setIsLogsDialogOpen}>
                    <DialogTrigger asChild>
                      <Button 
                        variant="outline" 
                        className="flex items-center space-x-2 bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white hover:border-[#3b82f6] transition-all duration-200"
                      >
                        <Activity size={16} />
                        <span>Logs de Atividade</span>
                      </Button>
                    </DialogTrigger>
                  </Dialog>
                  <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-[#24c25e] hover:bg-[#1ea04a] flex items-center space-x-2 text-white transition-all duration-200 hover:scale-105">
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
                    className="pl-10 bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-[#24c25e] focus:ring-[#24c25e]/20"
                  />
                </div>
                
                <Select defaultValue="all">
                  <SelectTrigger className="bg-gray-700 border-gray-600 text-white focus:border-[#24c25e] focus:ring-[#24c25e]/20">
                    <SelectValue placeholder="Filtrar por status" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-700 border-gray-600">
                    <SelectItem value="all" className="text-white hover:bg-gray-600 focus:bg-gray-600">Todos os Status</SelectItem>
                    <SelectItem value="active" className="text-white hover:bg-gray-600 focus:bg-gray-600">Ativos</SelectItem>
                    <SelectItem value="blocked" className="text-white hover:bg-gray-600 focus:bg-gray-600">Bloqueados</SelectItem>
                    <SelectItem value="inactive" className="text-white hover:bg-gray-600 focus:bg-gray-600">Inativos</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select defaultValue="all">
                  <SelectTrigger className="bg-gray-700 border-gray-600 text-white focus:border-[#24c25e] focus:ring-[#24c25e]/20">
                    <SelectValue placeholder="Filtrar por permissão" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-700 border-gray-600">
                    <SelectItem value="all" className="text-white hover:bg-gray-600 focus:bg-gray-600">Todas as Permissões</SelectItem>
                    <SelectItem value="admin_full" className="text-white hover:bg-gray-600 focus:bg-gray-600">Administradores</SelectItem>
                    <SelectItem value="user_management" className="text-white hover:bg-gray-600 focus:bg-gray-600">Gestão de Usuários</SelectItem>
                    <SelectItem value="basic_access" className="text-white hover:bg-gray-600 focus:bg-gray-600">Acesso Básico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Users Table - PALETA GRINDFY */}
            <Card className="bg-gray-800 border-gray-700 shadow-sm">
              <CardHeader>
                <CardTitle className="text-white flex items-center space-x-2">
                  <Users className="h-5 w-5" />
                  <span>Usuários ({filteredUsers.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-600 bg-gray-700">
                        <th className="text-left p-4 text-gray-300 font-semibold">Usuário</th>
                        <th className="text-left p-4 text-gray-300 font-semibold">Status</th>
                        <th className="text-left p-4 text-gray-300 font-semibold">Permissões</th>
                        <th className="text-left p-4 text-gray-300 font-semibold">Último Login</th>
                        <th className="text-left p-4 text-gray-300 font-semibold">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((user) => (
                        <tr key={user.id} className="border-b border-gray-600 hover:bg-gray-700 transition-colors">
                          <td className="p-4">
                            <div className="flex items-center space-x-3">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2">
                                  <div className="font-medium text-white">{user.username || user.email}</div>
                                  <UserLevelIndicator permissions={user.permissions} />
                                </div>
                                <div className="text-sm text-gray-400">{user.email}</div>
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
                                  ? 'bg-[#24c25e]/20 text-[#24c25e] border-[#24c25e]/30' 
                                  : user.status === 'blocked' 
                                    ? 'bg-[#ef4444]/20 text-[#ef4444] border-[#ef4444]/30' 
                                    : 'bg-gray-700 text-gray-300 border-gray-600'
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
                              {/* Tags de Permissões - Sistema Reformulado */}
                              <div className="flex flex-wrap gap-2">
                                {getPermissionTags(user.permissions).map(tag => (
                                  <PermissionTag 
                                    key={tag} 
                                    tag={tag} 
                                    size="sm"
                                    showTooltip={true}
                                  />
                                ))}
                                {getPermissionTags(user.permissions).length === 0 && (
                                  <span className="text-xs text-gray-500 italic">Nenhuma permissão</span>
                                )}
                              </div>
                              <div className="text-xs text-gray-400">
                                {getPermissionTags(user.permissions).length} categoria{getPermissionTags(user.permissions).length !== 1 ? 's' : ''}
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
                                      onClick={() => openNewEditModal(user)}
                                      className="flex items-center space-x-1 bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 hover:border-[#3b82f6] hover:text-white transition-all duration-200"
                                    >
                                      <Edit size={14} />
                                      <span className="hidden sm:inline">Editar Usuário</span>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Editar informações e permissões do usuário</p>
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
                                        flex items-center space-x-1 bg-gray-700 border-gray-600 text-gray-300 transition-all duration-200
                                        ${user.status === 'active' 
                                          ? 'hover:bg-[#ef4444]/20 hover:border-[#ef4444] hover:text-[#ef4444]' 
                                          : 'hover:bg-[#24c25e]/20 hover:border-[#24c25e] hover:text-[#24c25e]'
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
                    onClick={() => handleRoleChange('basico')}
                    className="text-xs border-gray-600 hover:bg-gray-700"
                  >
                    Básico
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRoleChange('premium')}
                    className="text-xs border-gray-600 hover:bg-gray-700"
                  >
                    Premium
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRoleChange('pro')}
                    className="text-xs border-gray-600 hover:bg-gray-700"
                  >
                    Pro
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

              {/* Tags de Permissão */}
              <div className="flex-1 overflow-hidden">
                <Label className="text-white font-semibold text-sm mb-2 block">
                  Tags de Permissão Ativas
                </Label>
                <div className="bg-gray-700 rounded-lg p-4 border border-gray-600 h-full overflow-y-auto">
                  <div className="flex flex-wrap gap-2 mb-4">
                    {getPermissionTags(formData.permissions).map((tag) => (
                      <PermissionTag key={tag} tag={tag} size="md" />
                    ))}
                    {getPermissionTags(formData.permissions).length === 0 && (
                      <div className="text-gray-400 text-sm">
                        Nenhuma tag de permissão ativa. Selecione um perfil acima.
                      </div>
                    )}
                  </div>
                  
                  <div className="text-xs text-gray-400 space-y-2">
                    <p><strong>Básico:</strong> Acesso ao dashboard e funcionalidades básicas</p>
                    <p><strong>Premium:</strong> Acesso a estudos, análises e recursos avançados</p>
                    <p><strong>Pro:</strong> Acesso completo incluindo administração e gestão</p>
                  </div>
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

        {/* Extend Subscription Dialog */}
        <Dialog open={!!extendSubscriptionUser} onOpenChange={() => setExtendSubscriptionUser(null)}>
          <DialogContent className="max-w-md bg-gray-800 border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-white">Estender Assinatura</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-300 mb-2">
                  Usuário: <span className="font-medium text-white">{extendSubscriptionUser?.email}</span>
                </p>
                <p className="text-sm text-gray-300 mb-4">
                  Estender assinatura por quantos dias?
                </p>
              </div>
              
              <div className="grid grid-cols-4 gap-2">
                <Button
                  variant={extendDays === 30 ? "default" : "outline"}
                  onClick={() => setExtendDays(30)}
                  className="text-sm"
                >
                  30 dias
                </Button>
                <Button
                  variant={extendDays === 90 ? "default" : "outline"}
                  onClick={() => setExtendDays(90)}
                  className="text-sm"
                >
                  90 dias
                </Button>
                <Button
                  variant={extendDays === 180 ? "default" : "outline"}
                  onClick={() => setExtendDays(180)}
                  className="text-sm"
                >
                  180 dias
                </Button>
                <Button
                  variant={extendDays === 365 ? "default" : "outline"}
                  onClick={() => setExtendDays(365)}
                  className="text-sm"
                >
                  365 dias
                </Button>
              </div>
              
              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setExtendSubscriptionUser(null)}
                  className="border-gray-600 text-gray-300 hover:bg-gray-700"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => {
                    if (extendSubscriptionUser) {
                      extendSubscriptionMutation.mutate({ 
                        userId: extendSubscriptionUser.id, 
                        days: extendDays 
                      });
                      setExtendSubscriptionUser(null);
                    }
                  }}
                  disabled={extendSubscriptionMutation.isPending}
                  className="bg-[#24c25e] hover:bg-green-700 text-white"
                >
                  {extendSubscriptionMutation.isPending ? 'Estendendo...' : 'Estender'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
          </TabsContent>

          <TabsContent value="subscriptions" className="space-y-6">
            {/* Subscription Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <Card className="bg-gray-800 border-gray-700 hover:shadow-lg transition-all duration-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-400">Assinaturas Ativas</p>
                      <p className="text-2xl font-bold text-[#24c25e]">
                        {subscriptionStats?.activeSubscriptions || 0}
                      </p>
                    </div>
                    <div className="p-2 bg-green-500/20 rounded-full">
                      <CheckCircle className="w-6 h-6 text-[#24c25e]" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800 border-gray-700 hover:shadow-lg transition-all duration-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-400">Expiram Esta Semana</p>
                      <p className="text-2xl font-bold text-[#f59e0b]">
                        {subscriptionStats?.expiringThisWeek || 0}
                      </p>
                    </div>
                    <div className="p-2 bg-yellow-500/20 rounded-full">
                      <AlertCircle className="w-6 h-6 text-[#f59e0b]" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800 border-gray-700 hover:shadow-lg transition-all duration-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-400">Assinaturas Expiradas</p>
                      <p className="text-2xl font-bold text-[#ef4444]">
                        {subscriptionStats?.expiredSubscriptions || 0}
                      </p>
                    </div>
                    <div className="p-2 bg-red-500/20 rounded-full">
                      <XCircle className="w-6 h-6 text-[#ef4444]" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800 border-gray-700 hover:shadow-lg transition-all duration-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-400">Receita Mensal</p>
                      <p className="text-2xl font-bold text-[#3b82f6]">
                        R$ {subscriptionStats?.monthlyRevenue || 0}
                      </p>
                    </div>
                    <div className="p-2 bg-blue-500/20 rounded-full">
                      <Crown className="w-6 h-6 text-[#3b82f6]" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Subscription Plans Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Card className="bg-gray-800 border-gray-700">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-white font-semibold">Básico</h3>
                    <Star className="w-5 h-5 text-[#f59e0b]" />
                  </div>
                  <p className="text-sm text-gray-400 mb-2">R$ 49/mês</p>
                  <p className="text-2xl font-bold text-[#24c25e]">
                    {users.filter(u => getPermissionTags(u.permissions).includes('GRIND')).length}
                  </p>
                  <p className="text-xs text-gray-500">usuários ativos</p>
                </CardContent>
              </Card>

              <Card className="bg-gray-800 border-gray-700">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-white font-semibold">Premium</h3>
                    <Gem className="w-5 h-5 text-[#8b5cf6]" />
                  </div>
                  <p className="text-sm text-gray-400 mb-2">R$ 97/mês</p>
                  <p className="text-2xl font-bold text-[#8b5cf6]">
                    {users.filter(u => getPermissionTags(u.permissions).includes('ANALISE_DB')).length}
                  </p>
                  <p className="text-xs text-gray-500">usuários ativos</p>
                </CardContent>
              </Card>

              <Card className="bg-gray-800 border-gray-700">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-white font-semibold">Pro</h3>
                    <Crown className="w-5 h-5 text-[#f59e0b]" />
                  </div>
                  <p className="text-sm text-gray-400 mb-2">R$ 197/mês</p>
                  <p className="text-2xl font-bold text-[#f59e0b]">
                    {users.filter(u => getPermissionTags(u.permissions).includes('PREMIUM')).length}
                  </p>
                  <p className="text-xs text-gray-500">usuários ativos</p>
                </CardContent>
              </Card>
            </div>

            {/* Subscription Management Table */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">Gestão de Assinaturas</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left p-4 text-white font-semibold">Usuário</th>
                        <th className="text-left p-4 text-white font-semibold">Plano</th>
                        <th className="text-left p-4 text-white font-semibold">Status</th>
                        <th className="text-left p-4 text-white font-semibold">Expira em</th>
                        <th className="text-left p-4 text-white font-semibold">Última Atividade</th>
                        <th className="text-left p-4 text-white font-semibold">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => {
                        const tags = getPermissionTags(user.permissions);
                        const plan = tags.includes('PREMIUM') ? 'Pro' : tags.includes('ANALISE_DB') ? 'Premium' : 'Básico';
                        const planColor = plan === 'Pro' ? 'text-[#f59e0b]' : plan === 'Premium' ? 'text-[#8b5cf6]' : 'text-[#24c25e]';
                        
                        return (
                          <tr key={user.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                            <td className="p-4">
                              <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
                                  <span className="text-white text-sm font-medium">
                                    {user.firstName?.charAt(0) || user.email.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                                <div>
                                  <p className="text-white font-medium">{user.firstName} {user.lastName}</p>
                                  <p className="text-sm text-gray-400">{user.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="p-4">
                              <Badge className={`${planColor} bg-transparent border-current`}>
                                {plan}
                              </Badge>
                            </td>
                            <td className="p-4">
                              {getStatusBadge(user.status)}
                            </td>
                            <td className="p-4 text-gray-300">
                              {user.status === 'active' ? '15 dias' : 'Expirado'}
                            </td>
                            <td className="p-4 text-gray-300">
                              {user.lastLogin ? (
                                <HumanizedDate date={user.lastLogin} />
                              ) : (
                                'Nunca'
                              )}
                            </td>
                            <td className="p-4">
                              <div className="flex space-x-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-gray-600 text-gray-300 hover:bg-gray-700"
                                  onClick={() => {
                                    setExtendSubscriptionUser(user);
                                  }}
                                >
                                  <Settings className="w-4 h-4 mr-1" />
                                  Estender
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-gray-600 text-gray-300 hover:bg-gray-700"
                                  onClick={() => openNewEditModal(user)}
                                >
                                  <Edit className="w-4 h-4 mr-1" />
                                  Editar
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="permissions" className="space-y-6">
            <PermissionManager />
          </TabsContent>

          <TabsContent value="activity" className="space-y-6">
            <RealtimeMonitoring />
          </TabsContent>

        </Tabs>

        {/* MODAL EDITAR USUÁRIO MELHORADO */}
        <EditUserModal
          user={editingUser}
          isOpen={isNewEditModalOpen}
          onClose={() => {
            setIsNewEditModalOpen(false);
            setEditingUser(null);
          }}
          onSave={async (userData) => {
            try {
              // TODO: Implementar lógica completa de salvar usuário
              console.log('Salvando usuário:', userData);
              // await apiRequest('PUT', `/api/admin/users/${userData.id}`, userData);
              // queryClient.invalidateQueries(['/api/admin/users']);
              toast({
                title: "Usuário salvo com sucesso",
                description: "As alterações foram aplicadas.",
                variant: "default",
              });
              setIsNewEditModalOpen(false);
              setEditingUser(null);
            } catch (error) {
              console.error('Erro ao salvar usuário:', error);
              toast({
                title: "Erro ao salvar usuário",
                description: "Ocorreu um erro ao salvar as alterações.",
                variant: "destructive",
              });
            }
          }}
        />
      </div>
    </div>
  );
};

export default AdminUsers;
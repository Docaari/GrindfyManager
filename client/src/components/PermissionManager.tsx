import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Users, 
  Shield, 
  Check, 
  X, 
  Edit, 
  Save, 
  RotateCcw,
  Filter,
  ChevronDown,
  ChevronRight,
  Crown,
  Star,
  Zap,
  UserCheck
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  status: 'active' | 'inactive' | 'blocked';
  permissions: string[];
}

interface PermissionProfile {
  name: string;
  description: string;
  permissions: string[];
  color: string;
}

interface PermissionProfiles {
  [key: string]: PermissionProfile;
}

const PermissionManager: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>('basico');
  const [showMatrix, setShowMatrix] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Buscar usuários
  const { data: users = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ['/api/admin/users'],
    queryFn: () => apiRequest('/api/admin/users')
  });

  // Buscar perfis de permissões
  const { data: profiles = {}, isLoading: profilesLoading } = useQuery<PermissionProfiles>({
    queryKey: ['/api/admin/permission-profiles'],
    queryFn: () => apiRequest('/api/admin/permission-profiles')
  });

  // Aplicar permissões em lote
  const applyPermissionsMutation = useMutation({
    mutationFn: ({ userIds, profileName, permissions }: { 
      userIds: string[]; 
      profileName: string; 
      permissions: string[] 
    }) => 
      apiRequest('/api/admin/apply-permissions-batch', {
        method: 'POST',
        body: JSON.stringify({ userIds, profileName, permissions })
      }),
    onSuccess: (data) => {
      toast({ 
        title: 'Permissões aplicadas com sucesso!', 
        description: `Atualizados ${data.updatedUsers} usuários com perfil ${data.profile}` 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      setSelectedUsers([]);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Erro ao aplicar permissões', 
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const handleUserSelection = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSelectAll = () => {
    const filteredUsers = users.filter(user => 
      filterStatus === 'all' || user.status === filterStatus
    );
    setSelectedUsers(filteredUsers.map(user => user.id));
  };

  const handleDeselectAll = () => {
    setSelectedUsers([]);
  };

  const handleApplyPermissions = () => {
    if (selectedUsers.length === 0) {
      toast({ 
        title: 'Nenhum usuário selecionado', 
        description: 'Selecione pelo menos um usuário para aplicar permissões',
        variant: 'destructive'
      });
      return;
    }

    const profile = profiles[selectedProfile];
    if (!profile) {
      toast({ 
        title: 'Perfil não encontrado', 
        description: 'Selecione um perfil válido',
        variant: 'destructive'
      });
      return;
    }

    applyPermissionsMutation.mutate({
      userIds: selectedUsers,
      profileName: profile.name,
      permissions: profile.permissions
    });
  };

  const getProfileIcon = (profileKey: string) => {
    switch (profileKey) {
      case 'basico': return <UserCheck className="h-4 w-4" />;
      case 'premium': return <Star className="h-4 w-4" />;
      case 'pro': return <Zap className="h-4 w-4" />;
      case 'admin': return <Crown className="h-4 w-4" />;
      default: return <Shield className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      case 'blocked': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredUsers = users.filter(user => 
    filterStatus === 'all' || user.status === filterStatus
  );

  if (usersLoading || profilesLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com controles */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestão Rápida de Permissões</h2>
          <p className="text-gray-600">Aplicar perfis de permissão para múltiplos usuários</p>
        </div>
        <div className="flex items-center space-x-4">
          <Button 
            variant="outline" 
            onClick={() => setShowMatrix(!showMatrix)}
            className="flex items-center space-x-2"
          >
            {showMatrix ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span>Visualização Matrix</span>
          </Button>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrar por status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os usuários</SelectItem>
              <SelectItem value="active">Apenas ativos</SelectItem>
              <SelectItem value="inactive">Apenas inativos</SelectItem>
              <SelectItem value="blocked">Apenas bloqueados</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Perfis de Permissão */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(profiles).map(([key, profile]) => (
          <Card 
            key={key} 
            className={`cursor-pointer transition-all ${
              selectedProfile === key 
                ? 'ring-2 ring-blue-500 bg-blue-50' 
                : 'hover:shadow-md'
            }`}
            onClick={() => setSelectedProfile(key)}
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center space-x-2 text-lg">
                <div className={`p-2 rounded-lg`} style={{ backgroundColor: profile.color + '20' }}>
                  {getProfileIcon(key)}
                </div>
                <span>{profile.name}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-3">{profile.description}</p>
              <div className="flex flex-wrap gap-1">
                {profile.permissions.slice(0, 3).map((permission) => (
                  <Badge key={permission} variant="secondary" className="text-xs">
                    {permission.replace('_', ' ')}
                  </Badge>
                ))}
                {profile.permissions.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{profile.permissions.length - 3} mais
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Controles de Seleção */}
      <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-700">
            {selectedUsers.length} usuário(s) selecionado(s)
          </span>
          <Button variant="outline" size="sm" onClick={handleSelectAll}>
            Selecionar Todos
          </Button>
          <Button variant="outline" size="sm" onClick={handleDeselectAll}>
            Desselecionar Todos
          </Button>
        </div>
        <div className="flex items-center space-x-4">
          <Select value={selectedProfile} onValueChange={setSelectedProfile}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Selecionar perfil" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(profiles).map(([key, profile]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center space-x-2">
                    {getProfileIcon(key)}
                    <span>{profile.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
            onClick={handleApplyPermissions}
            disabled={selectedUsers.length === 0 || applyPermissionsMutation.isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {applyPermissionsMutation.isPending ? (
              <>
                <RotateCcw className="h-4 w-4 mr-2 animate-spin" />
                Aplicando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Aplicar Permissões
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Lista de Usuários */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Users className="h-5 w-5 mr-2" />
            Usuários ({filteredUsers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredUsers.map((user) => (
              <div 
                key={user.id} 
                className={`flex items-center justify-between p-4 rounded-lg border transition-all ${
                  selectedUsers.includes(user.id) 
                    ? 'bg-blue-50 border-blue-200' 
                    : 'bg-white border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center space-x-4">
                  <Checkbox 
                    checked={selectedUsers.includes(user.id)}
                    onCheckedChange={() => handleUserSelection(user.id)}
                  />
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                      <span className="text-sm font-medium text-gray-600">
                        {user.firstName?.[0] || user.email[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {user.firstName} {user.lastName} 
                        {!user.firstName && !user.lastName && user.email}
                      </p>
                      <p className="text-sm text-gray-600">{user.email}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <Badge className={getStatusColor(user.status)}>
                    {user.status}
                  </Badge>
                  <div className="flex items-center space-x-2">
                    <Shield className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      {user.permissions?.length || 0} permissões
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Visualização Matrix (expandível) */}
      {showMatrix && (
        <Card>
          <CardHeader>
            <CardTitle>Matrix de Permissões</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-gray-500">
              <Shield className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>Visualização Matrix em desenvolvimento</p>
              <p className="text-sm">Aqui será exibida uma tabela com usuários vs permissões</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PermissionManager;
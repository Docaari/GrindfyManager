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
import PermissionPreviewModal from './PermissionPreviewModal';
import PermissionProgress from './PermissionProgress';
import SelectionCounter from './SelectionCounter';
import { Gem } from 'lucide-react';

interface User {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  status: 'active' | 'inactive' | 'blocked';
  permissions: string[];
}

interface Permission {
  id: string;
  name: string;
  description: string;
  category: string;
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

const AVAILABLE_PERMISSIONS: Permission[] = [
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

const PermissionManager: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>('basico');
  const [showMatrix, setShowMatrix] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  // Estados para UX melhorada
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedUsers, setProcessedUsers] = useState<string[]>([]);
  const [currentProcessingUser, setCurrentProcessingUser] = useState<string | undefined>();
  const [progress, setProgress] = useState(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState(0);

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

    setShowPreviewModal(true);
  };

  const handleConfirmApplyPermissions = async () => {
    const profile = profiles[selectedProfile];
    if (!profile) return;

    setShowPreviewModal(false);
    setIsProcessing(true);
    setProcessedUsers([]);
    setProgress(0);
    setEstimatedTimeRemaining(selectedUsers.length * 0.5);

    try {
      // Simular processamento sequencial com feedback em tempo real
      for (let i = 0; i < selectedUsers.length; i++) {
        const userId = selectedUsers[i];
        setCurrentProcessingUser(userId);
        
        // Simular delay de processamento
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Atualizar estado de progresso
        setProcessedUsers(prev => [...prev, userId]);
        setProgress((i + 1) / selectedUsers.length * 100);
        setEstimatedTimeRemaining((selectedUsers.length - i - 1) * 0.5);
      }

      // Aplicar permissões em lote
      await applyPermissionsMutation.mutateAsync({
        userIds: selectedUsers,
        profileName: selectedProfile,
        permissions: profile.permissions
      });

      setIsProcessing(false);
      setSelectedUsers([]);
      setProcessedUsers([]);
      setCurrentProcessingUser(undefined);
      setProgress(0);
      
    } catch (error) {
      setIsProcessing(false);
      setProcessedUsers([]);
      setCurrentProcessingUser(undefined);
      setProgress(0);
    }
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

  const selectedUsersData = users.filter(user => selectedUsers.includes(user.id));

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

      {/* Feedback de Progresso */}
      <PermissionProgress
        isProcessing={isProcessing}
        selectedUsers={selectedUsersData}
        processedUsers={processedUsers}
        currentUser={currentProcessingUser}
        profileName={profiles[selectedProfile]?.name || ''}
        permissionCount={profiles[selectedProfile]?.permissions.length || 0}
        progress={progress}
        estimatedTimeRemaining={estimatedTimeRemaining}
      />

      {/* Perfis de Permissão */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(profiles).map(([key, profile]) => (
          <Card 
            key={key} 
            className={`cursor-pointer transition-all hover:shadow-md ${
              selectedProfile === key ? 'ring-2 ring-blue-500' : ''
            }`}
            onClick={() => setSelectedProfile(key)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {getProfileIcon(key)}
                  <div>
                    <h3 className="font-semibold text-sm">{profile.name}</h3>
                    <p className="text-xs text-gray-600">{profile.description}</p>
                  </div>
                </div>
                <div className={`w-3 h-3 rounded-full ${profile.color}`}></div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-xs text-gray-500">
                {profile.permissions.length} permissões
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Seleção de Usuários */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>Usuários ({filteredUsers.length})</span>
            </CardTitle>
            <div className="flex items-center space-x-4">
              <SelectionCounter
                selectedCount={selectedUsers.length}
                totalCount={filteredUsers.length}
                onClearSelection={handleDeselectAll}
              />
              <div className="flex items-center space-x-2">
                <Button variant="outline" size="sm" onClick={handleSelectAll}>
                  <Check className="h-4 w-4 mr-1" />
                  Selecionar Todos
                </Button>
                
                {/* Botões de seleção rápida por nível */}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    const basicUsers = filteredUsers.filter(user => 
                      user.permissions.length >= 1 && user.permissions.length <= 3
                    );
                    setSelectedUsers(basicUsers.map(user => user.id));
                  }}
                  className="flex items-center space-x-1"
                >
                  <Star className="h-3 w-3" />
                  <span>Básicos</span>
                </Button>
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    const premiumUsers = filteredUsers.filter(user => 
                      user.permissions.length >= 4 && user.permissions.length <= 10
                    );
                    setSelectedUsers(premiumUsers.map(user => user.id));
                  }}
                  className="flex items-center space-x-1"
                >
                  <Crown className="h-3 w-3" />
                  <span>Premium</span>
                </Button>
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    const proUsers = filteredUsers.filter(user => 
                      user.permissions.length >= 11 && 
                      !user.permissions.some(p => p.includes('admin'))
                    );
                    setSelectedUsers(proUsers.map(user => user.id));
                  }}
                  className="flex items-center space-x-1"
                >
                  <Gem className="h-3 w-3" />
                  <span>Pro</span>
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className={`p-3 border rounded-lg cursor-pointer transition-all hover:shadow-sm ${
                  selectedUsers.includes(user.id) ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'
                }`}
                onClick={() => handleUserSelection(user.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      checked={selectedUsers.includes(user.id)}
                      onChange={() => handleUserSelection(user.id)}
                    />
                    <div>
                      <div className="font-medium text-sm">{user.username || user.email}</div>
                      <div className="text-xs text-gray-500">{user.email}</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end space-y-1">
                    <Badge className={`text-xs ${getStatusColor(user.status)}`}>
                      {user.status}
                    </Badge>
                    <div className="text-xs text-gray-500">
                      {user.permissions.length} permissões
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Botão de Aplicar */}
      <div className="flex justify-center">
        <Button 
          onClick={handleApplyPermissions}
          disabled={selectedUsers.length === 0 || isProcessing}
          className="px-8 py-3 text-lg"
        >
          <Shield className="h-5 w-5 mr-2" />
          Aplicar Permissões ({selectedUsers.length} usuários)
        </Button>
      </div>

      {/* Modal de Preview */}
      <PermissionPreviewModal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        onConfirm={handleConfirmApplyPermissions}
        selectedUsers={selectedUsersData}
        selectedPermissions={profiles[selectedProfile]?.permissions || []}
        profileName={profiles[selectedProfile]?.name || ''}
        availablePermissions={AVAILABLE_PERMISSIONS}
      />
    </div>
  );
};

export default PermissionManager;
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/queryClient';
import { User, Crown, Shield, Settings, CheckCircle } from 'lucide-react';

interface User {
  id: string;
  userPlatformId: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  status: 'active' | 'inactive' | 'blocked';
  subscriptionPlan: 'trial' | 'active' | 'expired' | 'admin';
  permissions: string[];
}

interface EditUserModalFixedProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onUserUpdated: () => void;
}

const ALL_PERMISSIONS = [
  { id: 'dashboard_access', name: 'Dashboard', category: 'Analytics' },
  { id: 'upload_access', name: 'Import', category: 'Data' },
  { id: 'grade_planner_access', name: 'Grade', category: 'Planejamento' },
  { id: 'grind_access', name: 'Grind', category: 'Sessões' },
  { id: 'grind_session_access', name: 'Grind Sessions', category: 'Sessões' },
  { id: 'warm_up_access', name: 'Warm Up', category: 'Sessões' },
  { id: 'weekly_planner_access', name: 'Calendario', category: 'Planejamento' },
  { id: 'studies_access', name: 'Estudos', category: 'Premium' },
  { id: 'performance_access', name: 'Analytics', category: 'Analytics' },
  { id: 'admin_full', name: 'Admin Full', category: 'Admin' },
  { id: 'user_management', name: 'Usuarios', category: 'Admin' },
  { id: 'system_config', name: 'Bugs', category: 'Admin' },
  { id: 'analytics_access', name: 'Ferramentas', category: 'Analytics' },
  { id: 'mental_prep_access', name: 'Biblioteca', category: 'Premium' },
  { id: 'user_analytics', name: 'User Analytics', category: 'Admin' },
  { id: 'executive_reports', name: 'Executive Reports', category: 'Admin' },
];

const PREDEFINED_ROLES = {
  'trial': {
    name: 'Trial',
    description: 'Periodo de teste - 14 dias com acesso total',
    permissions: [],
    tags: ['Trial 14 dias'],
    icon: User,
    color: 'amber'
  },
  'active': {
    name: 'Assinante',
    description: 'Assinatura ativa - acesso total',
    permissions: [],
    tags: ['Acesso completo'],
    icon: Crown,
    color: 'green'
  },
  'expired': {
    name: 'Expirado',
    description: 'Trial ou assinatura expirada',
    permissions: [],
    tags: ['Sem acesso'],
    icon: Shield,
    color: 'red'
  },
  'admin': {
    name: 'Admin',
    description: 'Acesso total permanente + funcionalidades administrativas',
    permissions: ['admin_full', 'user_management', 'system_config', 'analytics_access', 'user_analytics', 'executive_reports'],
    tags: ['Admin - acesso total'],
    icon: Settings,
    color: 'red'
  }
};

export default function EditUserModalFixed({ isOpen, onClose, user, onUserUpdated }: EditUserModalFixedProps) {
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    firstName: '',
    lastName: '',
    password: '',
    status: 'active' as string,
    subscriptionPlan: 'trial' as string,
    permissions: [] as string[]
  });
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'predefined' | 'custom'>('predefined');
  const { toast } = useToast();
  const { user: currentUser, reloadUserPermissions } = useAuth();

  useEffect(() => {
    if (user) {
      setFormData({
        email: user.email || '',
        username: user.username || '',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        password: '',
        status: (user.status || 'active') as 'active' | 'blocked',
        subscriptionPlan: (user.subscriptionPlan || 'trial') as 'trial' | 'active' | 'expired' | 'admin',
        permissions: user.permissions || []
      });
    } else {
      setFormData({
        email: '',
        username: '',
        firstName: '',
        lastName: '',
        password: '',
        status: 'active',
        subscriptionPlan: 'trial',
        permissions: []
      });
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validações básicas
    if (!formData.email || !formData.username) {
      toast({
        title: "Campos obrigatórios",
        description: "Email e username são obrigatórios.",
        variant: "destructive",
      });
      return;
    }
    
    if (!user && !formData.password) {
      toast({
        title: "Senha obrigatória",
        description: "A senha é obrigatória para criar um novo usuário.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      if (user) {
        // Editar usuário existente
        
        await apiRequest('PUT', `/api/admin/users/${user.userPlatformId}`, formData);
        
        // CORREÇÃO CRÍTICA: Verificar se o usuário atual foi editado
        if (user.userPlatformId === currentUser?.userPlatformId) {
          try {
            await reloadUserPermissions();
            toast({
              title: "Permissões atualizadas",
              description: "Suas permissões foram atualizadas.",
            });
          } catch (error) {
            toast({
              title: "Aviso",
              description: "Permissões alteradas. Faça logout e login novamente para ver todas as mudanças.",
              variant: "default",
            });
          }
        }
        
        toast({
          title: "Usuário atualizado",
          description: "As informações do usuário foram atualizadas com sucesso.",
        });
      } else {
        // Criar novo usuário
        
        await apiRequest('POST', '/api/admin/users', formData);
        
        toast({
          title: "Usuário criado",
          description: "Novo usuário criado com sucesso.",
        });
      }
      
      onUserUpdated();
      onClose();
    } catch (error: any) {
      toast({
        title: user ? "Erro ao atualizar usuário" : "Erro ao criar usuário",
        description: error.message || "Ocorreu um erro inesperado.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyProfile = (profileKey: string) => {
    const profile = PREDEFINED_ROLES[profileKey as keyof typeof PREDEFINED_ROLES];
    if (profile) {
      setFormData(prev => ({
        ...prev,
        subscriptionPlan: profileKey as any,
        permissions: profile.permissions
      }));
      
      toast({
        title: "Perfil aplicado",
        description: `Perfil ${profile.name} aplicado com sucesso.`,
      });
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

  const getTagColor = (index: number) => {
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-yellow-500', 'bg-pink-500', 'bg-indigo-500'];
    return colors[index % colors.length];
  };



  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl bg-gray-900 border-gray-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">
            {user ? 'Editar Usuário' : 'Criar Novo Usuário'}
          </DialogTitle>
          <DialogDescription className="text-gray-300">
            {user ? 'Edite as informações e permissões do usuário' : 'Crie um novo usuário com suas informações e permissões'}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Informações Básicas */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email" className="text-green-400 font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className="bg-gray-800 border-gray-600 text-white focus:border-green-500"
              />
            </div>
            <div>
              <Label htmlFor="username" className="text-green-400 font-medium">Username</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                className="bg-gray-800 border-gray-600 text-white focus:border-green-500"
              />
            </div>
            <div>
              <Label htmlFor="firstName" className="text-green-400 font-medium">Nome</Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                className="bg-gray-800 border-gray-600 text-white focus:border-green-500"
              />
            </div>
            <div>
              <Label htmlFor="lastName" className="text-green-400 font-medium">Sobrenome</Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                className="bg-gray-800 border-gray-600 text-white focus:border-green-500"
              />
            </div>
            {!user && (
              <div className="col-span-2">
                <Label htmlFor="password" className="text-green-400 font-medium">Senha *</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  className="bg-gray-800 border-gray-600 text-white focus:border-green-500"
                  placeholder="Senha obrigatória para novos usuários"
                />
              </div>
            )}
          </div>

          {/* Seletor de Abas */}
          <div className="flex space-x-4 border-b border-gray-700">
            <button
              onClick={() => setActiveTab('predefined')}
              className={`pb-2 px-4 font-medium transition-colors ${
                activeTab === 'predefined'
                  ? 'border-b-2 border-green-500 text-green-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Perfis Predefinidos
            </button>
            <button
              onClick={() => setActiveTab('custom')}
              className={`pb-2 px-4 font-medium transition-colors ${
                activeTab === 'custom'
                  ? 'border-b-2 border-green-500 text-green-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Permissões Personalizadas
            </button>
          </div>

          {/* Perfis Predefinidos */}
          {activeTab === 'predefined' && (
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(PREDEFINED_ROLES).map(([key, profile]) => {
                const IconComponent = profile.icon;
                const isSelected = formData.subscriptionPlan === key;
                
                return (
                  <Card 
                    key={key} 
                    className={`bg-gray-800 border-gray-700 hover:bg-gray-750 transition-all duration-200 cursor-pointer ${
                      isSelected ? 'ring-2 ring-green-500' : ''
                    }`}
                    onClick={() => handleApplyProfile(key)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <IconComponent className={`h-5 w-5 text-${profile.color}-400`} />
                          <CardTitle className="text-white">{profile.name}</CardTitle>
                        </div>
                        {isSelected && <CheckCircle className="h-5 w-5 text-green-500" />}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-300 text-sm mb-3">{profile.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {profile.tags.map((tag, index) => (
                          <Badge 
                            key={index}
                            className={`${getTagColor(index)} text-white text-xs px-2 py-1`}
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Permissões Personalizadas */}
          {activeTab === 'custom' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {ALL_PERMISSIONS.map(permission => (
                  <div key={permission.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={permission.id}
                      checked={formData.permissions.includes(permission.id)}
                      onCheckedChange={() => handlePermissionToggle(permission.id)}
                      className="border-gray-600 data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500"
                    />
                    <Label
                      htmlFor={permission.id}
                      className="text-white cursor-pointer flex-1"
                    >
                      {permission.name}
                      <span className="text-gray-400 text-xs ml-1">({permission.category})</span>
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status */}
          <div>
            <Label htmlFor="status" className="text-green-400 font-medium">Status</Label>
            <Select value={formData.status} onValueChange={(value) => setFormData(prev => ({ ...prev, status: value as any }))}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                <SelectItem value="active" className="text-white">Ativo</SelectItem>
                <SelectItem value="inactive" className="text-white">Inativo</SelectItem>
                <SelectItem value="blocked" className="text-white">Bloqueado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Botões */}
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-gray-600 text-gray-300 hover:text-white hover:bg-gray-800"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              onClick={handleSubmit}
              disabled={isLoading}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isLoading ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
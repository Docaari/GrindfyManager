import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';

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

interface EditUserData {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'moderator';
  status: 'active' | 'inactive' | 'suspended';
  permissions: {
    dashboard: boolean;
    analytics: boolean;
    planning: boolean;
    liveSession: boolean;
    mentalPrep: boolean;
    tournamentLibrary: boolean;
    gradeCoach: boolean;
    dataImport: boolean;
    userManagement: boolean;
    subscriptionManagement: boolean;
  };
  profile: {
    avatar?: string;
    phone?: string;
    country: string;
    timezone: string;
    language: 'pt-BR' | 'en-US';
  };
  pokerProfile: {
    preferredSites: string[];
    playingStyle: 'MTT' | 'SNG' | 'Cash' | 'Mixed';
    experience: 'Beginner' | 'Intermediate' | 'Advanced' | 'Professional';
    bankrollGoal?: number;
  };
  createdAt: Date;
  lastLogin?: Date;
}

interface EditUserModalProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (userData: EditUserData) => void;
}

const EditUserModal: React.FC<EditUserModalProps> = ({
  user,
  isOpen,
  onClose,
  onSave
}) => {
  const [formData, setFormData] = useState<EditUserData>({
    id: '',
    name: '',
    email: '',
    role: 'user',
    status: 'active',
    permissions: {
      dashboard: false,
      analytics: false,
      planning: false,
      liveSession: false,
      mentalPrep: false,
      tournamentLibrary: false,
      gradeCoach: false,
      dataImport: false,
      userManagement: false,
      subscriptionManagement: false
    },
    profile: {
      phone: '',
      country: 'BR',
      timezone: 'America/Sao_Paulo',
      language: 'pt-BR'
    },
    pokerProfile: {
      preferredSites: [],
      playingStyle: 'MTT',
      experience: 'Beginner',
      bankrollGoal: undefined
    },
    createdAt: new Date(),
    lastLogin: undefined
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user && isOpen) {
      setFormData({
        id: user.id,
        name: user.firstName || '',
        email: user.email,
        role: user.permissions.includes('admin_full') ? 'admin' : 'user',
        status: user.status === 'blocked' ? 'suspended' : user.status,
        permissions: {
          dashboard: user.permissions.includes('dashboard_access'),
          analytics: user.permissions.includes('analytics_access'),
          planning: user.permissions.includes('weekly_planner_access'),
          liveSession: user.permissions.includes('grind_session_access'),
          mentalPrep: user.permissions.includes('mental_prep_access'),
          tournamentLibrary: user.permissions.includes('performance_access'),
          gradeCoach: user.permissions.includes('grade_planner_access'),
          dataImport: user.permissions.includes('upload_access'),
          userManagement: user.permissions.includes('user_management'),
          subscriptionManagement: user.permissions.includes('admin_full')
        },
        profile: {
          phone: '',
          country: 'BR',
          timezone: 'America/Sao_Paulo',
          language: 'pt-BR'
        },
        pokerProfile: {
          preferredSites: [],
          playingStyle: 'MTT',
          experience: 'Beginner',
          bankrollGoal: undefined
        },
        createdAt: new Date(user.createdAt),
        lastLogin: user.lastLogin ? new Date(user.lastLogin) : undefined
      });
    }
  }, [user, isOpen]);

  const handleSave = async () => {
    setLoading(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Erro ao salvar usuário:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateFormData = (updates: Partial<EditUserData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const updatePermissions = (key: keyof EditUserData['permissions'], value: boolean) => {
    setFormData(prev => ({
      ...prev,
      permissions: { ...prev.permissions, [key]: value }
    }));
  };

  const updateProfile = (updates: Partial<EditUserData['profile']>) => {
    setFormData(prev => ({
      ...prev,
      profile: { ...prev.profile, ...updates }
    }));
  };

  const updatePokerProfile = (updates: Partial<EditUserData['pokerProfile']>) => {
    setFormData(prev => ({
      ...prev,
      pokerProfile: { ...prev.pokerProfile, ...updates }
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            🎯 Editar Usuário - {formData.name || 'Novo Usuário'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Seção 1: Dados Básicos */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <span className="text-lg font-semibold">📊 Dados Básicos</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-gray-300">Nome Completo</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => updateFormData({ name: e.target.value })}
                  className="bg-gray-800 border-gray-600 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-300">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateFormData({ email: e.target.value })}
                  className="bg-gray-800 border-gray-600 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status" className="text-gray-300">Status da Conta</Label>
                <Select 
                  value={formData.status} 
                  onValueChange={(value: 'active' | 'inactive' | 'suspended') => updateFormData({ status: value })}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-600">
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                    <SelectItem value="suspended">Suspenso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role" className="text-gray-300">Função</Label>
                <Select 
                  value={formData.role} 
                  onValueChange={(value: 'admin' | 'user' | 'moderator') => updateFormData({ role: value })}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-600">
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="moderator">Moderador</SelectItem>
                    <SelectItem value="user">Usuário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator className="bg-gray-700" />

          {/* Seção 2: Permissões de Funcionalidades */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <span className="text-lg font-semibold">🔐 Permissões de Funcionalidades</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="dashboard" className="text-gray-300">Dashboard Analítico</Label>
                <Switch
                  id="dashboard"
                  checked={formData.permissions.dashboard}
                  onCheckedChange={(checked) => updatePermissions('dashboard', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="analytics" className="text-gray-300">Análise Avançada</Label>
                <Switch
                  id="analytics"
                  checked={formData.permissions.analytics}
                  onCheckedChange={(checked) => updatePermissions('analytics', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="planning" className="text-gray-300">Planejamento Semanal</Label>
                <Switch
                  id="planning"
                  checked={formData.permissions.planning}
                  onCheckedChange={(checked) => updatePermissions('planning', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="liveSession" className="text-gray-300">Sessão Live</Label>
                <Switch
                  id="liveSession"
                  checked={formData.permissions.liveSession}
                  onCheckedChange={(checked) => updatePermissions('liveSession', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="mentalPrep" className="text-gray-300">Preparação Mental</Label>
                <Switch
                  id="mentalPrep"
                  checked={formData.permissions.mentalPrep}
                  onCheckedChange={(checked) => updatePermissions('mentalPrep', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="tournamentLibrary" className="text-gray-300">Biblioteca de Torneios</Label>
                <Switch
                  id="tournamentLibrary"
                  checked={formData.permissions.tournamentLibrary}
                  onCheckedChange={(checked) => updatePermissions('tournamentLibrary', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="gradeCoach" className="text-gray-300">Grade Coach</Label>
                <Switch
                  id="gradeCoach"
                  checked={formData.permissions.gradeCoach}
                  onCheckedChange={(checked) => updatePermissions('gradeCoach', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="dataImport" className="text-gray-300">Import de Dados</Label>
                <Switch
                  id="dataImport"
                  checked={formData.permissions.dataImport}
                  onCheckedChange={(checked) => updatePermissions('dataImport', checked)}
                />
              </div>
              {formData.role === 'admin' && (
                <>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="userManagement" className="text-gray-300">Gerenciamento de Usuários</Label>
                    <Switch
                      id="userManagement"
                      checked={formData.permissions.userManagement}
                      onCheckedChange={(checked) => updatePermissions('userManagement', checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="subscriptionManagement" className="text-gray-300">Gerenciamento de Assinaturas</Label>
                    <Switch
                      id="subscriptionManagement"
                      checked={formData.permissions.subscriptionManagement}
                      onCheckedChange={(checked) => updatePermissions('subscriptionManagement', checked)}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <Separator className="bg-gray-700" />

          {/* Seção 3: Perfil Pessoal */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <span className="text-lg font-semibold">👤 Perfil Pessoal</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-gray-300">Telefone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.profile.phone}
                  onChange={(e) => updateProfile({ phone: e.target.value })}
                  className="bg-gray-800 border-gray-600 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country" className="text-gray-300">País</Label>
                <Select 
                  value={formData.profile.country} 
                  onValueChange={(value) => updateProfile({ country: value })}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-600">
                    <SelectItem value="BR">Brasil</SelectItem>
                    <SelectItem value="US">Estados Unidos</SelectItem>
                    <SelectItem value="CA">Canadá</SelectItem>
                    <SelectItem value="GB">Reino Unido</SelectItem>
                    <SelectItem value="DE">Alemanha</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone" className="text-gray-300">Fuso Horário</Label>
                <Select 
                  value={formData.profile.timezone} 
                  onValueChange={(value) => updateProfile({ timezone: value })}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-600">
                    <SelectItem value="America/Sao_Paulo">São Paulo (UTC-3)</SelectItem>
                    <SelectItem value="America/New_York">Nova York (UTC-5)</SelectItem>
                    <SelectItem value="Europe/London">Londres (UTC+0)</SelectItem>
                    <SelectItem value="Europe/Berlin">Berlim (UTC+1)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="language" className="text-gray-300">Idioma</Label>
                <Select 
                  value={formData.profile.language} 
                  onValueChange={(value: 'pt-BR' | 'en-US') => updateProfile({ language: value })}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-600">
                    <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                    <SelectItem value="en-US">English (US)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator className="bg-gray-700" />

          {/* Seção 4: Perfil de Poker */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <span className="text-lg font-semibold">♠️ Perfil de Poker</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="playingStyle" className="text-gray-300">Estilo de Jogo</Label>
                <Select 
                  value={formData.pokerProfile.playingStyle} 
                  onValueChange={(value: 'MTT' | 'SNG' | 'Cash' | 'Mixed') => updatePokerProfile({ playingStyle: value })}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-600">
                    <SelectItem value="MTT">Multi-Table Tournament</SelectItem>
                    <SelectItem value="SNG">Sit & Go</SelectItem>
                    <SelectItem value="Cash">Cash Game</SelectItem>
                    <SelectItem value="Mixed">Misto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="experience" className="text-gray-300">Nível de Experiência</Label>
                <Select 
                  value={formData.pokerProfile.experience} 
                  onValueChange={(value: 'Beginner' | 'Intermediate' | 'Advanced' | 'Professional') => updatePokerProfile({ experience: value })}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-600">
                    <SelectItem value="Beginner">Iniciante</SelectItem>
                    <SelectItem value="Intermediate">Intermediário</SelectItem>
                    <SelectItem value="Advanced">Avançado</SelectItem>
                    <SelectItem value="Professional">Profissional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="bankrollGoal" className="text-gray-300">Meta de Bankroll (Opcional)</Label>
                <Input
                  id="bankrollGoal"
                  type="number"
                  value={formData.pokerProfile.bankrollGoal || ''}
                  onChange={(e) => updatePokerProfile({ bankrollGoal: e.target.value ? Number(e.target.value) : undefined })}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="Ex: 10000"
                />
              </div>
            </div>
          </div>

          <Separator className="bg-gray-700" />

          {/* Seção 5: Informações do Sistema */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <span className="text-lg font-semibold">ℹ️ Informações do Sistema</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-300">Data de Criação</Label>
                <Input
                  value={formData.createdAt.toLocaleDateString('pt-BR')}
                  readOnly
                  className="bg-gray-700 border-gray-600 text-gray-400"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">Último Login</Label>
                <Input
                  value={formData.lastLogin?.toLocaleDateString('pt-BR') || 'Nunca'}
                  readOnly
                  className="bg-gray-700 border-gray-600 text-gray-400"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex justify-end space-x-2 mt-6 pt-4 border-t border-gray-700">
          <Button 
            variant="outline" 
            onClick={onClose}
            className="bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleSave}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {loading ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditUserModal;
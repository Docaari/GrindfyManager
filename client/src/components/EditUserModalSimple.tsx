import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { 
  Edit, 
  Mail, 
  User, 
  Shield, 
  Eye, 
  EyeOff, 
  Clock,
  Calendar,
  Hash,
  Loader2,
  Save,
  X,
  UserCog,
  Trash2,
  BarChart,
  Gamepad,
  Crown
} from 'lucide-react';
import { 
  PermissionTag, 
  getPermissionTags, 
  getPermissionsFromTags, 
  type PermissionTagType 
} from './PermissionTag';
import HumanizedDate from './HumanizedDate';

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

interface EditUserModalProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (userData: Partial<User>, newPassword?: string) => Promise<void>;
  onDeleteUser?: (userId: string) => Promise<void>;
}

const TAG_CONFIGS = {
  ANALISE_DB: {
    name: 'ANALISE DB',
    icon: BarChart,
    color: '#3b82f6',
    description: 'Acesso a análises e dados',
    permissions: ['dashboard_access', 'performance_access', 'upload_access', 'analytics_access']
  },
  GRIND: {
    name: 'GRIND',
    icon: Gamepad,
    color: '#24c25e',
    description: 'Ferramentas de jogo',
    permissions: ['grind_access', 'warm_up_access', 'mental_prep_access', 'grind_session_access']
  },
  PREMIUM: {
    name: 'PREMIUM',
    icon: Crown,
    color: '#8b5cf6',
    description: 'Recursos avançados',
    permissions: ['weekly_planner_access', 'grade_planner_access', 'studies_access']
  }
};

const EditUserModalSimple: React.FC<EditUserModalProps> = ({ 
  user, 
  isOpen, 
  onClose, 
  onSave, 
  onDeleteUser 
}) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedTags, setSelectedTags] = useState<PermissionTagType[]>([]);
  
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    firstName: '',
    lastName: '',
    status: 'active' as const,
    newPassword: ''
  });

  useEffect(() => {
    if (user) {
      setFormData({
        email: user.email || '',
        username: user.username || '',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        status: user.status || 'active',
        newPassword: ''
      });
      setSelectedTags(getPermissionTags(user.permissions || []));
    }
  }, [user]);

  const handleTagToggle = (tag: PermissionTagType) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const permissions = getPermissionsFromTags(selectedTags);
      
      await onSave(
        {
          ...formData,
          permissions
        },
        formData.newPassword || undefined
      );
      
      toast({
        title: "Sucesso",
        description: "Usuário atualizado com sucesso!",
      });
      
      onClose();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Falha ao atualizar usuário. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !onDeleteUser) return;
    
    const confirmed = window.confirm(
      `Tem certeza que deseja excluir o usuário "${user.email}"? Esta ação não pode ser desfeita.`
    );
    
    if (confirmed) {
      setIsLoading(true);
      try {
        await onDeleteUser(user.id);
        toast({
          title: "Sucesso",
          description: "Usuário excluído com sucesso!",
        });
        onClose();
      } catch (error) {
        toast({
          title: "Erro",
          description: "Falha ao excluir usuário. Tente novamente.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    }
  };

  if (!user) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] bg-gray-900 border-gray-700 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 text-white">
            <UserCog className="h-5 w-5" />
            <span>Editar Usuário</span>
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Informações Básicas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-300">Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className="bg-gray-800 border-gray-700 text-white"
                required
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300">Nome de Usuário</Label>
              <Input
                value={formData.username}
                onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                className="bg-gray-800 border-gray-700 text-white"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-300">Primeiro Nome</Label>
              <Input
                value={formData.firstName}
                onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300">Sobrenome</Label>
              <Input
                value={formData.lastName}
                onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
          </div>

          {/* Status do Usuário */}
          <div className="space-y-2">
            <Label className="text-gray-300">Status</Label>
            <Select value={formData.status} onValueChange={(value: 'active' | 'inactive' | 'blocked') => 
              setFormData(prev => ({ ...prev, status: value }))
            }>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="inactive">Inativo</SelectItem>
                <SelectItem value="blocked">Bloqueado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Nova Senha */}
          <div className="space-y-2">
            <Label className="text-gray-300">Nova Senha (opcional)</Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={formData.newPassword}
                onChange={(e) => setFormData(prev => ({ ...prev, newPassword: e.target.value }))}
                className="bg-gray-800 border-gray-700 text-white pr-10"
                placeholder="Deixe em branco para manter atual"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4 text-gray-400" />
                ) : (
                  <Eye className="h-4 w-4 text-gray-400" />
                )}
              </Button>
            </div>
          </div>

          {/* Tags de Permissões */}
          <div className="space-y-4">
            <Label className="text-gray-300 text-base font-medium">Permissões por Categoria</Label>
            <div className="space-y-4">
              {Object.entries(TAG_CONFIGS).map(([tagKey, config]) => {
                const tag = tagKey as PermissionTagType;
                const Icon = config.icon;
                const isSelected = selectedTags.includes(tag);
                
                return (
                  <div
                    key={tag}
                    className={`
                      p-4 rounded-lg border-2 transition-all duration-200 cursor-pointer
                      ${isSelected 
                        ? 'border-blue-500 bg-blue-500/10' 
                        : 'border-gray-600 bg-gray-800 hover:border-gray-500'
                      }
                    `}
                    onClick={() => handleTagToggle(tag)}
                  >
                    <div className="flex items-center space-x-4">
                      <Checkbox
                        checked={isSelected}
                        onChange={() => handleTagToggle(tag)}
                        className="text-blue-500"
                      />
                      <Icon 
                        className="h-6 w-6" 
                        style={{ color: config.color }}
                      />
                      <div className="flex-1">
                        <div className="font-medium text-white">{config.name}</div>
                        <div className="text-sm text-gray-400">{config.description}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Informações do Usuário */}
          <div className="pt-4 border-t border-gray-700">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Criado em:</span>
                <div className="text-white">
                  <HumanizedDate date={user.createdAt} />
                </div>
              </div>
              <div>
                <span className="text-gray-400">Último login:</span>
                <div className="text-white">
                  <HumanizedDate date={user.lastLogin} />
                </div>
              </div>
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="flex justify-between pt-6">
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir Usuário
            </Button>

            <div className="flex space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isLoading}
                className="border-gray-600 text-gray-300 hover:bg-gray-800"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar Alterações
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditUserModalSimple;
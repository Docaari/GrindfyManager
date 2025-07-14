import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { 
  Edit, 
  Mail, 
  User, 
  Shield, 
  Eye, 
  EyeOff, 
  CheckCircle, 
  XCircle, 
  Settings,
  Clock,
  Calendar,
  Hash,
  Loader2,
  Save,
  X,
  UserCog,
  Trash2
} from 'lucide-react';
import PermissionBadge from './PermissionBadge';
import UserLevelIndicator from './UserLevelIndicator';
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
  onManagePermissions: (user: User) => void;
  onDeleteUser?: (userId: string) => Promise<void>;
}

const PERMISSION_CATEGORIES = {
  admin: 'admin',
  features: 'features', 
  analytics: 'analytics',
  core: 'core'
};

const getUserLevel = (permissions: string[]) => {
  const hasAdmin = permissions.some(p => p.includes('admin'));
  if (hasAdmin) return { level: 'Admin', icon: '👑', color: 'text-purple-600' };
  
  if (permissions.length >= 11) return { level: 'Pro', icon: '💎', color: 'text-blue-600' };
  if (permissions.length >= 4) return { level: 'Premium', icon: '⭐', color: 'text-yellow-600' };
  return { level: 'Básico', icon: '🔰', color: 'text-green-600' };
};

const getPasswordStrength = (password: string) => {
  if (!password) return { strength: 0, label: '', color: '' };
  
  let strength = 0;
  if (password.length >= 8) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[a-z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;
  
  if (strength <= 2) return { strength, label: 'Fraca', color: 'text-red-600' };
  if (strength <= 3) return { strength, label: 'Média', color: 'text-yellow-600' };
  return { strength, label: 'Forte', color: 'text-green-600' };
};

const EditUserModal: React.FC<EditUserModalProps> = ({
  user,
  isOpen,
  onClose,
  onSave,
  onManagePermissions,
  onDeleteUser
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [changePassword, setChangePassword] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    username: '',
    status: 'active' as 'active' | 'inactive' | 'blocked',
    newPassword: ''
  });

  const [validations, setValidations] = useState({
    username: { valid: true, message: '' },
    password: { valid: true, message: '' }
  });

  useEffect(() => {
    if (user) {
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        username: user.username || '',
        status: user.status,
        newPassword: ''
      });
      setChangePassword(false);
      setShowPassword(false);
      setShowDeleteConfirm(false);
    }
  }, [user]);

  const validateUsername = async (username: string) => {
    if (!username.trim()) {
      setValidations(prev => ({
        ...prev,
        username: { valid: false, message: 'Username é obrigatório' }
      }));
      return false;
    }
    
    if (username.length < 3) {
      setValidations(prev => ({
        ...prev,
        username: { valid: false, message: 'Username deve ter pelo menos 3 caracteres' }
      }));
      return false;
    }
    
    setValidations(prev => ({
      ...prev,
      username: { valid: true, message: '' }
    }));
    return true;
  };

  const validatePassword = (password: string) => {
    if (changePassword && !password) {
      setValidations(prev => ({
        ...prev,
        password: { valid: false, message: 'Nova senha é obrigatória' }
      }));
      return false;
    }
    
    if (changePassword && password.length < 6) {
      setValidations(prev => ({
        ...prev,
        password: { valid: false, message: 'Senha deve ter pelo menos 6 caracteres' }
      }));
      return false;
    }
    
    setValidations(prev => ({
      ...prev,
      password: { valid: true, message: '' }
    }));
    return true;
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    if (field === 'username') {
      validateUsername(value);
    }
    if (field === 'newPassword') {
      validatePassword(value);
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    
    const isUsernameValid = await validateUsername(formData.username);
    const isPasswordValid = validatePassword(formData.newPassword);
    
    if (!isUsernameValid || !isPasswordValid) return;
    
    setLoading(true);
    try {
      const userData: Partial<User> = {
        firstName: formData.firstName.trim() || undefined,
        lastName: formData.lastName.trim() || undefined,
        username: formData.username.trim(),
        status: formData.status
      };
      
      const newPassword = changePassword ? formData.newPassword : undefined;
      await onSave(userData, newPassword);
      
      toast({
        title: "Usuário atualizado",
        description: "As alterações foram salvas com sucesso.",
      });
      
      onClose();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar",
        description: error.message || "Erro ao salvar alterações.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !onDeleteUser) return;
    
    setDeleteLoading(true);
    try {
      await onDeleteUser(user.id);
      toast({
        title: "Usuário excluído",
        description: "O usuário foi removido com sucesso.",
      });
      onClose();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error.message || "Erro ao excluir usuário.",
        variant: "destructive",
      });
    } finally {
      setDeleteLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  if (!user) return null;

  const userLevel = getUserLevel(user.permissions);
  const passwordStrength = getPasswordStrength(formData.newPassword);
  const hasChanges = 
    formData.firstName !== (user.firstName || '') ||
    formData.lastName !== (user.lastName || '') ||
    formData.username !== (user.username || '') ||
    formData.status !== user.status ||
    (changePassword && formData.newPassword);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Edit className="h-5 w-5" />
            <span>Editar Usuário - {user.username || user.email}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* SEÇÃO: INFORMAÇÕES BÁSICAS */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center space-x-2">
                <User className="h-5 w-5" />
                <span>Informações Básicas</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Email (readonly) */}
              <div className="space-y-2">
                <Label className="flex items-center space-x-2">
                  <Mail className="h-4 w-4" />
                  <span>Email</span>
                </Label>
                <Input
                  value={user.email}
                  disabled
                  className="bg-gray-50 text-gray-600"
                />
              </div>

              {/* Nome + Sobrenome */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={formData.firstName}
                    onChange={(e) => handleInputChange('firstName', e.target.value)}
                    placeholder="João"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sobrenome</Label>
                  <Input
                    value={formData.lastName}
                    onChange={(e) => handleInputChange('lastName', e.target.value)}
                    placeholder="Silva"
                  />
                </div>
              </div>

              {/* Username */}
              <div className="space-y-2">
                <Label>Username</Label>
                <Input
                  value={formData.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  placeholder="joao.silva"
                  className={!validations.username.valid ? 'border-red-500' : ''}
                />
                {!validations.username.valid && (
                  <p className="text-sm text-red-600">{validations.username.message}</p>
                )}
              </div>

              {/* Status */}
              <div className="space-y-2">
                <Label>Status da Conta</Label>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={formData.status === 'active'}
                      onCheckedChange={(checked) => 
                        handleInputChange('status', checked ? 'active' : 'blocked')
                      }
                    />
                    <span className="text-sm">
                      {formData.status === 'active' ? (
                        <span className="flex items-center space-x-1 text-green-600">
                          <CheckCircle className="h-4 w-4" />
                          <span>Ativo</span>
                        </span>
                      ) : (
                        <span className="flex items-center space-x-1 text-red-600">
                          <XCircle className="h-4 w-4" />
                          <span>Bloqueado</span>
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SEÇÃO: CONFIGURAÇÕES DE ACESSO */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center space-x-2">
                <Shield className="h-5 w-5" />
                <span>Configurações de Acesso</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Toggle Alterar Senha */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="changePassword"
                  checked={changePassword}
                  onCheckedChange={setChangePassword}
                />
                <Label htmlFor="changePassword">Alterar senha do usuário</Label>
              </div>

              {/* Campo Nova Senha */}
              {changePassword && (
                <div className="space-y-2">
                  <Label>Nova Senha</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.newPassword}
                      onChange={(e) => handleInputChange('newPassword', e.target.value)}
                      placeholder="Digite a nova senha"
                      className={!validations.password.valid ? 'border-red-500 pr-10' : 'pr-10'}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {!validations.password.valid && (
                    <p className="text-sm text-red-600">{validations.password.message}</p>
                  )}
                  {formData.newPassword && (
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm">Força da senha:</span>
                        <span className={`text-sm font-medium ${passwordStrength.color}`}>
                          {passwordStrength.label}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            passwordStrength.strength <= 2 ? 'bg-red-500' :
                            passwordStrength.strength <= 3 ? 'bg-yellow-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${(passwordStrength.strength / 5) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* SEÇÃO: PERMISSÕES ATUAIS */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Settings className="h-5 w-5" />
                  <span>Permissões Atuais</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onManagePermissions(user)}
                  className="flex items-center space-x-1"
                >
                  <UserCog className="h-4 w-4" />
                  <span>Gerenciar</span>
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Perfil atual */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium">Perfil atual:</span>
                  <div className="flex items-center space-x-2">
                    <span className={`text-lg ${userLevel.color}`}>{userLevel.icon}</span>
                    <span className={`font-semibold ${userLevel.color}`}>{userLevel.level}</span>
                  </div>
                </div>
                <UserLevelIndicator permissions={user.permissions} />
              </div>

              {/* Badges de permissões */}
              <div className="space-y-2">
                <span className="text-sm font-medium">Permissões ativas:</span>
                <div className="flex flex-wrap gap-2">
                  {user.permissions.slice(0, 8).map(permission => {
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
                  {user.permissions.length > 8 && (
                    <Badge variant="outline" className="text-xs">
                      +{user.permissions.length - 8} mais
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SEÇÃO: INFORMAÇÕES ADICIONAIS */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center space-x-2">
                <Clock className="h-5 w-5" />
                <span>Informações Adicionais</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="flex items-center space-x-2">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">Último login:</span>
                  <HumanizedDate date={user.lastLogin} />
                </div>
                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">Criado em:</span>
                  <HumanizedDate date={user.createdAt} />
                </div>
                <div className="flex items-center space-x-2">
                  <Hash className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">Total de permissões:</span>
                  <span>{user.permissions.length}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <User className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">ID do usuário:</span>
                  <span className="text-xs font-mono">{user.id}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AÇÕES */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div>
              {onDeleteUser && (
                <>
                  {!showDeleteConfirm ? (
                    <Button
                      variant="outline"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Excluir Usuário
                    </Button>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-red-600">Confirmar exclusão:</span>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDelete}
                        disabled={deleteLoading}
                      >
                        {deleteLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Confirmar'
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDeleteConfirm(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
            
            <div className="flex space-x-3">
              <Button variant="outline" onClick={onClose}>
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
              <Button 
                onClick={handleSubmit} 
                disabled={loading || !hasChanges}
                className="bg-green-600 hover:bg-green-700"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar Alterações
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditUserModal;
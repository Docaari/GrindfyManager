import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Lock, Unlock, Search, Users, Shield, Activity, AlertCircle, CheckCircle, XCircle, Trash2, Mail, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import DataMonitoring from '@/components/DataMonitoring';
import UserLevelIndicator from '@/components/UserLevelIndicator';
import HumanizedDate from '@/components/HumanizedDate';
import EditUserModalFixed from '@/components/EditUserModalFixed';
import DeleteUserModal from '@/components/DeleteUserModal';

// Componente para Preview de Email
interface EmailPreviewCardProps {
  type: 'verification' | 'welcome' | 'password-reset';
  title: string;
  description: string;
  icon: React.ReactNode;
  badges: Array<{
    text: string;
    variant: 'outline' | 'default';
    className?: string;
  }>;
}

// Templates de email inline para visualização
const getEmailTemplate = (type: string): string => {
  const templates = {
    verification: `
      <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; margin: 0; padding: 20px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); min-height: 100vh;">
        <div style="max-width: 580px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);">
          
          <!-- Header com Logo + Marca -->
          <div style="background: linear-gradient(135deg, #00ff88 0%, #10b981 100%); padding: 60px 40px; text-align: center; position: relative;">
            <!-- Logo circular com G -->
            <div style="display: inline-flex; align-items: center; justify-content: center; width: 80px; height: 80px; background-color: rgba(15, 23, 42, 0.1); border-radius: 50%; margin-bottom: 20px; border: 3px solid rgba(255, 255, 255, 0.2);">
              <span style="color: #0f172a; font-size: 36px; font-weight: 900; font-family: 'Inter', sans-serif;">G</span>
            </div>
            
            <!-- Marca Grindfy -->
            <h1 style="margin: 0; font-size: 42px; font-weight: 800; letter-spacing: -0.02em;">
              <span style="color: #0f172a;">Grind</span><span style="color: #ffffff;">fy</span>
            </h1>
            <p style="margin: 10px 0 0 0; color: rgba(15, 23, 42, 0.7); font-size: 16px; font-weight: 500;">Poker Analytics Platform</p>
          </div>

          <!-- Conteúdo Principal -->
          <div style="padding: 50px 40px; background-color: #1e293b;">
            
            <!-- Card de Confirmação -->
            <div style="background: linear-gradient(135deg, #334155 0%, #475569 100%); padding: 40px; border-radius: 12px; border: 1px solid rgba(0, 255, 136, 0.1); margin-bottom: 30px;">
              <h2 style="color: #f8fafc; font-size: 28px; font-weight: 700; margin: 0 0 16px 0; text-align: center;">✉️ Confirme seu email</h2>
              
              <p style="line-height: 1.7; margin: 0 0 24px 0; color: #cbd5e1; font-size: 16px; text-align: center;">
                Olá! Bem-vindo ao <strong style="color: #00ff88;">Grindfy</strong>, a plataforma definitiva para rastreamento de performance em torneios de poker.
              </p>
              
              <p style="line-height: 1.7; margin: 0 0 32px 0; color: #94a3b8; font-size: 15px; text-align: center;">
                Para começar a usar todas as funcionalidades e proteger sua conta, precisamos confirmar seu endereço de email.
              </p>
              
              <!-- Botão Principal -->
              <div style="text-align: center; margin: 32px 0;">
                <a href="#" style="display: inline-block; background: linear-gradient(135deg, #00ff88 0%, #10b981 100%); color: #0f172a; text-decoration: none; padding: 18px 40px; border-radius: 12px; font-weight: 700; font-size: 16px; letter-spacing: 0.5px; transition: all 0.3s ease; box-shadow: 0 10px 25px rgba(0, 255, 136, 0.3);">
                  ✅ Confirmar Email
                </a>
              </div>
            </div>

            <!-- Informações Adicionais -->
            <div style="background-color: rgba(51, 65, 85, 0.3); padding: 24px; border-radius: 8px; border-left: 4px solid #00ff88; margin-bottom: 24px;">
              <p style="margin: 0; color: #cbd5e1; font-size: 14px; line-height: 1.6;">
                <strong style="color: #00ff88;">💡 Dica:</strong> Este link de confirmação expira em 24 horas. Se você não conseguir confirmar, poderá solicitar um novo link na página de login.
              </p>
            </div>

            <!-- Recursos da Plataforma -->
            <div style="margin: 32px 0;">
              <h3 style="color: #f8fafc; font-size: 18px; font-weight: 600; margin: 0 0 20px 0; text-align: center;">🚀 O que você terá acesso:</h3>
              
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div style="background-color: rgba(51, 65, 85, 0.4); padding: 20px; border-radius: 8px; text-align: center;">
                  <div style="font-size: 24px; margin-bottom: 8px;">📊</div>
                  <p style="margin: 0; color: #cbd5e1; font-size: 14px; font-weight: 500;">Dashboard Avançado</p>
                </div>
                <div style="background-color: rgba(51, 65, 85, 0.4); padding: 20px; border-radius: 8px; text-align: center;">
                  <div style="font-size: 24px; margin-bottom: 8px;">📈</div>
                  <p style="margin: 0; color: #cbd5e1; font-size: 14px; font-weight: 500;">Analytics Detalhado</p>
                </div>
              </div>
            </div>

            <!-- Linha Separadora -->
            <div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(0, 255, 136, 0.3), transparent); margin: 40px 0;"></div>
            
            <!-- Texto de Segurança -->
            <p style="line-height: 1.6; margin: 0; color: #64748b; font-size: 13px; text-align: center;">
              Se você não criou uma conta no Grindfy, pode ignorar este email com segurança. Nenhuma ação será tomada em sua conta.
            </p>
          </div>

          <!-- Footer -->
          <div style="padding: 30px 40px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); text-align: center; border-top: 1px solid rgba(0, 255, 136, 0.1);">
            <div style="margin-bottom: 16px;">
              <span style="color: #00ff88; font-weight: 700; font-size: 18px;">Grind</span><span style="color: #cbd5e1; font-weight: 700; font-size: 18px;">fy</span>
            </div>
            <p style="margin: 0 0 8px 0; color: #64748b; font-size: 13px;">© 2025 Grindfy - Plataforma de Analytics para Poker</p>
            <p style="margin: 0; color: #475569; font-size: 12px;">Este email foi enviado automaticamente, não responda.</p>
          </div>
        </div>
      </div>
    `,
    welcome: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; margin: 0; padding: 0; background-color: #0f1419;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #1a1a1a;">
          <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 40px 20px; text-align: center;">
            <h1 style="color: #fff; font-size: 32px; font-weight: bold; margin: 0;">🎯 Grindfy</h1>
            <p style="color: #fff; margin: 10px 0 0 0; font-size: 18px;">Bem-vindo, João!</p>
          </div>
          <div style="padding: 40px 20px; color: #e5e7eb;">
            <h2 style="color: #fff; font-size: 24px; margin: 0 0 20px 0;">🎉 Conta verificada com sucesso!</h2>
            <p style="line-height: 1.6; margin: 0 0 20px 0; color: #d1d5db;">
              Parabéns! Sua conta no <strong>Grindfy</strong> foi verificada e está pronta para uso.
            </p>
            <p style="line-height: 1.6; margin: 0 0 20px 0; color: #d1d5db;">
              Você agora tem acesso completo à plataforma mais avançada de analytics para poker. 
              Comece a rastrear seus torneios e impulsione sua performance!
            </p>
            <div style="background-color: #111827; padding: 25px; border-radius: 8px; margin: 30px 0;">
              <h3 style="color: #fff; margin: 0 0 20px 0;">🚀 O que você pode fazer agora:</h3>
              <div style="margin: 15px 0; display: flex; align-items: center;">
                <span style="width: 24px; height: 24px; margin-right: 15px; font-size: 20px;">📊</span>
                <span>Dashboard com métricas em tempo real</span>
              </div>
              <div style="margin: 15px 0; display: flex; align-items: center;">
                <span style="width: 24px; height: 24px; margin-right: 15px; font-size: 20px;">📈</span>
                <span>Análise avançada de performance</span>
              </div>
              <div style="margin: 15px 0; display: flex; align-items: center;">
                <span style="width: 24px; height: 24px; margin-right: 15px; font-size: 20px;">📋</span>
                <span>Planejamento de sessões de grind</span>
              </div>
            </div>
            <div style="text-align: center;">
              <a href="#" style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: #fff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; margin: 20px 0;">🚀 Acessar Dashboard</a>
            </div>
          </div>
          <div style="padding: 30px 20px; background-color: #111827; color: #9ca3af; text-align: center; font-size: 14px;">
            <p>© 2025 Grindfy - Plataforma de Analytics para Poker</p>
            <p>Este email foi enviado automaticamente, não responda.</p>
          </div>
        </div>
      </div>
    `,
    'password-reset': `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; margin: 0; padding: 0; background-color: #0f1419;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #1a1a1a;">
          <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 40px 20px; text-align: center;">
            <h1 style="color: #fff; font-size: 32px; font-weight: bold; margin: 0;">🎯 Grindfy</h1>
          </div>
          <div style="padding: 40px 20px; color: #e5e7eb;">
            <h2 style="color: #fff; font-size: 24px; margin: 0 0 20px 0;">🔒 Reset de senha</h2>
            <p style="line-height: 1.6; margin: 0 0 30px 0; color: #d1d5db;">
              Recebemos uma solicitação para redefinir a senha da sua conta no <strong>Grindfy</strong>.
            </p>
            <p style="line-height: 1.6; margin: 0 0 30px 0; color: #d1d5db;">
              Clique no botão abaixo para criar uma nova senha:
            </p>
            <div style="text-align: center;">
              <a href="#" style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: #fff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; margin: 20px 0;">🔐 Redefinir Senha</a>
            </div>
            <div style="background-color: #1f2937; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
              <p style="margin: 0; color: #f59e0b; font-weight: 600;">⚠️ Este link expira em 1 hora</p>
              <p style="margin: 10px 0 0 0; color: #d1d5db; font-size: 14px;">
                Por segurança, este link de reset só é válido por 60 minutos.
              </p>
            </div>
            <div style="height: 1px; background: linear-gradient(90deg, transparent, #374151, transparent); margin: 30px 0;"></div>
            <p style="line-height: 1.6; margin: 0 0 30px 0; color: #9ca3af; font-size: 14px;">
              Se você não solicitou este reset, pode ignorar este email com segurança. Sua senha não será alterada.
            </p>
          </div>
          <div style="padding: 30px 20px; background-color: #111827; color: #9ca3af; text-align: center; font-size: 14px;">
            <p>© 2025 Grindfy - Plataforma de Analytics para Poker</p>
            <p>Este email foi enviado automaticamente, não responda.</p>
          </div>
        </div>
      </div>
    `
  };
  
  return templates[type as keyof typeof templates] || '';
};

const EmailPreviewCard: React.FC<EmailPreviewCardProps> = ({ type, title, description, icon, badges }) => {
  const emailHtml = getEmailTemplate(type);

  return (
    <Card className="flex flex-col h-[800px]">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        <p className="text-sm text-gray-600">
          {description}
        </p>
        <div className="flex items-center gap-2">
          {badges.map((badge, index) => (
            <Badge 
              key={index}
              variant={badge.variant} 
              className={`text-xs ${badge.className || ''}`}
            >
              {badge.text}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <div className="h-full border-2 border-gray-200 rounded-lg overflow-hidden">
          {emailHtml ? (
            <div 
              className="w-full h-full overflow-auto"
              dangerouslySetInnerHTML={{ __html: emailHtml }}
            />
          ) : (
            <div className="flex items-center justify-center h-full bg-gray-50">
              <div className="text-center space-y-2">
                <p className="text-sm text-gray-500">Preview não disponível</p>
                <p className="text-xs text-gray-400">Template não encontrado</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// 🎯 ETAPA 3.1 - Interface atualizada para incluir userPlatformId
interface User {
  id: string;
  userPlatformId: string; // USER-0001, USER-0002, etc.
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  status: 'active' | 'inactive' | 'blocked';
  subscriptionPlan: 'basico' | 'premium' | 'pro' | 'admin';
  permissions: string[];
  createdAt: string;
  lastLogin?: string;
}

// 🎯 ETAPA 3.3 - Interface atualizada para incluir userPlatformId nos logs
interface AccessLog {
  id: string;
  userId: string;
  userPlatformId?: string; // USER-0001, USER-0002, etc.
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
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // Fetch users with corrected API call
  const { data: users = [], isLoading: usersLoading, error: usersError } = useQuery<User[]>({
    queryKey: ['/api/admin/users'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/users');
      return Array.isArray(response) ? response : [];
    }
  });

  // Fetch access logs
  const { data: accessLogs = [] } = useQuery<AccessLog[]>({
    queryKey: ['/api/admin/access-logs'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/access-logs');
      return Array.isArray(response) ? response : [];
    }
  });

  // Fetch subscription statistics
  const { data: subscriptionStats } = useQuery({
    queryKey: ['/api/admin/subscription-stats'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/subscription-stats');
      return response || {};
    }
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
    setUserToDelete(user);
    setIsDeleteModalOpen(true);
  };

  // 🎯 ETAPA 3.2 - Sistema de busca melhorado incluindo userPlatformId
  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.userPlatformId.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="statistics">Estatísticas</TabsTrigger>
          <TabsTrigger value="logs">Logs de Acesso</TabsTrigger>
          <TabsTrigger value="emails">E-mails</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoramento</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por email, nome, ID (USER-0001) ou username..."
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
                              {/* 🎯 ETAPA 3.1 - Exibir userPlatformId destacado */}
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                {user.userPlatformId}
                              </Badge>
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
                {accessLogs.slice(0, 10).map((log) => {
                  // 🎯 ETAPA 3.3 - Buscar userPlatformId do usuário relacionado ao log
                  const logUser = users.find(u => u.id === log.userId);
                  
                  return (
                    <div key={log.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Badge variant={log.status === 'success' ? 'default' : 'destructive'}>
                          {log.status === 'success' ? 'Sucesso' : 'Falha'}
                        </Badge>
                        <span className="text-sm">{log.action}</span>
                        {/* 🎯 ETAPA 3.3 - Mostrar userPlatformId legível em vez de userId complexo */}
                        {logUser && (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                            {logUser.userPlatformId}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        <HumanizedDate date={log.timestamp} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="emails" className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Email de Confirmação */}
            <EmailPreviewCard 
              type="verification"
              title="Email de Confirmação"
              description="Enviado para verificação de nova conta"
              icon={<Mail className="h-5 w-5 text-blue-600" />}
              badges={[
                { text: "Verificação de Email", variant: "outline" },
                { text: "Ativo", variant: "outline", className: "text-green-600 border-green-600" }
              ]}
            />

            {/* Email de Boas-vindas */}
            <EmailPreviewCard 
              type="welcome"
              title="Email de Boas-vindas"
              description="Enviado após verificação da conta"
              icon={<Mail className="h-5 w-5 text-green-600" />}
              badges={[
                { text: "Onboarding", variant: "outline" },
                { text: "Ativo", variant: "outline", className: "text-green-600 border-green-600" }
              ]}
            />

            {/* Email de Redefinição de Senha */}
            <EmailPreviewCard 
              type="password-reset"
              title="Email de Reset de Senha"
              description="Enviado para redefinir senha esquecida"
              icon={<Mail className="h-5 w-5 text-orange-600" />}
              badges={[
                { text: "Recuperação", variant: "outline" },
                { text: "Ativo", variant: "outline", className: "text-green-600 border-green-600" }
              ]}
            />
          </div>

          {/* Seção de Configurações de Email */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-gray-600" />
                Configurações de Email
              </CardTitle>
              <p className="text-sm text-gray-600">
                Informações sobre o sistema de emails da plataforma
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="font-semibold text-sm">SMTP Ativo</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    Gmail SMTP configurado
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Mail className="h-4 w-4 text-blue-600" />
                    <span className="font-semibold text-sm">Remetente</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    admin@grindfyapp.com
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="h-4 w-4 text-purple-600" />
                    <span className="font-semibold text-sm">Templates</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    3 emails configurados
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-4 w-4 text-green-600" />
                    <span className="font-semibold text-sm">Status</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    Sistema operacional
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-4">
          <DataMonitoring />
        </TabsContent>
      </Tabs>

      {/* Modal de Criação/Edição de Usuário */}
      <EditUserModalFixed
        isOpen={isCreateDialogOpen || isNewEditModalOpen}
        onClose={() => {
          setIsCreateDialogOpen(false);
          setIsNewEditModalOpen(false);
          setEditingUser(null);
        }}
        user={editingUser}
        onUserUpdated={() => queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] })}
      />

      {/* Modal de Exclusão de Usuário */}
      {userToDelete && (
        <DeleteUserModal
          isOpen={isDeleteModalOpen}
          onClose={() => {
            setIsDeleteModalOpen(false);
            setUserToDelete(null);
          }}
          user={userToDelete}
        />
      )}
    </div>
  );
};

export default AdminUsers;
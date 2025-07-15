import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import PermissionManager from './PermissionManager';

interface User {
  id: string;
  userPlatformId: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  status: 'active' | 'inactive' | 'blocked';
  permissions: string[];
}

interface EditUserModalSimpleProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onUserUpdated: () => void;
}

export default function EditUserModalSimple({ isOpen, onClose, user, onUserUpdated }: EditUserModalSimpleProps) {
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    firstName: '',
    lastName: '',
    status: 'active' as const,
    permissions: [] as string[]
  });
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Atualiza o formData quando o usuário muda
  useEffect(() => {
    if (user) {
      setFormData({
        email: user.email || '',
        username: user.username || '',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        status: user.status || 'active',
        permissions: user.permissions || []
      });
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsLoading(true);
    try {
      await apiRequest('PUT', `/api/admin/users/${user.userPlatformId}`, formData);
      
      toast({
        title: "Usuário atualizado",
        description: "As informações do usuário foram atualizadas com sucesso.",
      });
      
      onUserUpdated();
      onClose();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar usuário",
        description: error.message || "Ocorreu um erro inesperado.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePermissionsChange = (permissions: string[]) => {
    setFormData(prev => ({ ...prev, permissions }));
  };

  if (!user) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-[#2a2a2a] border-gray-600">
        <DialogHeader>
          <DialogTitle className="text-white">Editar Usuário</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email" className="text-[#22c55e]">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                required
                className="bg-[#1a1a1a] border-[#333] text-white focus:border-[#22c55e]"
              />
            </div>
            
            <div>
              <Label htmlFor="username" className="text-[#22c55e]">Username</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => handleInputChange('username', e.target.value)}
                required
                className="bg-[#1a1a1a] border-[#333] text-white focus:border-[#22c55e]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="firstName" className="text-[#22c55e]">Nome</Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => handleInputChange('firstName', e.target.value)}
                className="bg-[#1a1a1a] border-[#333] text-white focus:border-[#22c55e]"
              />
            </div>
            
            <div>
              <Label htmlFor="lastName" className="text-[#22c55e]">Sobrenome</Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => handleInputChange('lastName', e.target.value)}
                className="bg-[#1a1a1a] border-[#333] text-white focus:border-[#22c55e]"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="status" className="text-[#22c55e]">Status</Label>
            <Select value={formData.status} onValueChange={(value) => handleInputChange('status', value)}>
              <SelectTrigger className="bg-[#1a1a1a] border-[#333] text-white focus:border-[#22c55e]">
                <SelectValue placeholder="Selecione o status" />
              </SelectTrigger>
              <SelectContent className="bg-[#2a2a2a] border-[#333]">
                <SelectItem value="active" className="text-white hover:bg-[#1a1a1a]">Ativo</SelectItem>
                <SelectItem value="inactive" className="text-white hover:bg-[#1a1a1a]">Inativo</SelectItem>
                <SelectItem value="blocked" className="text-white hover:bg-[#1a1a1a]">Bloqueado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[#22c55e]">Permissões</Label>
            <PermissionManager
              selectedPermissions={formData.permissions}
              onPermissionsChange={handlePermissionsChange}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="border-[#333] text-white hover:bg-[#1a1a1a]">
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading} className="bg-[#22c55e] hover:bg-[#16a249] text-white">
              {isLoading ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
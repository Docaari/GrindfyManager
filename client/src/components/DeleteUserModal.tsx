import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface DeleteUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    id: string;
    userPlatformId: string;
    username: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
}

export default function DeleteUserModal({ isOpen, onClose, user }: DeleteUserModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isConfirmValid = confirmText === user.username;

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      setIsDeleting(true);
      return apiRequest('DELETE', `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      toast({
        title: 'Usuário excluído com sucesso',
        description: `O usuário ${user.username} foi removido do sistema.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/access-logs'] });
      onClose();
      setConfirmText('');
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao excluir usuário',
        description: error.message || 'Ocorreu um erro inesperado.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setIsDeleting(false);
    },
  });

  const handleDelete = () => {
    if (!isConfirmValid) return;
    deleteMutation.mutate(user.userPlatformId);
  };

  const handleClose = () => {
    if (isDeleting) return;
    setConfirmText('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px] bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            Confirmar Exclusão de Usuário
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Warning Message */}
          <div className="bg-red-950/30 border border-red-800/50 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-red-200 font-medium">Atenção: Esta ação é irreversível</p>
                <p className="text-red-300 text-sm mt-1">
                  O usuário será removido permanentemente do sistema, incluindo todos os seus dados.
                </p>
              </div>
            </div>
          </div>

          {/* User Information */}
          <div className="bg-gray-800/50 rounded-lg p-4">
            <h4 className="text-white font-medium mb-2">Usuário a ser excluído:</h4>
            <div className="space-y-1 text-sm">
              <p className="text-gray-300">
                <span className="text-gray-400">Nome:</span> {user.firstName} {user.lastName}
              </p>
              <p className="text-gray-300">
                <span className="text-gray-400">Username:</span> {user.username}
              </p>
              <p className="text-gray-300">
                <span className="text-gray-400">Email:</span> {user.email}
              </p>
              <p className="text-gray-300">
                <span className="text-gray-400">ID:</span> {user.userPlatformId}
              </p>
            </div>
          </div>

          {/* Confirmation Input */}
          <div className="space-y-2">
            <Label htmlFor="confirm-username" className="text-white">
              Para confirmar, digite exatamente o nome de usuário: <span className="font-mono text-red-400">{user.username}</span>
            </Label>
            <Input
              id="confirm-username"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={`Digite: ${user.username}`}
              className="bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:border-red-500"
              disabled={isDeleting}
            />
          </div>

          {/* Data Preservation Notice */}
          <div className="bg-blue-950/30 border border-blue-800/50 rounded-lg p-3">
            <p className="text-blue-200 text-sm">
              <span className="font-medium">Dados preservados:</span> Histórico de sessões será mantido para auditoria.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isDeleting}
            className="border-gray-600 text-gray-300 hover:bg-gray-800"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleDelete}
            disabled={!isConfirmValid || isDeleting}
            className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Excluindo...
              </>
            ) : (
              'Confirmar Exclusão'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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

interface EditUserModalEmptyProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
}

const EditUserModalEmpty: React.FC<EditUserModalEmptyProps> = ({
  user,
  isOpen,
  onClose
}) => {
  console.log('🔍 MODAL EMPTY DEBUG - Renderizando modal vazio');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Modal Vazio - Teste de Loop</DialogTitle>
        </DialogHeader>
        
        <div className="p-4">
          <p>Este é um modal completamente vazio para testar o loop infinito.</p>
          {user && <p>Usuário: {user.email}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditUserModalEmpty;
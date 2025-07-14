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
        
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Nome</label>
            <input
              type="text"
              className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white"
              defaultValue={user?.firstName || ''}
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Email</label>
            <input
              type="email"
              className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white"
              defaultValue={user?.email || ''}
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Status</label>
            <select className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white">
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
              <option value="blocked">Bloqueado</option>
            </select>
          </div>

          <div className="flex justify-end space-x-2 mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Salvar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditUserModalEmpty;
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, XCircle, Clock, Users, Shield, ArrowRight } from 'lucide-react';

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

interface PermissionPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  selectedUsers: User[];
  selectedPermissions: string[];
  profileName: string;
  availablePermissions: Permission[];
}

const PermissionPreviewModal: React.FC<PermissionPreviewModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  selectedUsers,
  selectedPermissions,
  profileName,
  availablePermissions
}) => {
  const estimatedTimeSeconds = selectedUsers.length * selectedPermissions.length * 0.5;
  
  const getPermissionChanges = (user: User) => {
    const currentPermissions = user.permissions || [];
    const toAdd = selectedPermissions.filter(p => !currentPermissions.includes(p));
    const toRemove = currentPermissions.filter(p => !selectedPermissions.includes(p));
    
    return { toAdd, toRemove };
  };

  const getPermissionName = (permissionId: string) => {
    const permission = availablePermissions.find(p => p.id === permissionId);
    return permission?.name || permissionId;
  };

  const getTotalChanges = () => {
    let totalAdd = 0;
    let totalRemove = 0;
    
    selectedUsers.forEach(user => {
      const { toAdd, toRemove } = getPermissionChanges(user);
      totalAdd += toAdd.length;
      totalRemove += toRemove.length;
    });
    
    return { totalAdd, totalRemove };
  };

  const { totalAdd, totalRemove } = getTotalChanges();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-500" />
            Confirmar Aplicação de Permissões
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Resumo da Operação */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-5 h-5" />
                Resumo da Operação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{selectedUsers.length}</div>
                  <div className="text-sm text-gray-600">Usuários</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{totalAdd}</div>
                  <div className="text-sm text-gray-600">Adicionadas</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{totalRemove}</div>
                  <div className="text-sm text-gray-600">Removidas</div>
                </div>
                <div className="text-center flex items-center justify-center gap-1">
                  <Clock className="w-4 h-4 text-gray-500" />
                  <div>
                    <div className="text-sm font-medium">~{estimatedTimeSeconds.toFixed(1)}s</div>
                    <div className="text-xs text-gray-600">Estimativa</div>
                  </div>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="secondary">{profileName}</Badge>
                  <ArrowRight className="w-4 h-4" />
                  <span>Você irá aplicar o perfil <strong>{profileName}</strong> para {selectedUsers.length} usuário(s)</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detalhes por Usuário */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Alterações por Usuário</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {selectedUsers.map((user) => {
                  const { toAdd, toRemove } = getPermissionChanges(user);
                  
                  return (
                    <div key={user.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="font-medium">{user.username || user.email}</div>
                          <div className="text-sm text-gray-600">{user.email}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {toAdd.length > 0 && (
                            <Badge variant="secondary" className="text-green-700 bg-green-100">
                              +{toAdd.length}
                            </Badge>
                          )}
                          {toRemove.length > 0 && (
                            <Badge variant="secondary" className="text-red-700 bg-red-100">
                              -{toRemove.length}
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      <div className="grid md:grid-cols-2 gap-4">
                        {toAdd.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 text-sm font-medium text-green-700 mb-2">
                              <CheckCircle className="w-4 h-4" />
                              Permissões Adicionadas ({toAdd.length})
                            </div>
                            <div className="space-y-1">
                              {toAdd.map((permissionId) => (
                                <div key={permissionId} className="text-sm bg-green-50 text-green-800 px-2 py-1 rounded">
                                  {getPermissionName(permissionId)}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {toRemove.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 text-sm font-medium text-red-700 mb-2">
                              <XCircle className="w-4 h-4" />
                              Permissões Removidas ({toRemove.length})
                            </div>
                            <div className="space-y-1">
                              {toRemove.map((permissionId) => (
                                <div key={permissionId} className="text-sm bg-red-50 text-red-800 px-2 py-1 rounded">
                                  {getPermissionName(permissionId)}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Aviso de Segurança */}
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-sm font-bold">!</span>
                </div>
                <div>
                  <div className="font-medium text-amber-800">Atenção</div>
                  <div className="text-sm text-amber-700 mt-1">
                    Esta operação não pode ser desfeita automaticamente. Certifique-se de que as permissões estão corretas antes de continuar.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} className="bg-blue-600 hover:bg-blue-700">
            Confirmar e Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PermissionPreviewModal;
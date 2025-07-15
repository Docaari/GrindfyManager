import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Database, 
  Trash2, 
  AlertTriangle, 
  Loader2,
  HardDrive,
  Users,
  FileText,
  Activity
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface UserDataMetrics {
  userPlatformId: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  sessionHistory: {
    count: number;
    size: number;
  };
  tournaments: {
    count: number;
    size: number;
  };
  other: {
    count: number;
    size: number;
  };
  total: {
    count: number;
    size: number;
  };
}

interface DeleteConfirmationDialog {
  isOpen: boolean;
  user: UserDataMetrics | null;
  category: string;
  categoryName: string;
}

export default function DataMonitoring() {
  const [deleteDialog, setDeleteDialog] = useState<DeleteConfirmationDialog>({
    isOpen: false,
    user: null,
    category: '',
    categoryName: ''
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch data metrics
  const { data: userMetrics, isLoading } = useQuery<UserDataMetrics[]>({
    queryKey: ['/api/admin/data-metrics'],
    queryFn: () => apiRequest('GET', '/api/admin/data-metrics'),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Delete data mutation
  const deleteMutation = useMutation({
    mutationFn: async ({ userPlatformId, category }: { userPlatformId: string; category: string }) => {
      return apiRequest('DELETE', `/api/admin/data-cleanup/${userPlatformId}/${category}`);
    },
    onSuccess: (data) => {
      toast({
        title: 'Dados excluídos com sucesso',
        description: `Categoria ${deleteDialog.categoryName} removida para o usuário.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/data-metrics'] });
      setDeleteDialog({ isOpen: false, user: null, category: '', categoryName: '' });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao excluir dados',
        description: error.message || 'Ocorreu um erro inesperado.',
        variant: 'destructive',
      });
    },
  });

  const formatSize = (sizeInKB: number): string => {
    if (sizeInKB < 1024) {
      return `${sizeInKB.toFixed(1)} KB`;
    } else {
      return `${(sizeInKB / 1024).toFixed(1)} MB`;
    }
  };

  const getSizeColor = (sizeInKB: number): string => {
    if (sizeInKB < 100) return 'text-green-600 bg-green-100';
    if (sizeInKB < 500) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const openDeleteDialog = (user: UserDataMetrics, category: string, categoryName: string) => {
    setDeleteDialog({
      isOpen: true,
      user,
      category,
      categoryName
    });
  };

  const handleDelete = () => {
    if (deleteDialog.user) {
      deleteMutation.mutate({
        userPlatformId: deleteDialog.user.userPlatformId,
        category: deleteDialog.category
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Monitoramento de Dados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Carregando métricas de dados...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Monitoramento de Dados por Usuário
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Usuário</TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Activity className="h-4 w-4" />
                      Histórico de Sessões
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="h-4 w-4" />
                      Database Upadas
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <HardDrive className="h-4 w-4" />
                      Outros Dados
                    </div>
                  </TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userMetrics?.map((user) => (
                  <TableRow key={user.userPlatformId}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">
                          {user.firstName} {user.lastName}
                        </div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                        <Badge variant="outline" className="text-xs">
                          {user.userPlatformId}
                        </Badge>
                      </div>
                    </TableCell>
                    
                    <TableCell className="text-center">
                      <div className="space-y-1">
                        <div className="text-sm font-medium">
                          {user.sessionHistory.count} registros
                        </div>
                        <Badge 
                          variant="secondary" 
                          className={`text-xs ${getSizeColor(user.sessionHistory.size)}`}
                        >
                          {formatSize(user.sessionHistory.size)}
                        </Badge>
                      </div>
                    </TableCell>
                    
                    <TableCell className="text-center">
                      <div className="space-y-1">
                        <div className="text-sm font-medium">
                          {user.tournaments.count} registros
                        </div>
                        <Badge 
                          variant="secondary" 
                          className={`text-xs ${getSizeColor(user.tournaments.size)}`}
                        >
                          {formatSize(user.tournaments.size)}
                        </Badge>
                      </div>
                    </TableCell>
                    
                    <TableCell className="text-center">
                      <div className="space-y-1">
                        <div className="text-sm font-medium">
                          {user.other.count} registros
                        </div>
                        <Badge 
                          variant="secondary" 
                          className={`text-xs ${getSizeColor(user.other.size)}`}
                        >
                          {formatSize(user.other.size)}
                        </Badge>
                      </div>
                    </TableCell>
                    
                    <TableCell className="text-center">
                      <div className="space-y-1">
                        <div className="text-sm font-medium">
                          {user.total.count} registros
                        </div>
                        <Badge 
                          variant="secondary" 
                          className={`text-xs ${getSizeColor(user.total.size)}`}
                        >
                          {formatSize(user.total.size)}
                        </Badge>
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => openDeleteDialog(user, 'sessions', 'Histórico de Sessões')}
                          disabled={user.sessionHistory.count === 0}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Limpar Histórico
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => openDeleteDialog(user, 'tournaments', 'Database Upadas')}
                          disabled={user.tournaments.count === 0}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Limpar Uploads
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => openDeleteDialog(user, 'other', 'Outros Dados')}
                          disabled={user.other.count === 0}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Limpar Outros
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="text-xs"
                          onClick={() => openDeleteDialog(user, 'all', 'Todos os Dados')}
                          disabled={user.total.count === 0}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Limpar Tudo
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.isOpen} onOpenChange={(open) => !open && setDeleteDialog({ isOpen: false, user: null, category: '', categoryName: '' })}>
        <DialogContent className="sm:max-w-[500px] bg-gray-900 border-gray-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              Confirmar Exclusão de Dados
            </DialogTitle>
            <DialogDescription className="text-gray-300">
              Confirmar exclusão de <strong>{deleteDialog.categoryName}</strong> do usuário{' '}
              <strong>{deleteDialog.user?.firstName} {deleteDialog.user?.lastName}</strong>?
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 text-gray-300">
            <p className="text-sm">
              Esta ação irá excluir permanentemente todos os dados da categoria selecionada para este usuário.
              Esta operação não pode ser desfeita.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={deleteMutation.isPending}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Confirmar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
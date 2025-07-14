import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Bug, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Lightbulb, 
  Zap,
  MessageSquare,
  User,
  Calendar,
  Filter,
  Search,
  BarChart3,
  TrendingUp,
  AlertCircle,
  Eye,
  Edit,
  Trash2,
  Plus
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface BugReport {
  id: string;
  userId: string;
  page: string;
  description: string;
  urgency: 'low' | 'medium' | 'high';
  type: 'bug' | 'suggestion' | 'performance';
  status: 'open' | 'in_progress' | 'resolved' | 'dismissed';
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
}

interface BugStats {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  dismissed: number;
  byUrgency: { low: number; medium: number; high: number };
  byType: { bug: number; suggestion: number; performance: number };
}

const statusConfig = {
  open: { label: 'Aberto', color: 'bg-blue-100 text-blue-800', icon: AlertCircle },
  in_progress: { label: 'Em Andamento', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  resolved: { label: 'Resolvido', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  dismissed: { label: 'Descartado', color: 'bg-gray-100 text-gray-800', icon: XCircle },
};

const urgencyConfig = {
  low: { label: 'Baixa', color: 'bg-green-100 text-green-800', icon: MessageSquare },
  medium: { label: 'Média', color: 'bg-yellow-100 text-yellow-800', icon: AlertTriangle },
  high: { label: 'Alta', color: 'bg-red-100 text-red-800', icon: Zap },
};

const typeConfig = {
  bug: { label: 'Bug', color: 'bg-red-100 text-red-800', icon: Bug },
  suggestion: { label: 'Sugestão', color: 'bg-blue-100 text-blue-800', icon: Lightbulb },
  performance: { label: 'Performance', color: 'bg-purple-100 text-purple-800', icon: Zap },
};

export default function AdminBugs() {
  const [selectedReport, setSelectedReport] = useState<BugReport | null>(null);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<BugReport | null>(null);
  const [newStatus, setNewStatus] = useState<string>('');
  const [adminNotes, setAdminNotes] = useState('');
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch bug reports
  const { data: bugReports = [], isLoading: reportsLoading } = useQuery<BugReport[]>({
    queryKey: ['/api/bug-reports'],
    queryFn: () => apiRequest('/api/bug-reports'),
  });

  // Fetch bug stats
  const { data: stats, isLoading: statsLoading } = useQuery<BugStats>({
    queryKey: ['/api/bug-reports/stats'],
    queryFn: () => apiRequest('/api/bug-reports/stats'),
  });

  // Update bug report mutation
  const updateBugReport = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<BugReport> }) =>
      apiRequest(`/api/bug-reports/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
    onSuccess: () => {
      toast({
        title: "Relatório atualizado",
        description: "O relatório foi atualizado com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/bug-reports'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bug-reports/stats'] });
      setIsEditModalOpen(false);
      setEditingReport(null);
    },
  });

  // Delete bug report mutation
  const deleteBugReport = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/bug-reports/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast({
        title: "Relatório excluído",
        description: "O relatório foi excluído com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/bug-reports'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bug-reports/stats'] });
    },
  });

  // Filter reports
  const filteredReports = bugReports.filter(report => {
    const matchesFilter = filter === 'all' || report.status === filter;
    const matchesSearch = report.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         report.page.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const handleEditReport = (report: BugReport) => {
    setEditingReport(report);
    setNewStatus(report.status);
    setAdminNotes(report.adminNotes || '');
    setIsEditModalOpen(true);
  };

  const handleUpdateReport = () => {
    if (!editingReport) return;
    
    updateBugReport.mutate({
      id: editingReport.id,
      updates: {
        status: newStatus as any,
        adminNotes: adminNotes,
      },
    });
  };

  const handleDeleteReport = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este relatório?')) {
      deleteBugReport.mutate(id);
    }
  };

  const StatCard = ({ 
    title, 
    value, 
    icon: Icon, 
    color, 
    trend 
  }: { 
    title: string; 
    value: number; 
    icon: any; 
    color: string; 
    trend?: number;
  }) => (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {trend && (
              <div className="flex items-center gap-1 mt-1">
                <TrendingUp className="h-3 w-3 text-green-600" />
                <span className="text-xs text-green-600">+{trend}%</span>
              </div>
            )}
          </div>
          <div className={`p-3 rounded-full ${color}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (reportsLoading || statsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gerenciamento de Bugs</h1>
          <p className="text-gray-600">
            Gerencie relatórios de bugs, sugestões e problemas de performance
          </p>
        </div>
        <Button className="bg-green-600 hover:bg-green-700">
          <Plus className="h-4 w-4 mr-2" />
          Novo Relatório
        </Button>
      </div>

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="reports">Relatórios</TabsTrigger>
          <TabsTrigger value="analytics">Análise</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total"
              value={stats?.total || 0}
              icon={Bug}
              color="bg-blue-500"
            />
            <StatCard
              title="Abertos"
              value={stats?.open || 0}
              icon={AlertCircle}
              color="bg-red-500"
            />
            <StatCard
              title="Em Andamento"
              value={stats?.inProgress || 0}
              icon={Clock}
              color="bg-yellow-500"
            />
            <StatCard
              title="Resolvidos"
              value={stats?.resolved || 0}
              icon={CheckCircle}
              color="bg-green-500"
            />
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Por Urgência
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(urgencyConfig).map(([key, config]) => (
                    <div key={key} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <config.icon className="h-4 w-4" />
                        <span className="text-sm">{config.label}</span>
                      </div>
                      <Badge className={config.color}>
                        {stats?.byUrgency?.[key as keyof typeof stats.byUrgency] || 0}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Por Tipo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(typeConfig).map(([key, config]) => (
                    <div key={key} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <config.icon className="h-4 w-4" />
                        <span className="text-sm">{config.label}</span>
                      </div>
                      <Badge className={config.color}>
                        {stats?.byType?.[key as keyof typeof stats.byType] || 0}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="reports" className="space-y-6">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="open">Abertos</SelectItem>
                  <SelectItem value="in_progress">Em Andamento</SelectItem>
                  <SelectItem value="resolved">Resolvidos</SelectItem>
                  <SelectItem value="dismissed">Descartados</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 flex-1">
              <Search className="h-4 w-4" />
              <Input
                placeholder="Buscar relatórios..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Reports List */}
          <div className="space-y-4">
            {filteredReports.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Bug className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-500">Nenhum relatório encontrado</p>
                </CardContent>
              </Card>
            ) : (
              filteredReports.map((report) => {
                const StatusIcon = statusConfig[report.status]?.icon || AlertCircle;
                const TypeIcon = typeConfig[report.type]?.icon || Bug;
                const UrgencyIcon = urgencyConfig[report.urgency]?.icon || AlertTriangle;

                return (
                  <Card key={report.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            <Badge className={statusConfig[report.status]?.color}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {statusConfig[report.status]?.label}
                            </Badge>
                            <Badge className={typeConfig[report.type]?.color}>
                              <TypeIcon className="h-3 w-3 mr-1" />
                              {typeConfig[report.type]?.label}
                            </Badge>
                            <Badge className={urgencyConfig[report.urgency]?.color}>
                              <UrgencyIcon className="h-3 w-3 mr-1" />
                              {urgencyConfig[report.urgency]?.label}
                            </Badge>
                          </div>
                          
                          <div className="mb-3">
                            <h3 className="font-semibold text-lg mb-1">{report.page}</h3>
                            <p className="text-gray-600 text-sm line-clamp-2">
                              {report.description}
                            </p>
                          </div>

                          <div className="flex items-center gap-4 text-sm text-gray-500">
                            <div className="flex items-center gap-1">
                              <User className="h-4 w-4" />
                              ID: {report.userId.slice(0, 8)}...
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {format(new Date(report.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 ml-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedReport(report)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditReport(report)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteReport(report.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        <TabsContent value="analytics">
          <Card>
            <CardContent className="p-8 text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Análise Avançada</h3>
              <p className="text-gray-500">
                Relatórios detalhados e métricas de performance em breve...
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Editar Relatório</DialogTitle>
          </DialogHeader>
          {editingReport && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusConfig).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <config.icon className="h-4 w-4" />
                          {config.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Notas do Administrador</Label>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Adicione notas internas sobre este relatório..."
                  className="min-h-[100px]"
                />
              </div>

              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setIsEditModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={handleUpdateReport}
                  disabled={updateBugReport.isPending}
                >
                  {updateBugReport.isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* View Modal */}
      <Dialog open={!!selectedReport} onOpenChange={() => setSelectedReport(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Detalhes do Relatório</DialogTitle>
          </DialogHeader>
          {selectedReport && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Badge className={statusConfig[selectedReport.status]?.color}>
                  {statusConfig[selectedReport.status]?.label}
                </Badge>
                <Badge className={typeConfig[selectedReport.type]?.color}>
                  {typeConfig[selectedReport.type]?.label}
                </Badge>
                <Badge className={urgencyConfig[selectedReport.urgency]?.color}>
                  {urgencyConfig[selectedReport.urgency]?.label}
                </Badge>
              </div>
              
              <div>
                <Label>Página</Label>
                <p className="text-sm text-gray-600">{selectedReport.page}</p>
              </div>
              
              <div>
                <Label>Descrição</Label>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{selectedReport.description}</p>
              </div>
              
              {selectedReport.adminNotes && (
                <div>
                  <Label>Notas do Admin</Label>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{selectedReport.adminNotes}</p>
                </div>
              )}
              
              <div className="text-xs text-gray-500">
                Criado em: {format(new Date(selectedReport.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
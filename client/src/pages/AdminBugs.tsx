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
  Plus,
  Wrench,
  Check,
  X
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ApproveItemModal from '@/components/ApproveItemModal';
import RejectItemModal from '@/components/RejectItemModal';
import EditItemModal from '@/components/EditItemModal';

interface BugReport {
  id: string;
  userId: string;
  page: string;
  description: string;
  urgency: 'low' | 'medium' | 'high';
  type: 'bug' | 'suggestion' | 'performance' | 'enhancement';
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
  byType: { bug: number; suggestion: number; performance: number; enhancement: number };
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
  enhancement: { label: 'Melhoria', color: 'bg-green-100 text-green-800', icon: Lightbulb },
};

export default function AdminBugs() {
  const [selectedReport, setSelectedReport] = useState<BugReport | null>(null);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [pageFilter, setPageFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<BugReport | null>(null);
  const [newStatus, setNewStatus] = useState<string>('');
  const [adminNotes, setAdminNotes] = useState('');

  // Professional modal states
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedModalItem, setSelectedModalItem] = useState<BugReport | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch bug reports
  const { data: bugReports = [], isLoading: reportsLoading } = useQuery<BugReport[]>({
    queryKey: ['/api/bug-reports'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/bug-reports');
      return response.json();
    },
  });

  // Fetch bug stats
  const { data: stats, isLoading: statsLoading } = useQuery<BugStats>({
    queryKey: ['/api/bug-reports/stats'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/bug-reports/stats');
      return response.json();
    },
  });

  // Update bug report mutation
  const updateBugReport = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<BugReport> }) =>
      apiRequest('PUT', `/api/bug-reports/${id}`, updates),
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
      apiRequest('DELETE', `/api/bug-reports/${id}`),
    onSuccess: () => {
      toast({
        title: "Relatório excluído",
        description: "O relatório foi excluído com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/bug-reports'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bug-reports/stats'] });
    },
  });

  // Professional modal handlers
  const handleApproveClick = (report: BugReport) => {
    setSelectedModalItem(report);
    setApproveModalOpen(true);
  };

  const handleRejectClick = (report: BugReport) => {
    setSelectedModalItem(report);
    setRejectModalOpen(true);
  };

  const handleEditClick = (report: BugReport) => {
    setSelectedModalItem(report);
    setEditModalOpen(true);
  };

  // Legacy quick handlers (replaced with professional modals)
  const handleQuickApprove = (report: BugReport) => {
    handleApproveClick(report);
  };

  const handleQuickReject = (report: BugReport) => {
    handleRejectClick(report);
  };



  // Pages available in the system for filtering
  const availablePages = [
    'all', 'Dashboard', 'Import', 'Biblioteca', 'Grade', 
    'Grind', 'Grind Ativo', 'Warm Up', 'Calendario', 'Estudos',
    'Ferramentas', 'Analytics', 'Usuarios', 'Bugs', 'Modais', 'Outro'
  ];

  // Filter reports with advanced filtering
  const filteredReports = bugReports.filter(report => {
    const matchesSearch = 
      report.page.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.description.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = typeFilter === 'all' || report.type === typeFilter;

    const matchesPage = pageFilter === 'all' || 
      report.page.toLowerCase().includes(pageFilter.toLowerCase());

    const matchesFilter = (() => {
      switch (filter) {
        case 'high':
          return report.urgency === 'high';
        case 'medium':
          return report.urgency === 'medium';
        case 'low':
          return report.urgency === 'low';
        case 'resolved':
          return report.status === 'resolved';
        case 'dismissed':
          return report.status === 'dismissed';
        default:
          return true;
      }
    })();

    return matchesSearch && matchesType && matchesPage && matchesFilter;
  });

  // Legacy edit handler (replaced with professional modal)
  const handleEditReport = (report: BugReport) => {
    handleEditClick(report);
  };

  // New action handlers for pending cards
  const handleCompleteItem = (report: BugReport) => {
    if (confirm('Marcar este item como concluído?')) {
      updateBugReport.mutate({
        id: report.id,
        updates: {
          status: 'resolved',
          adminNotes: `Concluído em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`
        }
      });
    }
  };

  const handleCancelItem = (report: BugReport) => {
    if (confirm('Tem certeza que deseja cancelar este item?')) {
      updateBugReport.mutate({
        id: report.id,
        updates: {
          status: 'dismissed',
          adminNotes: `Cancelado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`
        }
      });
    }
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
        <TabsList className="grid w-full grid-cols-5 bg-gray-800 border-gray-700">
          <TabsTrigger value="dashboard" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-300 hover:text-white hover:bg-gray-700/50">Dashboard</TabsTrigger>
          <TabsTrigger value="analysis" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-300 hover:text-white hover:bg-gray-700/50">Aguardando Análise</TabsTrigger>
          <TabsTrigger value="bugs" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-300 hover:text-white hover:bg-gray-700/50">Bugs Pendentes</TabsTrigger>
          <TabsTrigger value="improvements" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-300 hover:text-white hover:bg-gray-700/50">Melhorias Pendentes</TabsTrigger>
          <TabsTrigger value="completed" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-300 hover:text-white hover:bg-gray-700/50">Concluídos</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6">
          {/* Main Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="metric-card metric-analysis">
              <div className="metric-header">
                <div className="metric-icon">
                  <Search className="w-6 h-6" />
                </div>
                <div className="metric-title">Bugs Aguardando Análise</div>
              </div>
              <div className="metric-value">{stats?.open || 0}</div>
              <div className="metric-subtitle">Precisam decisão admin</div>
            </div>

            <div className="metric-card metric-improvements">
              <div className="metric-header">
                <div className="metric-icon">
                  <Lightbulb className="w-6 h-6" />
                </div>
                <div className="metric-title">Melhorias Aguardando Análise</div>
              </div>
              <div className="metric-value">{stats?.byType?.enhancement || 0}</div>
              <div className="metric-subtitle">Ideias pendentes</div>
            </div>

            <div className="metric-card metric-bugs-pending">
              <div className="metric-header">
                <div className="metric-icon">
                  <Bug className="w-6 h-6" />
                </div>
                <div className="metric-title">Bugs Pendentes</div>
              </div>
              <div className="metric-value">{stats?.inProgress || 0}</div>
              <div className="metric-subtitle">Aguardando resolução</div>
            </div>

            <div className="metric-card metric-improvements-pending">
              <div className="metric-header">
                <div className="metric-icon">
                  <Wrench className="w-6 h-6" />
                </div>
                <div className="metric-title">Melhorias Pendentes</div>
              </div>
              <div className="metric-value">{stats?.resolved || 0}</div>
              <div className="metric-subtitle">Aguardando implementação</div>
            </div>
          </div>

          {/* Recent Items Sections */}
          <div className="space-y-8">
            {/* Items Aguardando Análise */}
            <div className="dashboard-section">
              <div className="section-header">
                <h3 className="section-title">
                  <Search className="w-5 h-5 mr-2" />
                  Itens Recentes Aguardando Análise
                </h3>
                <span className="section-count">{filteredReports.filter(r => r.status === 'open').length} itens</span>
              </div>
              <div className="items-grid">
                {filteredReports.filter(r => r.status === 'open').slice(0, 3).map((report) => (
                  <div key={report.id} className="dashboard-item item-analysis">
                    <div className="item-header">
                      <Badge className={typeConfig[report.type]?.color}>
                        {typeConfig[report.type]?.label}
                      </Badge>
                      <Badge className={urgencyConfig[report.urgency]?.color}>
                        {urgencyConfig[report.urgency]?.label}
                      </Badge>
                    </div>
                    <h4 className="item-title">{report.page}</h4>
                    <p className="item-description">{report.description.substring(0, 100)}...</p>
                    <div className="item-footer">
                      <span className="item-date">
                        {format(new Date(report.createdAt), 'dd/MM', { locale: ptBR })}
                      </span>
                      <Button size="sm" variant="outline" onClick={() => setSelectedReport(report)}>
                        Ver
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bugs Urgentes */}
            <div className="dashboard-section">
              <div className="section-header">
                <h3 className="section-title">
                  <AlertTriangle className="w-5 h-5 mr-2 text-red-500" />
                  Bugs Urgentes (Prioridade Alta)
                </h3>
                <span className="section-count">{filteredReports.filter(r => r.type === 'bug' && r.urgency === 'high' && r.status === 'in_progress').length} itens</span>
              </div>
              <div className="items-grid">
                {filteredReports.filter(r => r.type === 'bug' && r.urgency === 'high' && r.status === 'in_progress').slice(0, 3).map((report) => (
                  <div key={report.id} className="dashboard-item item-urgent">
                    <div className="item-header">
                      <Badge className="bg-red-500 text-white">
                        Bug Urgente
                      </Badge>
                      <Badge className={statusConfig[report.status]?.color}>
                        {statusConfig[report.status]?.label}
                      </Badge>
                    </div>
                    <h4 className="item-title">{report.page}</h4>
                    <p className="item-description">{report.description.substring(0, 100)}...</p>
                    <div className="item-footer">
                      <span className="item-date">
                        {format(new Date(report.createdAt), 'dd/MM', { locale: ptBR })}
                      </span>
                      <Button size="sm" variant="outline" onClick={() => handleEditReport(report)}>
                        Gerenciar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Melhorias Urgentes */}
            <div className="dashboard-section">
              <div className="section-header">
                <h3 className="section-title">
                  <Lightbulb className="w-5 h-5 mr-2 text-yellow-500" />
                  Melhorias Urgentes (Prioridade Alta)
                </h3>
                <span className="section-count">{filteredReports.filter(r => r.type === 'enhancement' && r.urgency === 'high' && r.status === 'in_progress').length} itens</span>
              </div>
              <div className="items-grid">
                {filteredReports.filter(r => r.type === 'enhancement' && r.urgency === 'high' && r.status === 'in_progress').slice(0, 3).map((report) => (
                  <div key={report.id} className="dashboard-item item-improvement">
                    <div className="item-header">
                      <Badge className="bg-yellow-500 text-black">
                        Melhoria Urgente
                      </Badge>
                      <Badge className={statusConfig[report.status]?.color}>
                        {statusConfig[report.status]?.label}
                      </Badge>
                    </div>
                    <h4 className="item-title">{report.page}</h4>
                    <p className="item-description">{report.description.substring(0, 100)}...</p>
                    <div className="item-footer">
                      <span className="item-date">
                        {format(new Date(report.createdAt), 'dd/MM', { locale: ptBR })}
                      </span>
                      <Button size="sm" variant="outline" onClick={() => handleEditReport(report)}>
                        Gerenciar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-6">
          {/* Advanced Filter Bar */}
          <div className="advanced-filter-bar">
            <div className="filter-section">
              <div className="filter-group">
                <Filter className="h-4 w-4 text-gray-400" />
                <span className="filter-label">Filtros:</span>
              </div>

              <div className="filter-controls">
                <Select value={pageFilter} onValueChange={setPageFilter}>
                  <SelectTrigger className="filter-select">
                    <SelectValue placeholder="Todas as Páginas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Páginas</SelectItem>
                    {availablePages.filter(p => p !== 'all').map(page => (
                      <SelectItem key={page} value={page}>{page}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="filter-select">
                    <SelectValue placeholder="Todos os Tipos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Tipos</SelectItem>
                    <SelectItem value="bug">🐛 Bugs</SelectItem>
                    <SelectItem value="enhancement">💡 Melhorias</SelectItem>
                    <SelectItem value="suggestion">💭 Sugestões</SelectItem>
                  </SelectContent>
                </Select>

                <div className="search-container">
                  <Search className="h-4 w-4 search-icon" />
                  <Input
                    placeholder="Buscar itens aguardando análise..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Items Grid */}
          <div className="bug-items-grid">
            {filteredReports.filter(r => r.status === 'open').length === 0 ? (
              <div className="empty-state">
                <Search className="empty-icon" />
                <h3 className="empty-title">Nenhum item aguardando análise</h3>
                <p className="empty-description">
                  {searchTerm || pageFilter !== 'all' || typeFilter !== 'all' 
                    ? 'Tente ajustar os filtros para encontrar itens' 
                    : 'Todos os relatórios foram analisados'}
                </p>
              </div>
            ) : (
              filteredReports.filter(r => r.status === 'open').map((report) => (
                <div key={report.id} className="bug-card card-analysis">
                  <div className="bug-card-header">
                    <div className="bug-card-icon">
                      {report.type === 'bug' ? '🐛' : report.type === 'enhancement' ? '💡' : '💭'}
                    </div>
                    <div className="bug-card-title-section">
                      <h3 className="bug-card-title">{report.description.substring(0, 50)}...</h3>
                      <div className="bug-card-meta">
                        <span className="bug-card-page">{report.page}</span>
                        <span className="bug-card-separator">|</span>
                        <span className="bug-card-status">Aguardando Análise</span>
                      </div>
                    </div>
                    <div className="bug-card-menu">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditReport(report)}
                        className="menu-button"
                      >
                        ⋮
                      </Button>
                    </div>
                  </div>

                  <div className="bug-card-content">
                    <p className="bug-card-description">
                      {report.description}
                    </p>
                  </div>

                  <div className="bug-card-footer">
                    <div className="bug-card-info">
                      <div className="bug-card-user">
                        <User className="h-4 w-4" />
                        <span>Usuário: {report.userId === 'USER-0001' ? 'Ricardo' : 
                               report.userId === 'USER-0002' ? 'Ana Silva' : 
                               report.userId === 'USER-0003' ? 'João Santos' : 
                               `ID: ${report.userId.slice(-4)}`}</span>
                      </div>
                      <div className="bug-card-date">
                        <Calendar className="h-4 w-4" />
                        <span>{format(new Date(report.createdAt), 'dd/MM HH:mm', { locale: ptBR })}</span>
                      </div>
                    </div>
                    <div className="bug-card-quick-actions">
                      <Button
                        size="sm"
                        onClick={() => handleApproveClick(report)}
                        className="quick-approve-btn"
                        disabled={updateBugReport.isPending}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Aprovar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleRejectClick(report)}
                        className="quick-reject-btn"
                        disabled={updateBugReport.isPending}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Rejeitar
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="bugs" className="space-y-6">
          {/* Advanced Filter Bar */}
          <div className="advanced-filter-bar">
            <div className="filter-section">
              <div className="filter-group">
                <Filter className="h-4 w-4 text-gray-400" />
                <span className="filter-label">Filtros:</span>
              </div>

              <div className="filter-controls">
                <Select value={pageFilter} onValueChange={setPageFilter}>
                  <SelectTrigger className="filter-select">
                    <SelectValue placeholder="Todas as Páginas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Páginas</SelectItem>
                    {availablePages.filter(p => p !== 'all').map(page => (
                      <SelectItem key={page} value={page}>{page}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filter} onValueChange={setFilter}>
                  <SelectTrigger className="filter-select">
                    <SelectValue placeholder="Todas as Urgências" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Urgências</SelectItem>
                    <SelectItem value="high">🔴 Alta Prioridade</SelectItem>
                    <SelectItem value="medium">🟡 Média Prioridade</SelectItem>
                    <SelectItem value="low">⚪ Baixa Prioridade</SelectItem>
                  </SelectContent>
                </Select>

                <div className="search-container">
                  <Search className="h-4 w-4 search-icon" />
                  <Input
                    placeholder="Buscar bugs pendentes..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Bugs Grid */}
          <div className="bug-items-grid">
            {filteredReports.filter(r => r.type === 'bug' && r.status === 'in_progress').length === 0 ? (
              <div className="empty-state">
                <Bug className="empty-icon" />
                <h3 className="empty-title">Nenhum bug pendente</h3>
                <p className="empty-description">
                  {searchTerm || pageFilter !== 'all' || filter !== 'all' 
                    ? 'Tente ajustar os filtros para encontrar bugs' 
                    : 'Todos os bugs foram resolvidos'}
                </p>
              </div>
            ) : (
              filteredReports.filter(r => r.type === 'bug' && r.status === 'in_progress').map((report) => (
                <div key={report.id} className={`bug-card ${
                  report.urgency === 'high' ? 'card-urgent' : 
                  report.urgency === 'medium' ? 'card-medium' : 'card-low'
                }`}>
                  <div className="bug-card-header">
                    <div className="bug-card-icon">🐛</div>
                    <div className="bug-card-title-section">
                      <h3 className="bug-card-title">{report.description.substring(0, 50)}...</h3>
                      <div className="bug-card-meta">
                        <span className="bug-card-page">{report.page}</span>
                        <span className="bug-card-separator">|</span>
                        <span className="bug-card-status">
                          {report.urgency === 'high' ? 'Alta Prioridade' : 
                           report.urgency === 'medium' ? 'Média Prioridade' : 'Baixa Prioridade'}
                        </span>
                      </div>
                    </div>
                    <div className="bug-card-menu">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditReport(report)}
                        className="menu-button"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="bug-card-content">
                    <p className="bug-card-description">
                      {report.description}
                    </p>
                  </div>

                  <div className="bug-card-footer">
                    <div className="bug-card-info">
                      <div className="bug-card-user">
                        <User className="h-4 w-4" />
                        <span>Usuário: {report.userId === 'USER-0001' ? 'Ricardo' : 
                               report.userId === 'USER-0002' ? 'Ana Silva' : 
                               report.userId === 'USER-0003' ? 'João Santos' : 
                               `ID: ${report.userId.slice(-4)}`}</span>
                      </div>
                      <div className="bug-card-date">
                        <Calendar className="h-4 w-4" />
                        <span>{format(new Date(report.createdAt), 'dd/MM HH:mm', { locale: ptBR })}</span>
                      </div>
                    </div>
                    <div className="bug-card-actions">
                      <Button
                        size="sm"
                        onClick={() => handleCompleteItem(report)}
                        className="complete-btn"
                        disabled={updateBugReport.isPending}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Concluir
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleCancelItem(report)}
                        className="cancel-btn"
                        disabled={updateBugReport.isPending}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Cancelar
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="improvements" className="space-y-6">
          {/* Advanced Filter Bar */}
          <div className="advanced-filter-bar">
            <div className="filter-section">
              <div className="filter-group">
                <Filter className="h-4 w-4 text-gray-400" />
                <span className="filter-label">Filtros:</span>
              </div>

              <div className="filter-controls">
                <Select value={pageFilter} onValueChange={setPageFilter}>
                  <SelectTrigger className="filter-select">
                    <SelectValue placeholder="Todas as Páginas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Páginas</SelectItem>
                    {availablePages.filter(p => p !== 'all').map(page => (
                      <SelectItem key={page} value={page}>{page}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="filter-select">
                    <SelectValue placeholder="Todos os Tipos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Tipos</SelectItem>
                    <SelectItem value="bug">🐛 Bugs</SelectItem>
                    <SelectItem value="enhancement">💡 Melhorias</SelectItem>
                    <SelectItem value="suggestion">💭 Sugestões</SelectItem>
                  </SelectContent>
                </Select>

                <div className="search-container">
                  <Search className="h-4 w-4 search-icon" />
                  <Input
                    placeholder="Buscar melhorias pendentes..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Items Grid */}
          <div className="bug-items-grid">
            {filteredReports.filter(r => r.type === 'enhancement' && r.status === 'in_progress').length === 0 ? (
              <div className="empty-state">
                <Lightbulb className="empty-icon" />
                <h3 className="empty-title">Nenhuma melhoria pendente</h3>
                <p className="empty-description">
                  {searchTerm || pageFilter !== 'all' || typeFilter !== 'all' 
                    ? 'Tente ajustar os filtros para encontrar melhorias' 
                    : 'Todas as melhorias foram implementadas'}
                </p>
              </div>
            ) : (
              filteredReports.filter(r => r.type === 'enhancement' && r.status === 'in_progress').map((report) => (
                <div key={report.id} className="bug-card card-improvement">
                  <div className="bug-card-header">
                    <div className="bug-card-icon">
                      💡
                    </div>
                    <div className="bug-card-title-section">
                      <h3 className="bug-card-title">{report.description.substring(0, 50)}...</h3>
                      <div className="bug-card-meta">
                        <span className="bug-card-page">{report.page}</span>
                        <span className="bug-card-separator">|</span>
                        <span className="bug-card-status">
                          {report.urgency === 'high' ? 'Alta Prioridade' : 
                           report.urgency === 'medium' ? 'Média Prioridade' : 'Baixa Prioridade'}
                        </span>
                      </div>
                    </div>
                    <div className="bug-card-menu">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditReport(report)}
                        className="menu-button"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="bug-card-content">
                    <p className="bug-card-description">
                      {report.description}
                    </p>
                  </div>

                  <div className="bug-card-footer">
                    <div className="bug-card-info">
                      <div className="bug-card-user">
                        <User className="h-4 w-4" />
                        <span>Usuário: {report.userId === 'USER-0001' ? 'Ricardo' : 
                               report.userId === 'USER-0002' ? 'Ana Silva' : 
                               report.userId === 'USER-0003' ? 'João Santos' : 
                               `ID: ${report.userId.slice(-4)}`}</span>
                      </div>
                      <div className="bug-card-date">
                        <Calendar className="h-4 w-4" />
                        <span>{format(new Date(report.createdAt), 'dd/MM HH:mm', { locale: ptBR })}</span>
                      </div>
                    </div>
                    <div className="bug-card-actions">
                      <Button
                        size="sm"
                        onClick={() => handleCompleteItem(report)}
                        className="complete-btn"
                        disabled={updateBugReport.isPending}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Concluir
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleCancelItem(report)}
                        className="cancel-btn"
                        disabled={updateBugReport.isPending}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Cancelar
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="completed" className="space-y-6">
          {/* Advanced Filter Bar */}
          <div className="advanced-filter-bar">
            <div className="filter-section">
              <div className="filter-group">
                <Filter className="h-4 w-4 text-gray-400" />
                <span className="filter-label">Filtros:</span>
              </div>

              <div className="filter-controls">
                <Select value={pageFilter} onValueChange={setPageFilter}>
                  <SelectTrigger className="filter-select">
                    <SelectValue placeholder="Todas as Páginas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Páginas</SelectItem>
                    {availablePages.filter(p => p !== 'all').map(page => (
                      <SelectItem key={page} value={page}>{page}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="filter-select">
                    <SelectValue placeholder="Todos os Tipos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Tipos</SelectItem>
                    <SelectItem value="bug">🐛 Bugs</SelectItem>
                    <SelectItem value="enhancement">💡 Melhorias</SelectItem>
                    <SelectItem value="suggestion">💭 Sugestões</SelectItem>
                  </SelectContent>
                </Select>

                <div className="search-container">
                  <Search className="h-4 w-4 search-icon" />
                  <Input
                    placeholder="Buscar itens concluídos..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Items Grid */}
          <div className="bug-items-grid">
            {filteredReports.filter(r => r.status === 'resolved' || r.status === 'dismissed').length === 0 ? (
              <div className="empty-state">
                <CheckCircle className="empty-icon" />
                <h3 className="empty-title">Nenhum item concluído</h3>
                <p className="empty-description">
                  {searchTerm || pageFilter !== 'all' || typeFilter !== 'all' 
                    ? 'Tente ajustar os filtros para encontrar itens' 
                    : 'Histórico vazio'}
                </p>
              </div>
            ) : (
              filteredReports.filter(r => r.status === 'resolved' || r.status === 'dismissed').map((report) => (
                <div key={report.id} className="bug-card card-completed">
                  <div className="bug-card-header">
                    <div className="bug-card-icon">
                      {report.type === 'bug' ? '🐛' : report.type === 'enhancement' ? '💡' : '💭'}
                    </div>
                    <div className="bug-card-title-section">
                      <h3 className="bug-card-title">{report.description.substring(0, 50)}...</h3>
                      <div className="bug-card-meta">
                        <span className="bug-card-page">{report.page}</span>
                        <span className="bug-card-separator">|</span>
                        <span className="bug-card-status">
                          {report.status === 'resolved' ? 'Resolvido' : 'Descartado'}
                        </span>
                      </div>
                    </div>
                    <div className="bug-card-menu">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedReport(report)}
                        className="menu-button"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="bug-card-content">
                    <p className="bug-card-description">
                      {report.description}
                    </p>
                    {report.adminNotes && (
                      <div className="admin-notes">
                        <strong>Notas do Admin:</strong> {report.adminNotes}
                      </div>
                    )}
                  </div>

                  <div className="bug-card-footer">
                    <div className="bug-card-info">
                      <div className="bug-card-user">
                        <User className="h-4 w-4" />
                        <span>Usuário: {report.userId === 'USER-0001' ? 'Ricardo' : 
                               report.userId === 'USER-0002' ? 'Ana Silva' : 
                               report.userId === 'USER-0003' ? 'João Santos' : 
                               `ID: ${report.userId.slice(-4)}`}</span>
                      </div>
                      <div className="bug-card-date">
                        <Calendar className="h-4 w-4" />
                        <span>{format(new Date(report.createdAt), 'dd/MM HH:mm', { locale: ptBR })}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
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

      {/* Professional Admin Modals */}
      <ApproveItemModal
        isOpen={approveModalOpen}
        onClose={() => setApproveModalOpen(false)}
        item={selectedModalItem}
      />

      <RejectItemModal
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        item={selectedModalItem}
      />

      <EditItemModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        item={selectedModalItem}
      />
    </div>
  );
}
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, Zap, BarChart3, Settings, Users, CheckCircle, AlertCircle } from 'lucide-react';

interface PermissionPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  permissions: string[];
  title: string;
  description?: string;
}

const PERMISSION_CATEGORIES = {
  admin: {
    label: 'Administração',
    icon: Shield,
    color: 'bg-red-100 text-red-800 border-red-200',
    description: 'Controle total do sistema'
  },
  features: {
    label: 'Funcionalidades',
    icon: Zap,
    color: 'bg-green-100 text-green-800 border-green-200',
    description: 'Acesso a recursos específicos'
  },
  analytics: {
    label: 'Analytics',
    icon: BarChart3,
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    description: 'Relatórios e análises'
  },
  core: {
    label: 'Essenciais',
    icon: Settings,
    color: 'bg-gray-100 text-gray-800 border-gray-200',
    description: 'Funcionalidades básicas'
  }
};

const PERMISSION_DETAILS = {
  admin_full: { name: 'Administração Completa', category: 'admin', risk: 'high' },
  user_management: { name: 'Gestão de Usuários', category: 'admin', risk: 'high' },
  system_config: { name: 'Configuração do Sistema', category: 'admin', risk: 'high' },
  dashboard_access: { name: 'Dashboard', category: 'core', risk: 'low' },
  warm_up_access: { name: 'Warm-up', category: 'features', risk: 'low' },
  grind_access: { name: 'Grind Sessions', category: 'features', risk: 'low' },
  analytics_access: { name: 'Analytics', category: 'analytics', risk: 'medium' },
  user_analytics: { name: 'Analytics de Usuários', category: 'analytics', risk: 'medium' },
  executive_reports: { name: 'Relatórios Executivos', category: 'analytics', risk: 'high' },
  studies_access: { name: 'Estudos', category: 'features', risk: 'low' },
  upload_access: { name: 'Upload', category: 'features', risk: 'low' },
  grade_planner_access: { name: 'Grade Planner', category: 'features', risk: 'low' },
  weekly_planner_access: { name: 'Weekly Planner', category: 'features', risk: 'low' },
  performance_access: { name: 'Performance', category: 'features', risk: 'low' },
  mental_prep_access: { name: 'Mental Prep', category: 'features', risk: 'low' },
  grind_session_access: { name: 'Grind Session', category: 'features', risk: 'low' }
};

const PermissionPreviewModal: React.FC<PermissionPreviewModalProps> = ({
  isOpen,
  onClose,
  permissions,
  title,
  description
}) => {
  const groupedPermissions = permissions.reduce((acc, permission) => {
    const details = PERMISSION_DETAILS[permission as keyof typeof PERMISSION_DETAILS];
    if (!details) return acc;
    
    const category = details.category;
    if (!acc[category]) acc[category] = [];
    acc[category].push({ id: permission, ...details });
    return acc;
  }, {} as Record<string, any[]>);

  const getRiskStats = () => {
    const stats = { high: 0, medium: 0, low: 0 };
    permissions.forEach(permission => {
      const details = PERMISSION_DETAILS[permission as keyof typeof PERMISSION_DETAILS];
      if (details) stats[details.risk]++;
    });
    return stats;
  };

  const riskStats = getRiskStats();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <span>{title}</span>
          </DialogTitle>
          {description && (
            <p className="text-sm text-gray-600 mt-2">{description}</p>
          )}
        </DialogHeader>

        <div className="space-y-6">
          {/* Resumo de Segurança */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Análise de Segurança</h3>
                <Badge className="flex items-center space-x-1">
                  <Users className="h-3 w-3" />
                  <span>{permissions.length} permissões</span>
                </Badge>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="flex items-center justify-center space-x-1 mb-2">
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-medium text-red-600">Alto Risco</span>
                  </div>
                  <div className="text-2xl font-bold text-red-600">{riskStats.high}</div>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center space-x-1 mb-2">
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm font-medium text-yellow-600">Médio Risco</span>
                  </div>
                  <div className="text-2xl font-bold text-yellow-600">{riskStats.medium}</div>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center space-x-1 mb-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium text-green-600">Baixo Risco</span>
                  </div>
                  <div className="text-2xl font-bold text-green-600">{riskStats.low}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Permissões por Categoria */}
          <div className="space-y-4">
            {Object.entries(groupedPermissions).map(([categoryKey, categoryPermissions]) => {
              const category = PERMISSION_CATEGORIES[categoryKey as keyof typeof PERMISSION_CATEGORIES];
              if (!category) return null;
              
              const Icon = category.icon;
              
              return (
                <Card key={categoryKey}>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2 mb-3">
                      <Icon className="h-5 w-5 text-gray-600" />
                      <h3 className="font-semibold text-gray-900">{category.label}</h3>
                      <Badge variant="outline" className="text-xs">
                        {categoryPermissions.length} permissões
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">{category.description}</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {categoryPermissions.map(permission => (
                        <div key={permission.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <span className="text-sm font-medium">{permission.name}</span>
                          <Badge 
                            className={`text-xs ${
                              permission.risk === 'high' ? 'bg-red-100 text-red-800' :
                              permission.risk === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-green-100 text-green-800'
                            }`}
                          >
                            {permission.risk === 'high' ? 'Alto' : 
                             permission.risk === 'medium' ? 'Médio' : 'Baixo'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Ações */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Fechar
            </Button>
            <Button onClick={onClose} className="bg-red-600 hover:bg-red-700">
              Confirmar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PermissionPreviewModal;
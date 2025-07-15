import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { PermissionTag, getPermissionTags } from './PermissionTag';

interface PermissionManagerProps {
  selectedPermissions: string[];
  onPermissionsChange: (permissions: string[]) => void;
}

const ALL_PERMISSIONS = [
  { id: 'dashboard_access', name: 'Dashboard', category: 'Analytics' },
  { id: 'upload_access', name: 'Import', category: 'Data' },
  { id: 'grade_planner_access', name: 'Grade', category: 'Planejamento' },
  { id: 'grind_access', name: 'Grind', category: 'Sessões' },
  { id: 'grind_session_access', name: 'Grind Sessions', category: 'Sessões' },
  { id: 'warm_up_access', name: 'Warm Up', category: 'Sessões' },
  { id: 'weekly_planner_access', name: 'Calendario', category: 'Planejamento' },
  { id: 'studies_access', name: 'Estudos', category: 'Premium' },
  { id: 'performance_access', name: 'Analytics', category: 'Analytics' },
  { id: 'admin_full', name: 'Admin Full', category: 'Admin' },
  { id: 'user_management', name: 'Usuarios', category: 'Admin' },
  { id: 'system_config', name: 'Bugs', category: 'Admin' },
  { id: 'analytics_access', name: 'Ferramentas', category: 'Analytics' },
  { id: 'mental_prep_access', name: 'Biblioteca', category: 'Premium' },
  { id: 'user_analytics', name: 'User Analytics', category: 'Admin' },
  { id: 'executive_reports', name: 'Executive Reports', category: 'Admin' },
];

const PREDEFINED_ROLES = {
  'basico': {
    name: 'Básico',
    description: 'Grade + Grind',
    permissions: ['grade_planner_access', 'grind_access', 'grind_session_access'],
    tags: ['BASICO']
  },
  'premium': {
    name: 'Premium', 
    description: 'Grade + Grind + Dashboard + Import',
    permissions: ['grade_planner_access', 'grind_access', 'grind_session_access', 'dashboard_access', 'upload_access'],
    tags: ['PREMIUM']
  },
  'pro': {
    name: 'Pro',
    description: 'Grade + Grind + Dashboard + Import + Warm Up + Calendario + Estudos + Biblioteca',
    permissions: ['grade_planner_access', 'grind_access', 'grind_session_access', 'dashboard_access', 'upload_access', 'warm_up_access', 'weekly_planner_access', 'studies_access', 'mental_prep_access'],
    tags: ['PRO']
  },
  'admin': {
    name: 'Admin',
    description: 'TODAS as funcionalidades',
    permissions: ['admin_full', 'user_management', 'system_config', 'dashboard_access', 'analytics_access', 'user_analytics', 'executive_reports', 'studies_access', 'grind_access', 'warm_up_access', 'upload_access', 'grade_planner_access', 'weekly_planner_access', 'performance_access', 'mental_prep_access', 'grind_session_access'],
    tags: ['ADMIN']
  }
};

export default function PermissionManager({ selectedPermissions, onPermissionsChange }: PermissionManagerProps) {
  const [activeTab, setActiveTab] = useState<'roles' | 'custom'>('roles');

  const handleRoleSelect = (roleKey: string) => {
    const role = PREDEFINED_ROLES[roleKey as keyof typeof PREDEFINED_ROLES];
    if (role) {
      onPermissionsChange(role.permissions);
    }
  };

  const handlePermissionToggle = (permissionId: string) => {
    const updated = selectedPermissions.includes(permissionId)
      ? selectedPermissions.filter(p => p !== permissionId)
      : [...selectedPermissions, permissionId];
    onPermissionsChange(updated);
  };

  const groupedPermissions = ALL_PERMISSIONS.reduce((acc, permission) => {
    if (!acc[permission.category]) {
      acc[permission.category] = [];
    }
    acc[permission.category].push(permission);
    return acc;
  }, {} as Record<string, typeof ALL_PERMISSIONS>);

  const currentTags = getPermissionTags(selectedPermissions);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 mb-4">
        <Button
          variant={activeTab === 'roles' ? 'default' : 'outline'}
          onClick={() => setActiveTab('roles')}
          size="sm"
          className="text-[#000000]"
        >
          Perfis Predefinidos
        </Button>
        <Button
          variant={activeTab === 'custom' ? 'default' : 'outline'}
          onClick={() => setActiveTab('custom')}
          size="sm"
          className="text-[#000000]"
        >
          Permissões Personalizadas
        </Button>
      </div>

      {currentTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-sm font-medium">Tags ativas:</span>
          {currentTags.map(tag => (
            <PermissionTag key={tag} tag={tag} />
          ))}
        </div>
      )}

      {activeTab === 'roles' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(PREDEFINED_ROLES).map(([key, role]) => (
            <Card key={key} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
              <CardHeader>
                <CardTitle className="text-sm">{role.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">{role.description}</p>
                <div className="flex flex-wrap gap-1 mb-3">
                  {role.tags.map(tag => (
                    <PermissionTag key={tag} tag={tag} variant="outline" />
                  ))}
                </div>
                <Button 
                  onClick={() => handleRoleSelect(key)}
                  variant="outline" 
                  size="sm"
                  className="w-full text-[#000000]"
                >
                  Aplicar Perfil
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {activeTab === 'custom' && (
        <div className="space-y-4">
          {Object.entries(groupedPermissions).map(([category, permissions]) => (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="text-sm">{category}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {permissions.map(permission => (
                    <div key={permission.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={permission.id}
                        checked={selectedPermissions.includes(permission.id)}
                        onCheckedChange={() => handlePermissionToggle(permission.id)}
                      />
                      <Label htmlFor={permission.id} className="text-sm">
                        {permission.name}
                      </Label>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
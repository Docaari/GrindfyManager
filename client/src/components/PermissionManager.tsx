import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { PermissionTag, getPermissionTags, getPermissionsFromTags } from './PermissionTag';

interface PermissionManagerProps {
  selectedPermissions: string[];
  onPermissionsChange: (permissions: string[]) => void;
}

const ALL_PERMISSIONS = [
  { id: 'dashboard_access', name: 'Dashboard', category: 'Analytics' },
  { id: 'analytics_access', name: 'Analytics', category: 'Analytics' },
  { id: 'upload_access', name: 'Upload', category: 'Data' },
  { id: 'grind_access', name: 'Grind', category: 'Game' },
  { id: 'grind_session_access', name: 'Grind Sessions', category: 'Game' },
  { id: 'warm_up_access', name: 'Warm Up', category: 'Game' },
  { id: 'mental_prep_access', name: 'Mental Prep', category: 'Game' },
  { id: 'studies_access', name: 'Studies', category: 'Premium' },
  { id: 'grade_planner_access', name: 'Grade Planner', category: 'Premium' },
  { id: 'weekly_planner_access', name: 'Weekly Planner', category: 'Premium' },
  { id: 'performance_access', name: 'Performance', category: 'Analytics' },
  { id: 'admin_full', name: 'Admin Full', category: 'Admin' },
  { id: 'user_management', name: 'User Management', category: 'Admin' },
  { id: 'system_config', name: 'System Config', category: 'Admin' },
  { id: 'user_analytics', name: 'User Analytics', category: 'Admin' },
  { id: 'executive_reports', name: 'Executive Reports', category: 'Admin' },
];

const PREDEFINED_ROLES = {
  'basico': {
    name: 'Básico',
    description: 'Apenas ferramentas de jogo',
    permissions: getPermissionsFromTags(['GRIND']),
    tags: ['GRIND']
  },
  'premium': {
    name: 'Premium', 
    description: 'Jogo + análises de dados',
    permissions: getPermissionsFromTags(['GRIND', 'ANALISE_DB']),
    tags: ['GRIND', 'ANALISE_DB']
  },
  'pro': {
    name: 'Pro',
    description: 'Acesso completo a todas as funcionalidades',
    permissions: getPermissionsFromTags(['GRIND', 'ANALISE_DB', 'PREMIUM']),
    tags: ['GRIND', 'ANALISE_DB', 'PREMIUM']
  },
  'admin': {
    name: 'Admin',
    description: 'Controle total do sistema',
    permissions: getPermissionsFromTags(['GRIND', 'ANALISE_DB', 'PREMIUM', 'ADMIN']),
    tags: ['GRIND', 'ANALISE_DB', 'PREMIUM', 'ADMIN']
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
        >
          Perfis Predefinidos
        </Button>
        <Button
          variant={activeTab === 'custom' ? 'default' : 'outline'}
          onClick={() => setActiveTab('custom')}
          size="sm"
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
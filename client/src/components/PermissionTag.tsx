import React from 'react';
import { Badge } from '@/components/ui/badge';

export interface PermissionTagProps {
  tag: string;
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
}

export const PermissionTag: React.FC<PermissionTagProps> = ({ tag, variant = 'default' }) => {
  const tagConfig = {
    GRIND: { label: 'Grind', color: 'bg-blue-500' },
    ANALISE_DB: { label: 'Analytics', color: 'bg-green-500' },
    PREMIUM: { label: 'Premium', color: 'bg-purple-500' },
    ADMIN: { label: 'Admin', color: 'bg-red-500' },
  };

  const config = tagConfig[tag as keyof typeof tagConfig] || { label: tag, color: 'bg-gray-500' };

  return (
    <Badge variant={variant} className={`${config.color} text-white`}>
      {config.label}
    </Badge>
  );
};

export const getPermissionTags = (permissions: string[]): string[] => {
  const tags: string[] = [];
  
  if (permissions.some(p => p.includes('admin'))) {
    tags.push('ADMIN');
  }
  
  if (permissions.some(p => p.includes('grind') || p.includes('session'))) {
    tags.push('GRIND');
  }
  
  if (permissions.some(p => p.includes('analytics') || p.includes('dashboard'))) {
    tags.push('ANALISE_DB');
  }
  
  if (permissions.some(p => p.includes('premium') || p.includes('pro'))) {
    tags.push('PREMIUM');
  }
  
  return tags;
};

export const getPermissionsFromTags = (tags: string[]): string[] => {
  const permissionMap: Record<string, string[]> = {
    GRIND: [
      'grind_access',
      'grind_session_access',
      'warm_up_access',
      'mental_prep_access'
    ],
    ANALISE_DB: [
      'dashboard_access',
      'analytics_access',
      'performance_access',
      'upload_access'
    ],
    PREMIUM: [
      'studies_access',
      'grade_planner_access',
      'weekly_planner_access',
      'executive_reports'
    ],
    ADMIN: [
      'admin_full',
      'user_management',
      'system_config',
      'user_analytics'
    ]
  };

  return tags.flatMap(tag => permissionMap[tag] || []);
};
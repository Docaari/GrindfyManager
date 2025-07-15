import React from 'react';
import { Badge } from '@/components/ui/badge';

export interface PermissionTagProps {
  tag: string;
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
}

export const PermissionTag: React.FC<PermissionTagProps> = ({ tag, variant = 'default' }) => {
  const tagConfig = {
    BASICO: { label: 'Básico', color: 'bg-blue-500' },
    PREMIUM: { label: 'Premium', color: 'bg-green-500' },
    PRO: { label: 'Pro', color: 'bg-purple-500' },
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
  } else if (permissions.some(p => p.includes('studies') || p.includes('weekly_planner'))) {
    tags.push('PRO');
  } else if (permissions.some(p => p.includes('dashboard') || p.includes('upload'))) {
    tags.push('PREMIUM');
  } else if (permissions.some(p => p.includes('grade') || p.includes('grind'))) {
    tags.push('BASICO');
  }
  
  return tags;
};


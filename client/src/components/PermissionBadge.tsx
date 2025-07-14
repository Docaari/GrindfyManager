import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Shield, Zap, BarChart3, Settings } from 'lucide-react';

export interface PermissionBadgeProps {
  permission: string;
  category: 'admin' | 'features' | 'analytics' | 'core';
  variant?: 'small' | 'medium' | 'large';
  interactive?: boolean;
  onClick?: () => void;
}

const CATEGORY_CONFIG = {
  admin: {
    color: 'bg-red-100 text-red-800 border-red-200',
    icon: Shield,
    label: 'Admin'
  },
  features: {
    color: 'bg-green-100 text-green-800 border-green-200',
    icon: Zap,
    label: 'Features'
  },
  analytics: {
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: BarChart3,
    label: 'Analytics'
  },
  core: {
    color: 'bg-gray-100 text-gray-800 border-gray-200',
    icon: Settings,
    label: 'Core'
  }
};

const PERMISSION_NAMES = {
  admin_full: 'Administração Completa',
  user_management: 'Gestão de Usuários',
  system_config: 'Configuração do Sistema',
  dashboard_access: 'Dashboard',
  warm_up_access: 'Warm-up',
  grind_access: 'Grind Sessions',
  analytics_access: 'Analytics',
  user_analytics: 'Analytics de Usuários',
  executive_reports: 'Relatórios Executivos',
  studies_access: 'Estudos',
  upload_access: 'Upload',
  grade_planner_access: 'Grade Planner',
  weekly_planner_access: 'Weekly Planner',
  performance_access: 'Performance',
  mental_prep_access: 'Mental Prep',
  grind_session_access: 'Grind Session'
};

export const PermissionBadge: React.FC<PermissionBadgeProps> = ({
  permission,
  category,
  variant = 'medium',
  interactive = false,
  onClick
}) => {
  const config = CATEGORY_CONFIG[category];
  const Icon = config.icon;
  const displayName = PERMISSION_NAMES[permission as keyof typeof PERMISSION_NAMES] || permission;
  
  const sizeClasses = {
    small: 'text-xs px-2 py-1',
    medium: 'text-sm px-3 py-1',
    large: 'text-base px-4 py-2'
  };
  
  const iconSizes = {
    small: 'h-3 w-3',
    medium: 'h-4 w-4',
    large: 'h-5 w-5'
  };

  return (
    <Badge
      className={`
        ${config.color} 
        ${sizeClasses[variant]} 
        flex items-center space-x-1 
        border transition-all duration-200
        ${interactive ? 'cursor-pointer hover:scale-105 hover:shadow-sm' : ''}
      `}
      onClick={onClick}
    >
      <Icon className={iconSizes[variant]} />
      <span>{displayName}</span>
    </Badge>
  );
};

export default PermissionBadge;
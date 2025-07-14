import React from 'react';
import { Star, Crown, Gem, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface UserLevelIndicatorProps {
  permissions: string[];
  className?: string;
}

export type UserLevel = 'basico' | 'premium' | 'pro' | 'admin';

export const getUserLevel = (permissions: string[]): UserLevel => {
  const hasAdmin = permissions.some(p => p.includes('admin') || p.includes('user_management') || p.includes('system_config'));
  const permissionCount = permissions.length;
  
  if (hasAdmin) return 'admin';
  if (permissionCount >= 11) return 'pro';
  if (permissionCount >= 4) return 'premium';
  return 'basico';
};

const LEVEL_CONFIG = {
  basico: {
    icon: Star,
    label: 'Básico',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    description: '1-3 permissões básicas'
  },
  premium: {
    icon: Crown,
    label: 'Premium',
    color: 'bg-green-100 text-green-800 border-green-200',
    description: '4-10 permissões incluindo features'
  },
  pro: {
    icon: Gem,
    label: 'Pro',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
    description: '11+ permissões, analytics avançados'
  },
  admin: {
    icon: Shield,
    label: 'Admin',
    color: 'bg-red-100 text-red-800 border-red-200',
    description: 'Inclui permissões administrativas'
  }
};

export const UserLevelIndicator: React.FC<UserLevelIndicatorProps> = ({
  permissions,
  className = ''
}) => {
  const level = getUserLevel(permissions);
  const config = LEVEL_CONFIG[level];
  const Icon = config.icon;
  
  const getPermissionBreakdown = () => {
    const admin = permissions.filter(p => p.includes('admin') || p.includes('user_management') || p.includes('system_config'));
    const features = permissions.filter(p => p.includes('access') && !admin.includes(p));
    const analytics = permissions.filter(p => p.includes('analytics') || p.includes('reports'));
    
    return {
      admin: admin.length,
      features: features.length,
      analytics: analytics.length,
      total: permissions.length
    };
  };
  
  const breakdown = getPermissionBreakdown();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            className={`
              ${config.color} 
              flex items-center space-x-1 
              border transition-all duration-200
              hover:scale-105 hover:shadow-sm
              ${className}
            `}
          >
            <Icon className="h-3 w-3" />
            <span>{config.label}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-2">
            <div className="font-medium">{config.label}</div>
            <div className="text-sm text-gray-600">{config.description}</div>
            <div className="text-xs space-y-1">
              <div>Total: {breakdown.total} permissões</div>
              {breakdown.admin > 0 && (
                <div>🛡️ Admin: {breakdown.admin}</div>
              )}
              {breakdown.features > 0 && (
                <div>⚡ Features: {breakdown.features}</div>
              )}
              {breakdown.analytics > 0 && (
                <div>📊 Analytics: {breakdown.analytics}</div>
              )}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default UserLevelIndicator;
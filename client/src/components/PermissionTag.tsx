import React from 'react';
import { BarChart, Gamepad, Crown } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type PermissionTagType = 'ANALISE_DB' | 'GRIND' | 'PREMIUM';

interface PermissionTagConfig {
  name: string;
  icon: React.ComponentType<any>;
  color: string;
  bgColor: string;
  borderColor: string;
  permissions: string[];
  description: string;
}

const tagConfigs: Record<PermissionTagType, PermissionTagConfig> = {
  ANALISE_DB: {
    name: 'ANALISE DB',
    icon: BarChart,
    color: '#3b82f6',
    bgColor: 'bg-blue-500/20',
    borderColor: 'border-blue-500/30',
    permissions: ['dashboard_access', 'performance_access', 'upload_access', 'analytics_access'],
    description: 'Acesso a análises e dados'
  },
  GRIND: {
    name: 'GRIND',
    icon: Gamepad,
    color: '#24c25e',
    bgColor: 'bg-[#24c25e]/20',
    borderColor: 'border-[#24c25e]/30',
    permissions: ['grind_access', 'warm_up_access', 'mental_prep_access', 'grind_session_access'],
    description: 'Ferramentas de jogo'
  },
  PREMIUM: {
    name: 'PREMIUM',
    icon: Crown,
    color: '#8b5cf6',
    bgColor: 'bg-purple-500/20',
    borderColor: 'border-purple-500/30',
    permissions: ['weekly_planner_access', 'grade_planner_access', 'studies_access'],
    description: 'Recursos avançados'
  }
};

interface PermissionTagProps {
  tag: PermissionTagType;
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
}

export const PermissionTag: React.FC<PermissionTagProps> = ({ 
  tag, 
  size = 'md', 
  showTooltip = true 
}) => {
  const config = tagConfigs[tag];
  const Icon = config.icon;
  
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-2 text-base'
  };
  
  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  };

  const tagElement = (
    <div className={`
      inline-flex items-center rounded-full 
      ${config.bgColor} ${config.borderColor} border
      ${sizeClasses[size]} font-medium
      transition-all duration-200 hover:scale-105
    `}>
      <Icon 
        className={`${iconSizes[size]} mr-2`}
        style={{ color: config.color }}
      />
      <span style={{ color: config.color }}>
        {config.name}
      </span>
    </div>
  );

  if (!showTooltip) {
    return tagElement;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-pointer">
            {tagElement}
          </div>
        </TooltipTrigger>
        <TooltipContent className="bg-gray-800 border-gray-700 text-white">
          <div className="space-y-2">
            <div className="font-medium">{config.description}</div>
            <div className="space-y-1">
              <div className="text-sm text-gray-300">Permissões incluídas:</div>
              <div className="text-xs text-gray-400">
                {config.permissions.map(perm => (
                  <div key={perm}>• {perm.replace(/_/g, ' ')}</div>
                ))}
              </div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// Função utilitária para converter permissões em tags
export const getPermissionTags = (permissions: string[]): PermissionTagType[] => {
  const tags: PermissionTagType[] = [];
  
  // Verificar ANALISE_DB
  if (tagConfigs.ANALISE_DB.permissions.some(perm => permissions.includes(perm))) {
    tags.push('ANALISE_DB');
  }
  
  // Verificar GRIND
  if (tagConfigs.GRIND.permissions.some(perm => permissions.includes(perm))) {
    tags.push('GRIND');
  }
  
  // Verificar PREMIUM
  if (tagConfigs.PREMIUM.permissions.some(perm => permissions.includes(perm))) {
    tags.push('PREMIUM');
  }
  
  return tags;
};

// Função utilitária para converter tags em permissões
export const getPermissionsFromTags = (tags: PermissionTagType[]): string[] => {
  const permissions: string[] = [];
  
  tags.forEach(tag => {
    permissions.push(...tagConfigs[tag].permissions);
  });
  
  return [...new Set(permissions)]; // Remove duplicatas
};

export default PermissionTag;
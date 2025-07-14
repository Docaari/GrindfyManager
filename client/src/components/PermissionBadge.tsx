import React from 'react';
import { Badge } from '@/components/ui/badge';

interface PermissionBadgeProps {
  permission: string;
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
}

export default function PermissionBadge({ permission, variant = 'outline' }: PermissionBadgeProps) {
  const getPermissionDisplay = (perm: string) => {
    const displayMap: Record<string, { label: string; color: string }> = {
      'dashboard_access': { label: 'Dashboard', color: 'bg-blue-500' },
      'analytics_access': { label: 'Analytics', color: 'bg-green-500' },
      'upload_access': { label: 'Upload', color: 'bg-yellow-500' },
      'grind_access': { label: 'Grind', color: 'bg-purple-500' },
      'grind_session_access': { label: 'Sessions', color: 'bg-purple-400' },
      'warm_up_access': { label: 'Warm Up', color: 'bg-orange-500' },
      'studies_access': { label: 'Studies', color: 'bg-indigo-500' },
      'grade_planner_access': { label: 'Planner', color: 'bg-pink-500' },
      'performance_access': { label: 'Performance', color: 'bg-teal-500' },
      'admin_full': { label: 'Admin', color: 'bg-red-500' },
      'user_management': { label: 'Users', color: 'bg-red-400' },
      'system_config': { label: 'System', color: 'bg-gray-500' },
    };

    return displayMap[perm] || { label: perm, color: 'bg-gray-400' };
  };

  const { label, color } = getPermissionDisplay(permission);

  return (
    <Badge variant={variant} className={`${color} text-white text-xs`}>
      {label}
    </Badge>
  );
}
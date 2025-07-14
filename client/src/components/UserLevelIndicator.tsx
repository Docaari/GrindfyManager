import React from 'react';
import { Crown, Star, Gem, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface UserLevelIndicatorProps {
  permissions: string[];
  className?: string;
}

export default function UserLevelIndicator({ permissions, className = '' }: UserLevelIndicatorProps) {
  const hasAdminPermissions = permissions.some(p => p.includes('admin'));
  const hasPremiumPermissions = permissions.some(p => p.includes('premium') || p.includes('pro'));
  const hasAnalyticsPermissions = permissions.some(p => p.includes('analytics') || p.includes('dashboard'));
  const hasGrindPermissions = permissions.some(p => p.includes('grind') || p.includes('session'));

  if (hasAdminPermissions) {
    return (
      <Badge variant="destructive" className={`${className} bg-red-500`}>
        <Shield className="h-3 w-3 mr-1" />
        Admin
      </Badge>
    );
  }

  if (hasPremiumPermissions) {
    return (
      <Badge variant="default" className={`${className} bg-purple-500`}>
        <Crown className="h-3 w-3 mr-1" />
        Pro
      </Badge>
    );
  }

  if (hasAnalyticsPermissions) {
    return (
      <Badge variant="secondary" className={`${className} bg-blue-500 text-white`}>
        <Star className="h-3 w-3 mr-1" />
        Premium
      </Badge>
    );
  }

  if (hasGrindPermissions) {
    return (
      <Badge variant="outline" className={`${className} bg-green-500 text-white`}>
        <Gem className="h-3 w-3 mr-1" />
        Básico
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={className}>
      Usuário
    </Badge>
  );
}
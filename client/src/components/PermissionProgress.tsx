import React from 'react';
import { CheckCircle, Loader2, Clock, User } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

interface User {
  id: string;
  email: string;
  username: string;
  status: 'active' | 'inactive' | 'blocked';
}

interface PermissionProgressProps {
  isProcessing: boolean;
  selectedUsers: User[];
  processedUsers: string[];
  currentUser?: string;
  profileName: string;
  permissionCount: number;
  progress: number;
  estimatedTimeRemaining: number;
}

const PermissionProgress: React.FC<PermissionProgressProps> = ({
  isProcessing,
  selectedUsers,
  processedUsers,
  currentUser,
  profileName,
  permissionCount,
  progress,
  estimatedTimeRemaining
}) => {
  if (!isProcessing) return null;

  const getUserDisplayName = (userId: string) => {
    const user = selectedUsers.find(u => u.id === userId);
    return user?.username || user?.email || userId;
  };

  return (
    <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
          <span className="font-medium text-blue-800">
            Aplicando perfil {profileName} para {selectedUsers.length} usuário(s)...
          </span>
        </div>
        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
          {permissionCount} permissões
        </Badge>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-gray-600">
          <span>{processedUsers.length} de {selectedUsers.length} usuários processados</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            ~{estimatedTimeRemaining.toFixed(1)}s restantes
          </span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Current User Being Processed */}
      {currentUser && (
        <div className="flex items-center gap-2 text-sm text-blue-700">
          <User className="w-4 h-4" />
          <span>Processando: <strong>{getUserDisplayName(currentUser)}</strong></span>
        </div>
      )}

      {/* User Status List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-32 overflow-y-auto">
        {selectedUsers.map((user) => {
          const isProcessed = processedUsers.includes(user.id);
          const isCurrentlyProcessing = currentUser === user.id;
          
          return (
            <div
              key={user.id}
              className={`flex items-center gap-2 p-2 rounded text-sm transition-all duration-300 ${
                isProcessed
                  ? 'bg-green-100 text-green-800 border border-green-200'
                  : isCurrentlyProcessing
                  ? 'bg-blue-100 text-blue-800 border border-blue-200 animate-pulse'
                  : 'bg-gray-100 text-gray-600 border border-gray-200'
              }`}
            >
              {isProcessed ? (
                <CheckCircle className="w-4 h-4 text-green-600" />
              ) : isCurrentlyProcessing ? (
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
              ) : (
                <div className="w-4 h-4 rounded-full bg-gray-300" />
              )}
              <span className="truncate">
                {user.username || user.email}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PermissionProgress;
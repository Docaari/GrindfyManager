import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requiredPermission 
}) => {
  const { isAuthenticated, isLoading, hasPermission } = useAuth();
  const [, setLocation] = useLocation();

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto mb-4"></div>
          <p className="text-white">Verificando autenticação...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    setLocation('/login');
    return null;
  }

  // Check specific permission if required
  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <AccessDenied />;
  }

  return <>{children}</>;
};

const AccessDenied: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-gray-800 rounded-lg p-8 shadow-lg">
          <div className="text-6xl mb-4">🚫</div>
          <h1 className="text-2xl font-bold text-white mb-4">Acesso Negado</h1>
          <p className="text-gray-300 mb-6">
            Você não tem permissão para acessar esta funcionalidade.
          </p>
          
          <div className="space-y-3">
            <a
              href="https://wa.me/5511999999999"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center"
            >
              <span className="mr-2">📱</span>
              Solicitar Acesso via WhatsApp
            </a>
            
            <a
              href="https://discord.gg/grindfy"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center"
            >
              <span className="mr-2">💬</span>
              Contatar Suporte no Discord
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProtectedRoute;
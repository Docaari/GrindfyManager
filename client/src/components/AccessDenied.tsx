import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock, MessageCircle, Phone } from 'lucide-react';

interface AccessDeniedProps {
  featureName: string;
  description?: string;
}

const AccessDenied: React.FC<AccessDeniedProps> = ({ 
  featureName, 
  description = "Você não tem acesso a essa funcionalidade." 
}) => {
  const handleWhatsApp = () => {
    const message = encodeURIComponent(`Olá! Gostaria de fazer upgrade da minha conta Grindfy para acessar: ${featureName}`);
    window.open(`https://wa.me/5511999999999?text=${message}`, '_blank');
  };

  const handleDiscord = () => {
    window.open('https://discord.gg/grindfy', '_blank');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
            <Lock className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900 dark:text-white">
            ❌ Acesso Negado
          </CardTitle>
          <CardDescription className="text-gray-600 dark:text-gray-300">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Funcionalidade: {featureName}
            </h3>
            <p className="text-gray-600 dark:text-gray-300">
              Para fazer upgrade da sua conta, entre em contato:
            </p>
          </div>
          
          <div className="space-y-3">
            <Button 
              onClick={handleWhatsApp}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              <Phone className="w-4 h-4 mr-2" />
              WhatsApp
            </Button>
            
            <Button 
              onClick={handleDiscord}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              Discord
            </Button>
          </div>
          
          <div className="text-center pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Upgrade rápido e fácil para liberar todas as funcionalidades!
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AccessDenied;
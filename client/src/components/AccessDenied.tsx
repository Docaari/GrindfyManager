import React from 'react';
import { Lock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface AccessDeniedProps {
  currentPlan: string;
  requiredPlan: string;
  pageName: string;
  onViewPlans: () => void;
}

export default function AccessDenied({ 
  currentPlan, 
  requiredPlan, 
  pageName, 
  onViewPlans 
}: AccessDeniedProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <Card className="max-w-md w-full bg-gray-800 border-gray-700 shadow-2xl">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
            <Lock className="w-8 h-8 text-red-400" />
          </div>
          <div>
            <CardTitle className="text-2xl text-white mb-2">
              Acesso Restrito
            </CardTitle>
            <p className="text-gray-300">
              Você não tem permissão para acessar esta página
            </p>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-white mb-2">
                {pageName}
              </h3>
              <p className="text-gray-400 text-sm">
                Esta funcionalidade requer um plano superior
              </p>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
              <div className="flex flex-col">
                <span className="text-sm text-gray-400">Seu plano atual</span>
                <Badge variant="secondary" className="w-fit mt-1">
                  {currentPlan}
                </Badge>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-500" />
              <div className="flex flex-col">
                <span className="text-sm text-gray-400">Plano necessário</span>
                <Badge variant="default" className="w-fit mt-1 bg-red-500 hover:bg-red-600">
                  {requiredPlan}
                </Badge>
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            <Button 
              onClick={onViewPlans}
              className="w-full bg-red-500 hover:bg-red-600 text-white"
            >
              Ver Planos
            </Button>
            
            <Button 
              variant="outline" 
              className="w-full border-gray-600 text-gray-300 hover:bg-gray-700"
              onClick={() => window.history.back()}
            >
              Voltar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
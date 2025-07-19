import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { BarChart3, Target, User, Trophy } from 'lucide-react';
import { WelcomeNameModal } from '@/components/WelcomeNameModal';

export function HomePage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);

  useEffect(() => {
    // Check if user needs to set a display name (first time login)
    if (user && (!user.name || user.name.trim() === '')) {
      // Check if user has been here before using localStorage
      const hasSetName = localStorage.getItem(`hasSetName_${user.userPlatformId}`);
      if (!hasSetName) {
        setShowWelcomeModal(true);
      }
    }
  }, [user]);

  const handleWelcomeComplete = () => {
    setShowWelcomeModal(false);
    // Mark that user has set their name
    if (user) {
      localStorage.setItem(`hasSetName_${user.userPlatformId}`, 'true');
    }
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      {/* Welcome Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">
          Bem-vindo ao Grindfy, {user?.name || user?.firstName || 'Jogador'}! 🎯
        </h1>
        <p className="text-xl text-gray-400">
          Sua plataforma completa de análise e otimização de performance no poker
        </p>
      </div>

      {/* Quick Access Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card 
          className="bg-gray-800 border-gray-700 hover:bg-gray-750 transition-colors cursor-pointer"
          onClick={() => setLocation('/dashboard')}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-5 h-5 text-red-500" />
              <CardTitle className="text-lg text-white">Dashboard</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-gray-400">
              Visualize suas métricas e performance
            </CardDescription>
          </CardContent>
        </Card>

        <Card 
          className="bg-gray-800 border-gray-700 hover:bg-gray-750 transition-colors cursor-pointer"
          onClick={() => setLocation('/grade')}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-2">
              <Target className="w-5 h-5 text-blue-500" />
              <CardTitle className="text-lg text-white">Grade Planner</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-gray-400">
              Planeje seus torneios da semana
            </CardDescription>
          </CardContent>
        </Card>

        <Card 
          className="bg-gray-800 border-gray-700 hover:bg-gray-750 transition-colors cursor-pointer"
          onClick={() => setLocation('/grind')}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-2">
              <Trophy className="w-5 h-5 text-yellow-500" />
              <CardTitle className="text-lg text-white">Grind Session</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-gray-400">
              Monitore sessões ao vivo
            </CardDescription>
          </CardContent>
        </Card>

        <Card 
          className="bg-gray-800 border-gray-700 hover:bg-gray-750 transition-colors cursor-pointer"
          onClick={() => setLocation('/import')}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-2">
              <User className="w-5 h-5 text-green-500" />
              <CardTitle className="text-lg text-white">Import</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-gray-400">
              Importe seus dados de torneios
            </CardDescription>
          </CardContent>
        </Card>
      </div>

      {/* Getting Started */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-2xl text-white">Primeiros Passos</CardTitle>
          <CardDescription className="text-gray-400">
            Configure sua conta e comece a otimizar sua performance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <h3 className="font-semibold text-white">1. Importe seus dados</h3>
              <p className="text-sm text-gray-400">
                Faça upload dos seus históricos de torneios para começar a análise
              </p>
              <Button 
                onClick={() => setLocation('/import')}
                className="w-full bg-red-600 hover:bg-red-700 text-white"
              >
                Importar Dados
              </Button>
            </div>
            
            <div className="space-y-2">
              <h3 className="font-semibold text-white">2. Visualize métricas</h3>
              <p className="text-sm text-gray-400">
                Analise seu ROI, ITM%, Final Tables e outras métricas importantes
              </p>
              <Button 
                onClick={() => setLocation('/dashboard')}
                variant="outline"
                className="w-full border-gray-600 text-gray-300 hover:bg-gray-800"
              >
                Ver Dashboard
              </Button>
            </div>
            
            <div className="space-y-2">
              <h3 className="font-semibold text-white">3. Planeje sessões</h3>
              <p className="text-sm text-gray-400">
                Use o Grade Planner para organizar seus torneios e otimizar resultados
              </p>
              <Button 
                onClick={() => setLocation('/grade')}
                variant="outline"
                className="w-full border-gray-600 text-gray-300 hover:bg-gray-800"
              >
                Planejar Grade
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Info */}
      <div className="mt-8 text-center">
        <p className="text-sm text-gray-500">
          Plano atual: <span className="font-semibold text-gray-300 capitalize">{user?.subscriptionPlan || 'Básico'}</span>
        </p>
      </div>

      {/* Welcome Name Modal */}
      <WelcomeNameModal 
        open={showWelcomeModal}
        onComplete={handleWelcomeComplete}
      />
    </div>
  );
}

export default HomePage;
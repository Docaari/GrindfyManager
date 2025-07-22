import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Link } from 'wouter';
import { 
  BarChart3, 
  Upload, 
  Calendar, 
  Zap, 
  BookOpen, 
  Brain, 
  GraduationCap, 
  CalendarDays, 
  Calculator,
  Clock,
  TrendingUp,
  FileText,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface QuickStats {
  totalTournaments: number;
  lastSessionDate: string;
  totalProfit: number;
  currentStreak: number;
}

const Home: React.FC = () => {
  const { user } = useAuth();
  
  // Fetch quick stats for welcome section
  const { data: quickStats } = useQuery<QuickStats>({
    queryKey: ['/api/dashboard/quick-stats'],
    queryFn: () => apiRequest('GET', '/api/dashboard/quick-stats'),
  });

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  const mainTools = [
    {
      title: 'Dashboard',
      description: 'Analise seus Resultados',
      subtitle: 'Métricas detalhadas e gráficos de performance',
      icon: BarChart3,
      href: '/dashboard',
      color: 'from-blue-500/20 to-blue-600/20',
      borderColor: 'border-blue-500/30',
      hoverColor: 'hover:border-blue-400'
    },
    {
      title: 'Import',
      description: 'Importe seus Históricos',
      subtitle: 'Carregue dados de torneios de qualquer site',
      icon: Upload,
      href: '/upload',
      color: 'from-green-500/20 to-green-600/20',
      borderColor: 'border-green-500/30',
      hoverColor: 'hover:border-green-400'
    },
    {
      title: 'Grade',
      description: 'Planeje sua Grade',
      subtitle: 'Organize torneios e estratégias semanais',
      icon: Calendar,
      href: '/grade',
      color: 'from-purple-500/20 to-purple-600/20',
      borderColor: 'border-purple-500/30',
      hoverColor: 'hover:border-purple-400'
    },
    {
      title: 'Grind',
      description: 'Sessão ao Vivo',
      subtitle: 'Acompanhe sessões em tempo real',
      icon: Zap,
      href: '/grind',
      color: 'from-red-500/20 to-red-600/20',
      borderColor: 'border-red-500/30',
      hoverColor: 'hover:border-red-400'
    }
  ];

  const comingSoonTools = [
    {
      title: 'Biblioteca',
      description: 'Análise individual de torneios',
      icon: BookOpen,
      color: 'from-orange-500/10 to-orange-600/10'
    },
    {
      title: 'Warm Up',
      description: 'Preparação para grind',
      icon: Brain,
      color: 'from-pink-500/10 to-pink-600/10'
    },
    {
      title: 'Estudos',
      description: 'Organização de estudos',
      icon: GraduationCap,
      color: 'from-indigo-500/10 to-indigo-600/10'
    },
    {
      title: 'Calendário',
      description: 'Rotina completa',
      icon: CalendarDays,
      color: 'from-teal-500/10 to-teal-600/10'
    },
    {
      title: 'Ferramentas',
      description: 'Calculadoras (RPs, Bets, Mysterys, Bounty Power)',
      icon: Calculator,
      color: 'from-yellow-500/10 to-yellow-600/10'
    }
  ];

  const onboardingSteps = [
    {
      step: 1,
      title: 'Importar Dados',
      description: 'Carregue seus históricos de torneios',
      action: 'Ir para Import',
      href: '/upload',
      icon: Upload,
      completed: (quickStats?.totalTournaments || 0) > 0
    },
    {
      step: 2,
      title: 'Analisar Resultados',
      description: 'Visualize suas métricas e performance',
      action: 'Ir para Dashboard',
      href: '/dashboard',
      icon: TrendingUp,
      completed: (quickStats?.totalTournaments || 0) > 10
    },
    {
      step: 3,
      title: 'Planejar Grade',
      description: 'Organize sua grade de torneios',
      action: 'Ir para Grade',
      href: '/grade',
      icon: Calendar,
      completed: false
    },
    {
      step: 4,
      title: 'Iniciar Grind',
      description: 'Acompanhe sessões ao vivo',
      action: 'Ir para Grind',
      href: '/grind',
      icon: Zap,
      completed: false
    }
  ];

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Welcome Section */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-white">
            {getGreeting()}, {user?.firstName || user?.name || 'Jogador'}! 🎯
          </h1>
          <p className="text-xl text-gray-300">
            Bem-vindo ao seu hub central de poker profissional
          </p>
          
          {quickStats && (
            <div className="flex justify-center items-center gap-8 mt-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-400">
                  {quickStats.totalTournaments}
                </div>
                <div className="text-sm text-gray-400">Torneios</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">
                  ${quickStats.totalProfit?.toLocaleString() || '0'}
                </div>
                <div className="text-sm text-gray-400">Lucro Total</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-400">
                  {quickStats.currentStreak || 0}
                </div>
                <div className="text-sm text-gray-400">Streak Atual</div>
              </div>
            </div>
          )}
        </div>

        {/* Main Tools Grid */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-emerald-400" />
            Ferramentas Principais
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {mainTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <Link key={tool.title} href={tool.href}>
                  <Card className={`
                    bg-gradient-to-br ${tool.color} 
                    border ${tool.borderColor} ${tool.hoverColor}
                    hover:scale-[1.02] transition-all duration-300 
                    cursor-pointer h-full
                    hover:shadow-lg hover:shadow-emerald-500/10
                  `}>
                    <CardHeader className="pb-4">
                      <div className="flex items-center justify-between">
                        <Icon className="w-8 h-8 text-white" />
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      </div>
                      <CardTitle className="text-white text-xl">
                        {tool.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-emerald-300 font-medium mb-2">
                        {tool.description}
                      </p>
                      <p className="text-gray-400 text-sm">
                        {tool.subtitle}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Onboarding Section */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
            <Clock className="w-6 h-6 text-blue-400" />
            Como Começar
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {onboardingSteps.map((step) => {
              const Icon = step.icon;
              return (
                <Card key={step.step} className={`
                  bg-gray-800/50 border-gray-700 
                  ${step.completed ? 'border-emerald-500/50' : 'border-gray-600'}
                  hover:border-gray-500 transition-all duration-300
                `}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`
                          w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                          ${step.completed ? 'bg-emerald-500 text-white' : 'bg-gray-600 text-gray-300'}
                        `}>
                          {step.completed ? '✓' : step.step}
                        </div>
                        <Icon className={`w-5 h-5 ${step.completed ? 'text-emerald-400' : 'text-gray-400'}`} />
                      </div>
                      {step.completed && (
                        <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                          Completo
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-white text-lg">
                      {step.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-gray-400 text-sm mb-4">
                      {step.description}
                    </p>
                    <Link href={step.href}>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className={`
                          w-full ${step.completed ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10' : 'border-gray-600 text-gray-300 hover:bg-gray-700'}
                        `}
                      >
                        {step.action}
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Coming Soon Section */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
            <FileText className="w-6 h-6 text-yellow-400" />
            Em Desenvolvimento
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {comingSoonTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <Card key={tool.title} className={`
                  bg-gradient-to-br ${tool.color} 
                  border-gray-700 hover:border-gray-600
                  transition-all duration-300 opacity-75
                  cursor-not-allowed
                `}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <Icon className="w-6 h-6 text-gray-400" />
                      <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                        Em Breve
                      </Badge>
                    </div>
                    <CardTitle className="text-gray-300 text-lg">
                      {tool.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-gray-500 text-sm">
                      {tool.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Quick Actions Footer */}
        <section className="pt-8 border-t border-gray-700">
          <div className="text-center space-y-4">
            <p className="text-gray-400">
              Pronto para começar sua sessão? Acesse suas ferramentas rapidamente
            </p>
            <div className="flex justify-center gap-4 flex-wrap">
              <Link href="/upload">
                <Button variant="outline" className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
                  <Upload className="w-4 h-4 mr-2" />
                  Importar Dados
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button variant="outline" className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Ver Dashboard
                </Button>
              </Link>
              <Link href="/grind">
                <Button variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10">
                  <Zap className="w-4 h-4 mr-2" />
                  Iniciar Grind
                </Button>
              </Link>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
};

export default Home;
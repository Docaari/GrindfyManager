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
      href: '/dashboard'
    },
    {
      title: 'Import',
      description: 'Importe seus Históricos',
      subtitle: 'Carregue dados de torneios de qualquer site',
      icon: Upload,
      href: '/upload'
    },
    {
      title: 'Grade',
      description: 'Planeje sua Grade',
      subtitle: 'Organize torneios e estratégias semanais',
      icon: Calendar,
      href: '/coach'
    },
    {
      title: 'Grind',
      description: 'Sessão ao Vivo',
      subtitle: 'Acompanhe sessões em tempo real',
      icon: Zap,
      href: '/grind'
    }
  ];

  const comingSoonTools = [
    {
      title: 'Biblioteca',
      description: 'Análise individual de torneios',
      icon: BookOpen
    },
    {
      title: 'Warm Up',
      description: 'Preparação para grind',
      icon: Brain
    },
    {
      title: 'Estudos',
      description: 'Organização de estudos',
      icon: GraduationCap
    },
    {
      title: 'Calendário',
      description: 'Rotina completa',
      icon: CalendarDays
    },
    {
      title: 'Ferramentas',
      description: 'Calculadoras (RPs, Bets, Mysterys, Bounty Power)',
      icon: Calculator
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
      href: '/coach',
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
      <div className="max-w-7xl mx-auto space-y-12">
        
        {/* Welcome Section */}
        <div className="text-center space-y-6">
          <h1 className="text-4xl font-bold text-white">
            {getGreeting()}, {user?.firstName || user?.name || 'Jogador'}! 🎯
          </h1>
          <p className="text-xl text-gray-300">
            Bem-vindo ao seu hub central de poker profissional
          </p>
          
          {quickStats && (
            <div className="flex justify-center items-center gap-12 mt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-emerald-400">
                  {quickStats.totalTournaments}
                </div>
                <div className="text-sm text-gray-400 font-medium">Torneios Upados</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-emerald-400">
                  12
                </div>
                <div className="text-sm text-gray-400 font-medium">Sessões Registradas</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-emerald-400">
                  3
                </div>
                <div className="text-sm text-gray-400 font-medium">Grades Planejadas</div>
              </div>
            </div>
          )}
        </div>

        {/* Main Tools Grid */}
        <section>
          <h2 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-emerald-400" />
            Ferramentas Principais
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8">
            {mainTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <Link key={tool.title} href={tool.href}>
                  <Card className="
                    bg-slate-800/70 hover:bg-slate-800 
                    border-slate-700/50 hover:border-emerald-500/30
                    hover:scale-[1.02] transition-all duration-300 
                    cursor-pointer h-full
                    hover:shadow-xl hover:shadow-emerald-500/20
                    backdrop-blur-sm
                  ">
                    <CardHeader className="pb-6">
                      <div className="flex items-center justify-between">
                        <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                          <Icon className="w-8 h-8 text-emerald-400" />
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-500" />
                      </div>
                      <CardTitle className="text-white text-2xl font-bold mt-4">
                        {tool.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-emerald-300 font-semibold mb-3 text-lg">
                        {tool.description}
                      </p>
                      <p className="text-gray-400 text-sm leading-relaxed">
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
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
            <Clock className="w-6 h-6 text-emerald-400" />
            Como Começar
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {onboardingSteps.map((step) => {
              const Icon = step.icon;
              return (
                <Card key={step.step} className={`
                  bg-slate-800/40 border-slate-700/50 
                  ${step.completed ? 'border-emerald-500/40 bg-emerald-500/5' : ''}
                  hover:border-slate-600 transition-all duration-300
                  backdrop-blur-sm
                `}>
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`
                        w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
                        ${step.completed ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-gray-300'}
                      `}>
                        {step.completed ? '✓' : step.step}
                      </div>
                      <Icon className={`w-6 h-6 ${step.completed ? 'text-emerald-400' : 'text-gray-400'}`} />
                      {step.completed && (
                        <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 ml-auto">
                          ✓
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-white text-lg font-semibold">
                      {step.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-gray-400 text-sm mb-4 leading-relaxed">
                      {step.description}
                    </p>
                    <Link href={step.href}>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className={`
                          w-full ${step.completed ? 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 bg-emerald-500/5' : 'border-slate-600 text-gray-300 hover:bg-slate-700'}
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
          <h2 className="text-xl font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-gray-400" />
            Em Desenvolvimento
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {comingSoonTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <Card key={tool.title} className="
                  bg-slate-800/30 border-slate-700/30
                  transition-all duration-300 opacity-60
                  cursor-not-allowed h-auto
                ">
                  <CardHeader className="pb-2 pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <Icon className="w-5 h-5 text-gray-500" />
                      <Badge variant="outline" className="bg-gray-600/20 text-gray-400 border-gray-600/30 text-xs">
                        Breve
                      </Badge>
                    </div>
                    <CardTitle className="text-gray-400 text-sm font-medium">
                      {tool.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 pb-4">
                    <p className="text-gray-500 text-xs">
                      {tool.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Quick Actions Footer */}
        <section className="pt-12 border-t border-slate-700/50">
          <div className="text-center space-y-6">
            <p className="text-gray-400 text-lg">
              Pronto para começar sua sessão? Acesse suas ferramentas rapidamente
            </p>
            <div className="flex justify-center gap-6 flex-wrap">
              <Link href="/upload">
                <Button variant="outline" className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 bg-emerald-500/5 px-6 py-3">
                  <Upload className="w-5 h-5 mr-3" />
                  Importar Dados
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button variant="outline" className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 bg-emerald-500/5 px-6 py-3">
                  <BarChart3 className="w-5 h-5 mr-3" />
                  Ver Dashboard
                </Button>
              </Link>
              <Link href="/grind">
                <Button variant="outline" className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 bg-emerald-500/5 px-6 py-3">
                  <Zap className="w-5 h-5 mr-3" />
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
import React, { useState, useEffect } from 'react';
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
  Sparkles,
  MessageCircle,
  Mail,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { WelcomeNameModal } from '@/components/WelcomeNameModal';

interface QuickStats {
  totalTournaments: number;
  lastSessionDate: string;
  totalProfit: number;
  currentStreak: number;
}

const Home: React.FC = () => {
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

  // Fetch quick stats for welcome section
  const { data: quickStats, isLoading, isError, refetch } = useQuery<QuickStats>({
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

  if (isError) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h3 className="text-xl font-semibold text-white">Erro ao carregar dados</h3>
          <p className="text-gray-400">Não foi possível carregar os dados.</p>
          <Button onClick={() => refetch()} variant="outline" className="text-white border-gray-600">
            <RefreshCw className="w-4 h-4 mr-2" />
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-center space-y-6">
            <Skeleton className="h-10 w-80 bg-gray-700 mx-auto" />
            <Skeleton className="h-6 w-96 bg-gray-700 mx-auto" />
            <div className="flex justify-center items-center gap-12 mt-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="text-center">
                  <Skeleton className="h-8 w-16 bg-gray-700 mx-auto mb-1" />
                  <Skeleton className="h-4 w-24 bg-gray-700" />
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8">
            {[1, 2, 3, 4].map(i => (
              <Card key={i} className="bg-slate-800/70 border-slate-700/50 h-48">
                <CardHeader className="pb-6">
                  <Skeleton className="h-14 w-14 bg-gray-700 rounded-xl" />
                  <Skeleton className="h-6 w-32 bg-gray-700 mt-4" />
                </CardHeader>
                <CardContent className="pt-0">
                  <Skeleton className="h-5 w-40 bg-gray-700 mb-2" />
                  <Skeleton className="h-4 w-full bg-gray-700" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

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

        {/* Contact/Community Section */}
        <section>
          <h2 className="text-xl font-semibold text-gray-300 mb-6 flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-emerald-400" />
            Contato & Comunidade
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Discord Card */}
            <a 
              href="https://discord.gg/MPJh3pub" 
              target="_blank" 
              rel="noopener noreferrer"
              className="block"
            >
              <Card className="
                bg-slate-800/50 border-slate-700/50 
                hover:bg-slate-800/70 hover:border-emerald-500/30
                transition-all duration-300 cursor-pointer
                hover:scale-[1.02] hover:shadow-lg hover:shadow-emerald-500/10
                backdrop-blur-sm
              ">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                      <MessageCircle className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                      <CardTitle className="text-white text-lg font-semibold">
                        Discord
                      </CardTitle>
                      <p className="text-gray-400 text-sm">
                        Se junte à nossa comunidade
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-500 ml-auto" />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-emerald-300 text-sm">
                    Conecte-se com outros jogadores, compartilhe experiências e receba suporte
                  </p>
                </CardContent>
              </Card>
            </a>

            {/* Email Card */}
            <a 
              href="mailto:support@grindfyapp.com" 
              className="block"
            >
              <Card className="
                bg-slate-800/50 border-slate-700/50 
                hover:bg-slate-800/70 hover:border-emerald-500/30
                transition-all duration-300 cursor-pointer
                hover:scale-[1.02] hover:shadow-lg hover:shadow-emerald-500/10
                backdrop-blur-sm
              ">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                      <Mail className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                      <CardTitle className="text-white text-lg font-semibold">
                        Email
                      </CardTitle>
                      <p className="text-gray-400 text-sm">
                        support@grindfyapp.com
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-500 ml-auto" />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-emerald-300 text-sm">
                    Entre em contato para suporte técnico ou dúvidas gerais
                  </p>
                </CardContent>
              </Card>
            </a>

          </div>
        </section>

      </div>

      {/* Welcome Name Modal */}
      <WelcomeNameModal
        open={showWelcomeModal}
        onComplete={handleWelcomeComplete}
      />
    </div>
  );
};

export default Home;
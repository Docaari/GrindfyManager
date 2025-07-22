import React from 'react';
import { Lock, ArrowRight, TrendingUp, Upload, Calendar, Zap, BookOpen, Calculator, Users, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface AccessDeniedProps {
  featureName: string;
  description: string;
  currentPlan: string;
  requiredPlan: string;
  pageName: string;
  onViewPlans: () => void;
}

// Mapeamento de ícones por página
const getFeatureIcon = (pageName: string) => {
  const iconMap: { [key: string]: React.ReactNode } = {
    'Dashboard': <BarChart3 className="w-16 h-16 text-emerald-400" />,
    'Import': <Upload className="w-16 h-16 text-emerald-400" />,
    'Grade': <Calendar className="w-16 h-16 text-emerald-400" />,
    'Grind': <TrendingUp className="w-16 h-16 text-emerald-400" />,
    'Warm Up': <Zap className="w-16 h-16 text-emerald-400" />,
    'Calendário': <Calendar className="w-16 h-16 text-emerald-400" />,
    'Estudos': <BookOpen className="w-16 h-16 text-emerald-400" />,
    'Ferramentas': <Calculator className="w-16 h-16 text-emerald-400" />,
    'Usuarios': <Users className="w-16 h-16 text-emerald-400" />
  };
  return iconMap[pageName] || <Lock className="w-16 h-16 text-emerald-400" />;
};

// Mapeamento de emojis por página
const getFeatureEmoji = (pageName: string) => {
  const emojiMap: { [key: string]: string } = {
    'Dashboard': '📊',
    'Import': '📤',
    'Grade': '📅',
    'Grind': '🎮',
    'Warm Up': '🔥',
    'Calendário': '🗓️',
    'Estudos': '📚',
    'Ferramentas': '🧮',
    'Usuarios': '👥'
  };
  return emojiMap[pageName] || '🔒';
};

export default function AccessDenied({ 
  featureName,
  description,
  currentPlan, 
  requiredPlan, 
  pageName, 
  onViewPlans 
}: AccessDeniedProps) {
  const featureIcon = getFeatureIcon(pageName);
  const featureEmoji = getFeatureEmoji(pageName);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(16,185,129,0.1),rgba(0,0,0,0))]"></div>
      
      <div className="relative z-10 container mx-auto px-4 py-12 max-w-4xl">
        {/* Header Section - Inspirado na Home */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            {featureIcon}
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            {featureEmoji} {featureName}
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            {description}
          </p>
        </div>

        {/* Status Section */}
        <div className="flex justify-center mb-12">
          <Card className="bg-slate-800/70 border-slate-700 p-6 max-w-md w-full">
            <div className="flex items-center justify-between">
              <div className="text-center">
                <span className="text-sm text-gray-400 block mb-2">Seu plano atual</span>
                <Badge variant="secondary" className="bg-slate-700 text-slate-200">
                  {currentPlan}
                </Badge>
              </div>
              <ArrowRight className="w-6 h-6 text-gray-500 mx-4" />
              <div className="text-center">
                <span className="text-sm text-gray-400 block mb-2">Plano necessário</span>
                <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {requiredPlan}
                </Badge>
              </div>
            </div>
          </Card>
        </div>

        {/* Action Cards Section - Inspirado na Home */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          {/* Card Demo (somente para Dashboard) */}
          {pageName === 'Dashboard' && (
            <Card className="bg-slate-800/70 border-slate-700 hover:border-emerald-500/50 transition-all duration-300 hover:bg-slate-800/90 cursor-pointer group">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-slate-600 transition-colors">
                  <BarChart3 className="w-6 h-6 text-gray-400 group-hover:text-emerald-400 transition-colors" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Testar com Dados Demo</h3>
                <p className="text-gray-400 text-sm">
                  Visualizar exemplos da funcionalidade
                </p>
              </CardContent>
            </Card>
          )}

          {/* Card Principal - Upgrade */}
          <Card 
            className="bg-gradient-to-br from-emerald-600 to-emerald-700 border-emerald-500 hover:from-emerald-500 hover:to-emerald-600 transition-all duration-300 cursor-pointer transform hover:scale-105 hover:shadow-lg hover:shadow-emerald-500/20"
            onClick={onViewPlans}
          >
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                {pageName === 'Dashboard' ? 'Fazer Upgrade' : 'Ver Planos Premium'}
              </h3>
              <p className="text-emerald-50 text-sm">
                Desbloqueie todas as funcionalidades
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Voltar Button */}
        <div className="text-center mt-8">
          <Button 
            variant="ghost" 
            className="text-gray-400 hover:text-white hover:bg-slate-800"
            onClick={() => window.history.back()}
          >
            ← Voltar
          </Button>
        </div>
      </div>
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useLocation } from 'wouter';
import { 
  Brain, 
  Settings, 
  Play, 
  Droplets, 
  Dumbbell, 
  Sparkles, 
  Eye, 
  Utensils,
  Zap,
  Target,
  TrendingUp,
  Heart,
  CheckCircle2,
  Circle
} from 'lucide-react';

interface WarmUpActivity {
  id: string;
  name: string;
  icon: React.ComponentType<any>;
  points: number;
  enabled: boolean;
  completed: boolean;
  weight: number;
  category: 'physical' | 'mental' | 'practical';
}

interface MentalState {
  energia: number;
  foco: number;
  confianca: number;
  equilibrio: number;
}

const defaultActivities: WarmUpActivity[] = [
  {
    id: 'banho-gelado',
    name: 'Banho Gelado',
    icon: Droplets,
    points: 10,
    enabled: true,
    completed: false,
    weight: 2,
    category: 'physical'
  },
  {
    id: 'atividade-fisica',
    name: 'Atividade Física',
    icon: Dumbbell,
    points: 15,
    enabled: true,
    completed: false,
    weight: 3,
    category: 'physical'
  },
  {
    id: 'hidratacao',
    name: 'Hidratação',
    icon: Droplets,
    points: 8,
    enabled: true,
    completed: false,
    weight: 1,
    category: 'physical'
  },
  {
    id: 'meditacao',
    name: 'Meditação',
    icon: Sparkles,
    points: 20,
    enabled: true,
    completed: false,
    weight: 4,
    category: 'mental'
  },
  {
    id: 'visualizacao',
    name: 'Visualização',
    icon: Eye,
    points: 15,
    enabled: true,
    completed: false,
    weight: 3,
    category: 'mental'
  },
  {
    id: 'preparacao-pratica',
    name: 'Preparação Prática',
    icon: Utensils,
    points: 8,
    enabled: true,
    completed: false,
    weight: 2,
    category: 'practical'
  }
];

export default function MentalPrep() {
  const [, setLocation] = useLocation();
  const [activities, setActivities] = useState<WarmUpActivity[]>(defaultActivities);
  const [mentalState, setMentalState] = useState<MentalState>({
    energia: 50,
    foco: 50,
    confianca: 50,
    equilibrio: 50
  });
  const [showCustomization, setShowCustomization] = useState(false);
  const [finalScore, setFinalScore] = useState(0);

  // Calcular pontuação do checklist
  const calculateChecklistScore = () => {
    const enabledActivities = activities.filter(a => a.enabled);
    const completedActivities = enabledActivities.filter(a => a.completed);
    
    if (enabledActivities.length === 0) return 0;
    
    const totalPossiblePoints = enabledActivities.reduce((sum, activity) => sum + (activity.points * activity.weight), 0);
    const earnedPoints = completedActivities.reduce((sum, activity) => sum + (activity.points * activity.weight), 0);
    
    return Math.round((earnedPoints / totalPossiblePoints) * 100);
  };

  // Calcular pontuação do estado mental
  const calculateMentalScore = () => {
    const { energia, foco, confianca, equilibrio } = mentalState;
    return Math.round((energia + foco + confianca + equilibrio) / 4);
  };

  // Calcular pontuação final
  const calculateFinalScore = () => {
    const checklistScore = calculateChecklistScore();
    const mentalScore = calculateMentalScore();
    return Math.round((checklistScore * 0.6) + (mentalScore * 0.4));
  };

  // Atualizar pontuação final quando algo muda
  useEffect(() => {
    setFinalScore(calculateFinalScore());
  }, [activities, mentalState]);

  // Função para obter cor baseada na pontuação
  const getScoreColor = (score: number) => {
    if (score <= 40) return 'text-red-400';
    if (score <= 70) return 'text-yellow-400';
    return 'text-green-400';
  };

  // Função para obter cor de fundo baseada na pontuação
  const getScoreBackground = (score: number) => {
    if (score <= 40) return 'bg-red-900/20 border-red-600/30';
    if (score <= 70) return 'bg-yellow-900/20 border-yellow-600/30';
    return 'bg-green-900/20 border-green-600/30';
  };

  // Função para obter feedback textual
  const getScoreFeedback = (score: number) => {
    if (score <= 30) return 'Preparação Insuficiente - Considere mais algumas atividades';
    if (score <= 60) return 'Preparação Moderada - Você está no caminho certo';
    if (score <= 80) return 'Boa Preparação - Pronto para uma sessão sólida';
    return 'Preparação Excelente - Estado ideal para grind';
  };

  // Toggle atividade
  const toggleActivity = (activityId: string) => {
    setActivities(prev => prev.map(activity => 
      activity.id === activityId 
        ? { ...activity, completed: !activity.completed }
        : activity
    ));
  };

  // Atualizar configuração de atividade
  const updateActivityConfig = (activityId: string, field: keyof WarmUpActivity, value: any) => {
    setActivities(prev => prev.map(activity => 
      activity.id === activityId 
        ? { ...activity, [field]: value }
        : activity
    ));
  };

  // Iniciar sessão de grind com pontuação
  const startGrindSession = () => {
    // Redirect para página de grind session passando a pontuação
    setLocation(`/grind-session?preparationScore=${finalScore}`);
  };

  const completedActivities = activities.filter(a => a.enabled && a.completed).length;
  const totalActivities = activities.filter(a => a.enabled).length;

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold mb-2 flex items-center justify-center gap-3">
          <Brain className="w-8 h-8 text-poker-accent" />
          Warm Up - Preparação Mental
        </h1>
        <p className="text-gray-400">Prepare-se mentalmente para uma sessão de grind de alta performance</p>
      </div>

      {/* Score Display */}
      <div className="mb-8 text-center">
        <div className={`inline-flex items-center gap-4 p-6 rounded-lg border ${getScoreBackground(finalScore)}`}>
          <div className="text-center">
            <div className={`text-6xl font-bold ${getScoreColor(finalScore)}`}>
              {finalScore}%
            </div>
            <div className="text-sm text-gray-400 mt-1">Nota Atual</div>
          </div>
          <div className="text-left max-w-md">
            <p className="text-sm text-gray-300">{getScoreFeedback(finalScore)}</p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center gap-4 mb-8">
        <Dialog open={showCustomization} onOpenChange={setShowCustomization}>
          <DialogTrigger asChild>
            <Button variant="outline" className="border-gray-600 hover:bg-gray-700">
              <Settings className="w-4 h-4 mr-2" />
              Personalizar Warm Up
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] bg-poker-surface border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-white">Personalizar Atividades</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {activities.map(activity => (
                <div key={activity.id} className="flex items-center justify-between p-4 bg-gray-800/50 rounded border border-gray-600">
                  <div className="flex items-center gap-3">
                    <activity.icon className="w-5 h-5 text-poker-accent" />
                    <div>
                      <div className="font-medium text-white">{activity.name}</div>
                      <div className="text-sm text-gray-400">{activity.points} pontos</div>
                    </div>
                  </div>
                  <Switch
                    checked={activity.enabled}
                    onCheckedChange={(checked) => updateActivityConfig(activity.id, 'enabled', checked)}
                  />
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        <Button 
          onClick={startGrindSession}
          className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold px-8"
          disabled={finalScore < 30}
        >
          <Play className="w-4 h-4 mr-2" />
          Iniciar Grind ({finalScore}%)
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Checklist de Preparação */}
        <Card className="bg-poker-surface border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-poker-accent" />
              Checklist de Preparação
              <Badge variant="outline" className="ml-auto">
                {completedActivities}/{totalActivities}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Progress Bar */}
              <div className="mb-6">
                <div className="flex justify-between text-sm text-gray-400 mb-2">
                  <span>Progresso</span>
                  <span>{calculateChecklistScore()}%</span>
                </div>
                <Progress value={calculateChecklistScore()} className="h-2" />
              </div>

              {/* Activities Grid */}
              <div className="grid grid-cols-1 gap-3">
                {activities.filter(a => a.enabled).map(activity => (
                  <div 
                    key={activity.id}
                    className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                      activity.completed 
                        ? 'bg-green-900/20 border-green-600/50 hover:bg-green-900/30' 
                        : 'bg-gray-800/50 border-gray-600 hover:bg-gray-800/70'
                    }`}
                    onClick={() => toggleActivity(activity.id)}
                  >
                    <div className="relative">
                      {activity.completed ? (
                        <CheckCircle2 className="w-6 h-6 text-green-400" />
                      ) : (
                        <Circle className="w-6 h-6 text-gray-400" />
                      )}
                    </div>
                    <activity.icon className={`w-5 h-5 ${activity.completed ? 'text-green-400' : 'text-poker-accent'}`} />
                    <div className="flex-1">
                      <div className={`font-medium ${activity.completed ? 'text-green-400' : 'text-white'}`}>
                        {activity.name}
                      </div>
                      <div className="text-sm text-gray-400">
                        {activity.points * activity.weight} pontos
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Estado Mental */}
        <Card className="bg-poker-surface border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Brain className="w-5 h-5 text-poker-accent" />
              Estado Mental
              <Badge variant="outline" className="ml-auto">
                {calculateMentalScore()}%
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Energia */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-red-400" />
                    <Label className="text-white">Energia</Label>
                  </div>
                  <span className={`font-bold ${getScoreColor(mentalState.energia)}`}>
                    {mentalState.energia}%
                  </span>
                </div>
                <Slider
                  value={[mentalState.energia]}
                  onValueChange={(value) => setMentalState(prev => ({ ...prev, energia: value[0] }))}
                  max={100}
                  step={5}
                  className="w-full"
                />
              </div>

              {/* Foco */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-blue-400" />
                    <Label className="text-white">Foco</Label>
                  </div>
                  <span className={`font-bold ${getScoreColor(mentalState.foco)}`}>
                    {mentalState.foco}%
                  </span>
                </div>
                <Slider
                  value={[mentalState.foco]}
                  onValueChange={(value) => setMentalState(prev => ({ ...prev, foco: value[0] }))}
                  max={100}
                  step={5}
                  className="w-full"
                />
              </div>

              {/* Confiança */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    <Label className="text-white">Confiança</Label>
                  </div>
                  <span className={`font-bold ${getScoreColor(mentalState.confianca)}`}>
                    {mentalState.confianca}%
                  </span>
                </div>
                <Slider
                  value={[mentalState.confianca]}
                  onValueChange={(value) => setMentalState(prev => ({ ...prev, confianca: value[0] }))}
                  max={100}
                  step={5}
                  className="w-full"
                />
              </div>

              {/* Equilíbrio Emocional */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4 text-purple-400" />
                    <Label className="text-white">Equilíbrio</Label>
                  </div>
                  <span className={`font-bold ${getScoreColor(mentalState.equilibrio)}`}>
                    {mentalState.equilibrio}%
                  </span>
                </div>
                <Slider
                  value={[mentalState.equilibrio]}
                  onValueChange={(value) => setMentalState(prev => ({ ...prev, equilibrio: value[0] }))}
                  max={100}
                  step={5}
                  className="w-full"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ferramentas de Apoio - Placeholder para Fase 2 */}
      <Card className="bg-poker-surface border-gray-700 mt-8">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-poker-accent" />
            Ferramentas de Apoio
            <Badge variant="outline" className="ml-2 text-xs">Em Breve</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button variant="outline" disabled className="border-gray-600">
              <Sparkles className="w-4 h-4 mr-2" />
              Timer Meditação
            </Button>
            <Button variant="outline" disabled className="border-gray-600">
              <Eye className="w-4 h-4 mr-2" />
              Guia Visualização
            </Button>
            <Button variant="outline" disabled className="border-gray-600">
              <Play className="w-4 h-4 mr-2" />
              Biblioteca de Áudios
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
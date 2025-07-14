import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import SubscriptionStatus from "@/components/SubscriptionStatus";
import { CreditCard, Plus, Shield, Target, CheckCircle } from "lucide-react";

export default function SubscriptionDemo() {
  const [planType, setPlanType] = useState<'basic' | 'premium' | 'pro'>('basic');
  const [durationDays, setDurationDays] = useState(30);
  const [autoRenewal, setAutoRenewal] = useState(false);
  const [feature, setFeature] = useState('dashboard_access');
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Mutation para criar assinatura
  const createSubscriptionMutation = useMutation({
    mutationFn: async (data: {
      planType: string;
      durationDays: number;
      autoRenewal: boolean;
    }) => {
      const response = await apiRequest('POST', '/api/subscription/create', data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Assinatura criada com sucesso!",
        description: "Sua nova assinatura foi ativada.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/subscription/status'] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar assinatura",
        description: error.message || "Ocorreu um erro inesperado.",
        variant: "destructive",
      });
    }
  });

  // Query para verificar acesso à feature
  const { data: featureAccess, refetch: refetchFeatureAccess } = useQuery({
    queryKey: ['/api/subscription/feature', feature],
    enabled: !!feature,
  });

  // Mutation para atualizar métricas de engajamento
  const updateMetricsMutation = useMutation({
    mutationFn: async (data: {
      dailyLoginStreak?: number;
      weeklySessionCount?: number;
      motivationScore?: number;
    }) => {
      const response = await apiRequest('POST', '/api/subscription/engagement', data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Métricas atualizadas!",
        description: "Suas métricas de engajamento foram atualizadas.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/subscription/status'] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar métricas",
        description: error.message || "Ocorreu um erro inesperado.",
        variant: "destructive",
      });
    }
  });

  const handleCreateSubscription = () => {
    createSubscriptionMutation.mutate({
      planType,
      durationDays,
      autoRenewal
    });
  };

  const handleUpdateMetrics = () => {
    updateMetricsMutation.mutate({
      dailyLoginStreak: Math.floor(Math.random() * 30) + 1,
      weeklySessionCount: Math.floor(Math.random() * 7) + 1,
      motivationScore: Math.floor(Math.random() * 100) + 1
    });
  };

  const handleCheckFeature = () => {
    refetchFeatureAccess();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold text-gray-900">
            Sistema de Assinaturas Grindfy
          </h1>
          <p className="text-lg text-gray-600">
            Demonstração do sistema completo de assinaturas com 3 planos e rastreamento de atividades
          </p>
        </div>

        {/* Status da Assinatura */}
        <SubscriptionStatus />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Criar Nova Assinatura */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Criar Nova Assinatura
              </CardTitle>
              <CardDescription>
                Demonstração de criação de assinaturas com diferentes planos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="planType">Tipo de Plano</Label>
                <Select value={planType} onValueChange={(value: 'basic' | 'premium' | 'pro') => setPlanType(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o plano" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Básico - Funcionalidades essenciais</SelectItem>
                    <SelectItem value="premium">Premium - Recursos avançados</SelectItem>
                    <SelectItem value="pro">Pro - Acesso completo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="duration">Duração (dias)</Label>
                <Input
                  id="duration"
                  type="number"
                  value={durationDays}
                  onChange={(e) => setDurationDays(Number(e.target.value))}
                  min="1"
                  max="365"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch 
                  id="autoRenewal" 
                  checked={autoRenewal}
                  onCheckedChange={setAutoRenewal}
                />
                <Label htmlFor="autoRenewal">Renovação Automática</Label>
              </div>

              <Button 
                onClick={handleCreateSubscription}
                disabled={createSubscriptionMutation.isPending}
                className="w-full"
              >
                <CreditCard className="h-4 w-4 mr-2" />
                {createSubscriptionMutation.isPending ? 'Criando...' : 'Criar Assinatura'}
              </Button>
            </CardContent>
          </Card>

          {/* Verificar Acesso à Feature */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Verificar Acesso à Feature
              </CardTitle>
              <CardDescription>
                Teste o sistema de controle de acesso baseado em assinaturas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="feature">Funcionalidade</Label>
                <Select value={feature} onValueChange={setFeature}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a funcionalidade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dashboard_access">Dashboard</SelectItem>
                    <SelectItem value="analytics_access">Analytics</SelectItem>
                    <SelectItem value="upload_access">Upload</SelectItem>
                    <SelectItem value="studies_access">Estudos</SelectItem>
                    <SelectItem value="grind_access">Grind Sessions</SelectItem>
                    <SelectItem value="warm_up_access">Warm-up Mental</SelectItem>
                    <SelectItem value="grade_planner_access">Grade Planner</SelectItem>
                    <SelectItem value="weekly_planner_access">Weekly Planner</SelectItem>
                    <SelectItem value="performance_access">Performance</SelectItem>
                    <SelectItem value="user_analytics">User Analytics</SelectItem>
                    <SelectItem value="executive_reports">Relatórios Executivos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button 
                onClick={handleCheckFeature}
                variant="outline"
                className="w-full"
              >
                <Target className="h-4 w-4 mr-2" />
                Verificar Acesso
              </Button>

              {featureAccess && (
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className={`h-5 w-5 ${featureAccess.hasAccess ? 'text-green-600' : 'text-red-600'}`} />
                    <span className="font-medium">
                      {featureAccess.hasAccess ? 'Acesso Permitido' : 'Acesso Negado'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-2">
                    Feature: {featureAccess.feature}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Atualizar Métricas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Atualizar Métricas de Engajamento
            </CardTitle>
            <CardDescription>
              Simule atualizações nas métricas de engajamento do usuário
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={handleUpdateMetrics}
              disabled={updateMetricsMutation.isPending}
              variant="outline"
            >
              {updateMetricsMutation.isPending ? 'Atualizando...' : 'Gerar Métricas Aleatórias'}
            </Button>
          </CardContent>
        </Card>

        {/* Informações do Sistema */}
        <Card>
          <CardHeader>
            <CardTitle>Informações do Sistema</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <h4 className="font-medium text-green-600">Plano Básico</h4>
                <ul className="text-sm space-y-1">
                  <li>• Dashboard</li>
                  <li>• Analytics</li>
                  <li>• Upload</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium text-blue-600">Plano Premium</h4>
                <ul className="text-sm space-y-1">
                  <li>• Todas as funcionalidades básicas</li>
                  <li>• Estudos</li>
                  <li>• Grind Sessions</li>
                  <li>• Warm-up Mental</li>
                  <li>• Grade Planner</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium text-purple-600">Plano Pro</h4>
                <ul className="text-sm space-y-1">
                  <li>• Todas as funcionalidades premium</li>
                  <li>• Weekly Planner</li>
                  <li>• Performance Avançada</li>
                  <li>• User Analytics</li>
                  <li>• Relatórios Executivos</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
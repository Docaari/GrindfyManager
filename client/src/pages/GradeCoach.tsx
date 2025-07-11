import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Lightbulb, TrendingUp, TrendingDown, AlertTriangle, Calendar, BarChart3, CheckCircle, X, Eye } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export default function GradeCoach() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Estado para controlar quais dias estão ativos
  const [activeDays, setActiveDays] = useState({
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: true,
    sunday: true
  });

  // Função para alternar o estado de um dia
  const toggleDay = (day: string) => {
    console.log(`Toggling day: ${day}`); // Debug
    setActiveDays(prev => {
      const newState = {
        ...prev,
        [day]: !prev[day]
      };
      console.log('New active days state:', newState); // Debug
      return newState;
    });
  };

  // Mapear dias da semana para labels em português
  const dayLabels = {
    monday: 'Segunda',
    tuesday: 'Terça',
    wednesday: 'Quarta',
    thursday: 'Quinta',
    friday: 'Sexta',
    saturday: 'Sábado',
    sunday: 'Domingo'
  };

  const { data: recommendations, isLoading: recommendationsLoading } = useQuery({
    queryKey: ["/api/coaching/recommendations"],
    queryFn: async () => {
      const response = await fetch("/api/coaching/recommendations", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch recommendations");
      return response.json();
    },
  });

  const { data: insights, isLoading } = useQuery({
    queryKey: ["/api/coaching-insights"],
    queryFn: async () => {
      const response = await fetch("/api/coaching-insights", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch coaching insights");
      return response.json();
    },
  });

  const updateInsightMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PUT", `/api/coaching-insights/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coaching-insights"] });
      toast({
        title: "Insight Updated",
        description: "Your coaching insight has been updated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createInsightMutation = useMutation({
    mutationFn: async (insightData: any) => {
      const response = await apiRequest("POST", "/api/coaching-insights", insightData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coaching-insights"] });
      toast({
        title: "Insight Generated",
        description: "New coaching insight has been created",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleApplyInsight = (insightId: string) => {
    updateInsightMutation.mutate({
      id: insightId,
      data: { isApplied: true, isRead: true }
    });
  };

  const handleMarkAsRead = (insightId: string) => {
    updateInsightMutation.mutate({
      id: insightId,
      data: { isRead: true }
    });
  };

  const handleDismissInsight = (insightId: string) => {
    updateInsightMutation.mutate({
      id: insightId,
      data: { isRead: true }
    });
  };

  const generateSampleInsights = () => {
    const sampleInsights = [
      {
        type: "suggestion",
        category: "roi_optimization",
        title: "ROI Optimization Opportunity",
        description: "Your ROI in $109 PKO tournaments has improved by 12% over the last month. Consider increasing your volume in this format while reducing play in $55 Turbo tournaments where you're showing a -8.5% ROI.",
        priority: 3,
        data: { improvementRate: 12, recommendedAction: "increase_volume" }
      },
      {
        type: "warning",
        category: "schedule_optimization",
        title: "Schedule Optimization",
        description: "Your performance on Tuesday evenings is 15% below your weekly average. Consider shifting some of your Tuesday tournaments to Wednesday or Thursday when you perform better.",
        priority: 2,
        data: { performanceDecrease: 15, suggestedDays: ["Wednesday", "Thursday"] }
      },
      {
        type: "opportunity",
        category: "volume_adjustment",
        title: "Volume Analysis",
        description: "Your tournament volume has been consistent at 8-10 tournaments per session. Your performance metrics suggest you could handle 2-3 additional tournaments without significant ROI impact.",
        priority: 1,
        data: { currentVolume: 9, suggestedIncrease: 2 }
      }
    ];

    sampleInsights.forEach(insight => {
      createInsightMutation.mutate(insight);
    });
  };

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 3: return "border-red-500";
      case 2: return "border-yellow-500";
      case 1: return "border-blue-500";
      default: return "border-gray-500";
    }
  };

  const getPriorityLabel = (priority: number) => {
    switch (priority) {
      case 3: return "High Priority";
      case 2: return "Medium Priority";
      case 1: return "Low Priority";
      default: return "Priority";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "suggestion": return <Lightbulb className="h-5 w-5" />;
      case "warning": return <TrendingUp className="h-5 w-5" />;
      case "opportunity": return <BarChart3 className="h-5 w-5" />;
      default: return <Lightbulb className="h-5 w-5" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "suggestion": return "text-green-400";
      case "warning": return "text-yellow-400";
      case "opportunity": return "text-blue-400";
      default: return "text-gray-400";
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 text-white">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Grade Coach</h2>
          <p className="text-gray-400">Loading your coaching insights...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-poker-bg flex items-center justify-center">
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-white">
        <div className="mb-6">
          <div className="flex flex-col items-center gap-4">
            <div className="text-center">
              <h2 className="text-xl sm:text-2xl font-bold mb-2">Grade Coach</h2>
              <p className="text-gray-400 text-sm sm:text-base">AI-powered insights to optimize your tournament selection</p>
            </div>
          {(!insights || insights.length === 0) && (
              <div className="flex justify-center w-full">
                <Button
                  onClick={generateSampleInsights}
                  disabled={createInsightMutation.isPending}
                  className="bg-poker-green hover:bg-poker-green-light text-white"
                >
                  <Lightbulb className="h-4 w-4 mr-2" />
                  Generate Insights
                </Button>
              </div>
            )}
        </div>
      </div>

      {/* Controle de Dias Ativos */}
        <div className="mb-8">
          <h3 className="text-lg sm:text-xl font-semibold mb-4 text-center">Controle de Dias da Semana</h3>
          <Card className="bg-poker-surface border-gray-700">
            <CardHeader>
              <CardTitle className="text-white text-base sm:text-lg text-center">Ativar/Desativar Dias</CardTitle>
              <CardDescription className="text-gray-400 text-sm sm:text-base text-center">
                Configure quais dias da semana devem ser considerados no planejamento
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4">
              {Object.entries(dayLabels).map(([dayKey, dayLabel]) => (
                  <div key={dayKey} className="flex flex-col items-center gap-2 sm:gap-3 p-1 sm:p-2">
                    <Card className={`w-full p-2 sm:p-3 text-center transition-all duration-200 min-h-[50px] sm:min-h-[60px] flex items-center justify-center ${
                      activeDays[dayKey as keyof typeof activeDays]
                        ? 'bg-poker-green/20 border-poker-green shadow-lg' 
                        : 'bg-gray-800 border-gray-600'
                    }`}>
                      <div className={`font-medium text-xs sm:text-sm ${
                        activeDays[dayKey as keyof typeof activeDays]
                          ? 'text-poker-green' 
                          : 'text-gray-400'
                      }`}>
                        {dayLabel}
                      </div>
                    </Card>
                  <div className="flex flex-col items-center gap-1">
                      <Switch
                        checked={activeDays[dayKey as keyof typeof activeDays]}
                        onCheckedChange={() => toggleDay(dayKey)}
                        className="data-[state=checked]:bg-poker-green data-[state=unchecked]:bg-gray-600 scale-75 sm:scale-100"
                      />
                      <span className={`text-xs font-medium ${
                        activeDays[dayKey as keyof typeof activeDays]
                          ? 'text-poker-green' 
                          : 'text-gray-400'
                      }`}>
                        {activeDays[dayKey as keyof typeof activeDays] ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-gray-800/50 rounded-lg">
              <p className="text-sm text-gray-400">
                💡 <strong>Dica:</strong> Desative os dias em que você não planeja jogar para obter recomendações mais precisas.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Template Performance Recommendations */}
        {recommendations && recommendations.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg sm:text-xl font-semibold mb-4 text-center">Template Performance Analysis</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {recommendations.map((template: any, index: number) => (
              <Card key={index} className="bg-poker-surface border-gray-700">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white text-lg">
                      {template.templateName || `Template ${index + 1}`}
                    </CardTitle>
                    <Badge 
                      variant={template.roi > 10 ? "default" : template.roi < -5 ? "destructive" : "secondary"}
                      className={template.roi > 10 ? "bg-green-600" : template.roi < -5 ? "bg-red-600" : "bg-yellow-600"}
                    >
                      {template.roi > 0 ? '+' : ''}{template.roi.toFixed(1)}% ROI
                    </Badge>
                  </div>
                  <CardDescription className="text-gray-400">
                    {template.site} • {template.category} • {template.count} tournaments
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4">
                    <div>
                      <p className="text-sm text-gray-400">Total Profit</p>
                      <p className="text-white font-mono">
                        ${typeof template.profit === 'number' && template.profit > 0 ? '+' : ''}{typeof template.profit === 'number' ? template.profit.toFixed(2) : '0.00'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Avg Buy-in</p>
                      <p className="text-white font-mono">${typeof template.avgBuyin === 'number' ? template.avgBuyin.toFixed(2) : '0.00'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Final Tables</p>
                      <p className="text-white font-mono">{template.finalTables}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Big Hits</p>
                      <p className="text-white font-mono">{template.bigHits}</p>
                    </div>
                  </div>

                  {template.insights && template.insights.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-gray-300">Coaching Insights:</h4>
                      {template.insights.map((insight: any, insightIndex: number) => (
                        <div key={insightIndex} className={`p-3 rounded-lg border ${
                          insight.type === 'positive' ? 'border-green-500 bg-green-500/10' :
                          insight.type === 'negative' ? 'border-red-500 bg-red-500/10' :
                          'border-yellow-500 bg-yellow-500/10'
                        }`}>
                          <div className="flex items-start gap-2">
                            <div className={`mt-0.5 ${
                              insight.type === 'positive' ? 'text-green-400' :
                              insight.type === 'negative' ? 'text-red-400' :
                              'text-yellow-400'
                            }`}>
                              {insight.type === 'positive' ? <TrendingUp className="h-4 w-4" /> :
                               insight.type === 'negative' ? <TrendingDown className="h-4 w-4" /> :
                               <AlertTriangle className="h-4 w-4" />}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">{insight.title}</p>
                              <p className="text-xs text-gray-400">{insight.description}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {!insights || insights.length === 0 ? (
          <Card className="bg-poker-surface border-gray-700">
            <CardContent className="p-6 sm:p-12 text-center">
              <div className="text-gray-400 mb-6">
                <Lightbulb className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-4 text-poker-green" />
                <h3 className="text-base sm:text-lg font-semibold mb-2">No Coaching Insights Available</h3>
                <p className="text-sm sm:text-base">Upload more tournament data and play sessions to generate personalized insights.</p>
              </div>
              <Button
                onClick={generateSampleInsights}
                disabled={createInsightMutation.isPending}
                className="bg-poker-green hover:bg-poker-green-light text-white w-full sm:w-auto"
              >
                <Lightbulb className="h-4 w-4 mr-2" />
                Generate Sample Insights
              </Button>
            </CardContent>
          </Card>
      ) : (
          <div className="space-y-4 sm:space-y-6">
          {insights.map((insight: any) => (
            <Card key={insight.id} className={`bg-poker-surface border-gray-700 border-l-4 ${getPriorityColor(insight.priority)}`}>
              <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={getTypeColor(insight.type)}>
                        {getTypeIcon(insight.type)}
                      </div>
                      <div className="flex-1">
                        <CardTitle className={`text-base sm:text-lg font-semibold ${getTypeColor(insight.type)}`}>
                          {insight.title}
                        </CardTitle>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${insight.priority === 3 ? 'border-red-500 text-red-400' : 
                            insight.priority === 2 ? 'border-yellow-500 text-yellow-400' : 
                            'border-blue-500 text-blue-400'}`}
                        >
                          {getPriorityLabel(insight.priority)}
                        </Badge>
                        <Badge variant="outline" className="text-xs text-gray-400 border-gray-600">
                          {insight.category.replace(/_/g, ' ').toUpperCase()}
                        </Badge>
                        {insight.isRead && (
                          <Badge variant="outline" className="text-xs text-green-400 border-green-500">
                            <Eye className="h-3 w-3 mr-1" />
                            Read
                          </Badge>
                        )}
                        {insight.isApplied && (
                          <Badge variant="outline" className="text-xs text-green-400 border-green-500">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Applied
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 mb-4">{insight.description}</p>

                {insight.data && (
                  <div className="bg-gray-800 rounded-lg p-4 mb-4">
                    <h4 className="text-sm font-semibold text-white mb-2">Data Insights</h4>
                    <div className="text-xs text-gray-400 space-y-1">
                      {Object.entries(insight.data).map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').toLowerCase()}:</span>
                          <span className="text-white">
                            {typeof value === 'number' && key.includes('Rate') ? `${value}%` : 
                             Array.isArray(value) ? value.join(', ') : 
                             String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  {!insight.isApplied && (
                    <Button
                      onClick={() => handleApplyInsight(insight.id)}
                      disabled={updateInsightMutation.isPending}
                      className={`${insight.priority === 3 ? 'bg-red-600 hover:bg-red-700' :
                        insight.priority === 2 ? 'bg-yellow-600 hover:bg-yellow-700' :
                        'bg-blue-600 hover:bg-blue-700'} text-white`}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Apply Suggestion
                    </Button>
                  )}

                  {!insight.isRead && (
                    <Button
                      onClick={() => handleMarkAsRead(insight.id)}
                      disabled={updateInsightMutation.isPending}
                      variant="outline"
                      className="border-gray-600 text-white hover:bg-gray-700"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Mark as Read
                    </Button>
                  )}

                  <Button
                    onClick={() => handleDismissInsight(insight.id)}
                    disabled={updateInsightMutation.isPending}
                    variant="outline"
                    className="border-gray-600 text-white hover:bg-gray-700"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Insights Summary */}
        {insights && insights.length > 0 && (
          <Card className="bg-poker-surface border-gray-700 mt-6">
            <CardHeader>
              <CardTitle className="text-white text-center">Insights Summary</CardTitle>
              <CardDescription className="text-gray-400 text-center">
                Overview of your coaching recommendations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-white mb-1">
                  {insights.length}
                </div>
                <div className="text-sm text-gray-400">Total Insights</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-400 mb-1">
                  {insights.filter((i: any) => i.priority === 3).length}
                </div>
                <div className="text-sm text-gray-400">High Priority</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400 mb-1">
                  {insights.filter((i: any) => i.isApplied).length}
                </div>
                <div className="text-sm text-gray-400">Applied</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400 mb-1">
                  {insights.filter((i: any) => !i.isRead).length}
                </div>
                <div className="text-sm text-gray-400">Unread</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}
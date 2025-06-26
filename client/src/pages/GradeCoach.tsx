import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, TrendingUp, Calendar, BarChart3, CheckCircle, X, Eye } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function GradeCoach() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
    <div className="p-6 text-white">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">Grade Coach</h2>
            <p className="text-gray-400">AI-powered insights to optimize your tournament selection</p>
          </div>
          {(!insights || insights.length === 0) && (
            <Button
              onClick={generateSampleInsights}
              disabled={createInsightMutation.isPending}
              className="bg-poker-green hover:bg-poker-green-light text-white"
            >
              <Lightbulb className="h-4 w-4 mr-2" />
              Generate Insights
            </Button>
          )}
        </div>
      </div>

      {!insights || insights.length === 0 ? (
        <Card className="bg-poker-surface border-gray-700">
          <CardContent className="p-12 text-center">
            <div className="text-gray-400 mb-6">
              <Lightbulb className="h-16 w-16 mx-auto mb-4 text-poker-green" />
              <h3 className="text-lg font-semibold mb-2">No Coaching Insights Available</h3>
              <p>Upload more tournament data and play sessions to generate personalized insights.</p>
            </div>
            <Button
              onClick={generateSampleInsights}
              disabled={createInsightMutation.isPending}
              className="bg-poker-green hover:bg-poker-green-light text-white"
            >
              <Lightbulb className="h-4 w-4 mr-2" />
              Generate Sample Insights
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {insights.map((insight: any) => (
            <Card key={insight.id} className={`bg-poker-surface border-gray-700 border-l-4 ${getPriorityColor(insight.priority)}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={getTypeColor(insight.type)}>
                      {getTypeIcon(insight.type)}
                    </div>
                    <div>
                      <CardTitle className={`text-lg font-semibold ${getTypeColor(insight.type)}`}>
                        {insight.title}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-1">
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
            <CardTitle className="text-white">Insights Summary</CardTitle>
            <CardDescription className="text-gray-400">
              Overview of your coaching recommendations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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
  );
}

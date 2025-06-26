import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Brain, CheckCircle, Target, BookOpen, TrendingUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function MentalPrep() {
  const [mentalState, setMentalState] = useState(5);
  const [focusLevel, setFocusLevel] = useState(5);
  const [confidenceLevel, setConfidenceLevel] = useState(5);
  const [sessionGoals, setSessionGoals] = useState("");
  const [checklist, setChecklist] = useState({
    reviewedGoals: false,
    breathingExercises: false,
    visualization: false,
    hydration: false,
    environment: false,
  });
  const [focusAreas, setFocusAreas] = useState({
    patience: false,
    aggression: false,
    bankroll: false,
    tableSelection: false,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: preparationLogs, isLoading } = useQuery({
    queryKey: ["/api/preparation-logs"],
    queryFn: async () => {
      const response = await fetch("/api/preparation-logs", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch preparation logs");
      return response.json();
    },
  });

  const createLogMutation = useMutation({
    mutationFn: async (logData: any) => {
      const response = await apiRequest("POST", "/api/preparation-logs", logData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preparation-logs"] });
      toast({
        title: "Preparation Logged",
        description: "Your pre-session preparation has been saved",
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

  const handleChecklistChange = (key: string, checked: boolean) => {
    setChecklist(prev => ({ ...prev, [key]: checked }));
  };

  const handleFocusAreaChange = (key: string, checked: boolean) => {
    setFocusAreas(prev => ({ ...prev, [key]: checked }));
  };

  const handleSavePreparation = () => {
    const exercisesCompleted = Object.entries(checklist)
      .filter(([_, completed]) => completed)
      .map(([exercise, _]) => exercise);

    const logData = {
      mentalState,
      focusLevel,
      confidenceLevel,
      sessionGoals,
      exercisesCompleted,
      warmupCompleted: Object.values(checklist).every(Boolean),
      notes: `Focus areas: ${Object.entries(focusAreas)
        .filter(([_, selected]) => selected)
        .map(([area, _]) => area)
        .join(", ")}`,
    };

    createLogMutation.mutate(logData);
  };

  const getCompletionPercentage = () => {
    const totalItems = Object.keys(checklist).length;
    const completedItems = Object.values(checklist).filter(Boolean).length;
    return (completedItems / totalItems) * 100;
  };

  const getReadinessScore = () => {
    const checklistScore = getCompletionPercentage();
    const mentalScore = ((mentalState + focusLevel + confidenceLevel) / 3) * 10;
    return Math.round((checklistScore + mentalScore) / 2);
  };

  if (isLoading) {
    return (
      <div className="p-6 text-white">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Mental Preparation</h2>
          <p className="text-gray-400">Loading your preparation data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 text-white">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Mental Preparation</h2>
        <p className="text-gray-400">Prepare your mind for optimal performance</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pre-Session Checklist */}
        <Card className="bg-poker-surface border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Pre-Session Checklist
            </CardTitle>
            <CardDescription className="text-gray-400">
              Complete these steps before starting your session
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">Progress</span>
                <span className="text-sm text-white">{Math.round(getCompletionPercentage())}%</span>
              </div>
              <Progress value={getCompletionPercentage()} className="h-2" />
            </div>

            <div className="space-y-3">
              {Object.entries(checklist).map(([key, checked]) => (
                <div key={key} className="flex items-center space-x-2">
                  <Checkbox
                    id={key}
                    checked={checked}
                    onCheckedChange={(checked) => handleChecklistChange(key, checked as boolean)}
                    className="border-gray-600 data-[state=checked]:bg-poker-green data-[state=checked]:border-poker-green"
                  />
                  <label
                    htmlFor={key}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-white"
                  >
                    {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                  </label>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-gray-700">
              <div className="text-center">
                <div className="text-3xl font-bold text-poker-gold mb-1">
                  {getReadinessScore()}%
                </div>
                <div className="text-sm text-gray-400">Session Readiness</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Mental State Assessment */}
        <Card className="bg-poker-surface border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Mental State Assessment
            </CardTitle>
            <CardDescription className="text-gray-400">
              Rate your current mental state (1-10)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-white">Focus Level</label>
                <Badge variant="outline" className="text-poker-gold border-poker-gold">
                  {focusLevel}/10
                </Badge>
              </div>
              <Slider
                value={[focusLevel]}
                onValueChange={(value) => setFocusLevel(value[0])}
                max={10}
                min={1}
                step={1}
                className="w-full"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-white">Confidence Level</label>
                <Badge variant="outline" className="text-poker-gold border-poker-gold">
                  {confidenceLevel}/10
                </Badge>
              </div>
              <Slider
                value={[confidenceLevel]}
                onValueChange={(value) => setConfidenceLevel(value[0])}
                max={10}
                min={1}
                step={1}
                className="w-full"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-white">Mental State</label>
                <Badge variant="outline" className="text-poker-gold border-poker-gold">
                  {mentalState}/10
                </Badge>
              </div>
              <Slider
                value={[mentalState]}
                onValueChange={(value) => setMentalState(value[0])}
                max={10}
                min={1}
                step={1}
                className="w-full"
              />
            </div>

            <div className="pt-4 border-t border-gray-700">
              <div className="grid grid-cols-3 gap-4 text-center text-sm">
                <div>
                  <div className="text-white font-medium">Focus</div>
                  <div className="text-gray-400">{focusLevel}/10</div>
                </div>
                <div>
                  <div className="text-white font-medium">Confidence</div>
                  <div className="text-gray-400">{confidenceLevel}/10</div>
                </div>
                <div>
                  <div className="text-white font-medium">Mental</div>
                  <div className="text-gray-400">{mentalState}/10</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Session Goals */}
        <Card className="bg-poker-surface border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Target className="h-5 w-5" />
              Session Goals
            </CardTitle>
            <CardDescription className="text-gray-400">
              Set your objectives for this session
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-white">Primary Goal</label>
              <Textarea
                placeholder="What do you want to achieve this session?"
                value={sessionGoals}
                onChange={(e) => setSessionGoals(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white resize-none"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-3 text-white">Focus Areas</label>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(focusAreas).map(([key, checked]) => (
                  <div key={key} className="flex items-center space-x-2">
                    <Checkbox
                      id={`focus-${key}`}
                      checked={checked}
                      onCheckedChange={(checked) => handleFocusAreaChange(key, checked as boolean)}
                      className="border-gray-600 data-[state=checked]:bg-poker-green data-[state=checked]:border-poker-green"
                    />
                    <label
                      htmlFor={`focus-${key}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-white"
                    >
                      {key.charAt(0).toUpperCase() + key.slice(1)}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <Button
              onClick={handleSavePreparation}
              disabled={createLogMutation.isPending}
              className="w-full bg-poker-green hover:bg-poker-green-light text-white"
            >
              Save Preparation
            </Button>
          </CardContent>
        </Card>

        {/* Recent Preparation Logs */}
        <Card className="bg-poker-surface border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Recent Preparations
            </CardTitle>
            <CardDescription className="text-gray-400">
              Your preparation history
            </CardDescription>
          </CardHeader>
          <CardContent>
            {preparationLogs && preparationLogs.length > 0 ? (
              <div className="space-y-3">
                {preparationLogs.slice(0, 5).map((log: any) => (
                  <div key={log.id} className="p-3 bg-gray-800 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-400">
                        {new Date(log.createdAt).toLocaleDateString()}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          Mental: {log.mentalState}/10
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          Focus: {log.focusLevel}/10
                        </Badge>
                      </div>
                    </div>
                    {log.sessionGoals && (
                      <p className="text-sm text-white line-clamp-2">{log.sessionGoals}</p>
                    )}
                    <div className="text-xs text-gray-400 mt-1">
                      {log.exercisesCompleted?.length || 0} exercises completed
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No preparation logs yet</p>
                <p className="text-sm">Complete your first session preparation above</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import WeeklyCalendar from "@/components/WeeklyCalendar";
import { ChevronLeft, ChevronRight, Plus, Calendar } from "lucide-react";

export default function WeeklyPlanner() {
  const [currentWeek, setCurrentWeek] = useState(new Date());

  const { data: weeklyPlans, isLoading } = useQuery({
    queryKey: ["/api/weekly-plans"],
    queryFn: async () => {
      const response = await fetch("/api/weekly-plans", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch weekly plans");
      return response.json();
    },
  });

  const { data: templates } = useQuery({
    queryKey: ["/api/tournament-templates"],
    queryFn: async () => {
      const response = await fetch("/api/tournament-templates", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch templates");
      return response.json();
    },
  });

  const getWeekStart = (date: Date) => {
    const start = new Date(date);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
    return new Date(start.setDate(diff));
  };

  const getWeekEnd = (date: Date) => {
    const end = new Date(getWeekStart(date));
    end.setDate(end.getDate() + 6);
    return end;
  };

  const formatWeekRange = (start: Date, end: Date) => {
    const options: Intl.DateTimeFormatOptions = { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    };
    
    if (start.getMonth() === end.getMonth()) {
      return `${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { day: 'numeric', year: 'numeric' })}`;
    }
    
    return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newWeek = new Date(currentWeek);
    newWeek.setDate(currentWeek.getDate() + (direction === 'next' ? 7 : -7));
    setCurrentWeek(newWeek);
  };

  const weekStart = getWeekStart(currentWeek);
  const weekEnd = getWeekEnd(currentWeek);

  if (isLoading) {
    return (
      <div className="p-6 text-white">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Weekly Planner</h2>
          <p className="text-gray-400">Loading your weekly plans...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 text-white">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Weekly Planner</h2>
        <p className="text-gray-400">Plan your tournament schedule for optimal performance</p>
      </div>

      <Card className="bg-poker-surface border-gray-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Week of {formatWeekRange(weekStart, weekEnd)}
              </CardTitle>
              <CardDescription className="text-gray-400">
                Drag and drop tournaments to plan your schedule
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateWeek('prev')}
                className="bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateWeek('next')}
                className="bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button 
                size="sm"
                className="bg-poker-green hover:bg-poker-green-light text-white"
              >
                <Plus className="h-4 w-4 mr-1" />
                New Plan
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <WeeklyCalendar 
            weekStart={weekStart}
            templates={templates || []}
            weeklyPlans={weeklyPlans || []}
          />
        </CardContent>
      </Card>

      {/* Week Summary */}
      <Card className="bg-poker-surface border-gray-700 mt-6">
        <CardHeader>
          <CardTitle className="text-white">Week Summary</CardTitle>
          <CardDescription className="text-gray-400">
            Overview of your planned tournaments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-poker-gold mb-1">R$ 0</div>
              <div className="text-sm text-gray-400">Planned Buy-ins</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white mb-1">0</div>
              <div className="text-sm text-gray-400">Tournaments</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white mb-1">0h</div>
              <div className="text-sm text-gray-400">Estimated Time</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

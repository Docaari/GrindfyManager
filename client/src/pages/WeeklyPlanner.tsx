import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import IntelligentCalendar from "@/components/IntelligentCalendar";
import { ChevronLeft, ChevronRight, Zap } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function WeeklyPlanner() {
  const [currentWeek, setCurrentWeek] = useState(new Date());

  const { data: weeklyPlans, isLoading } = useQuery({
    queryKey: ["/api/weekly-plans"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/weekly-plans");
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

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">
            Week of {formatWeekRange(weekStart, weekEnd)}
          </h3>
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
        </div>
      </div>

      <div className="space-y-6">
        <IntelligentCalendar weekStart={weekStart} />
      </div>
    </div>
  );
}

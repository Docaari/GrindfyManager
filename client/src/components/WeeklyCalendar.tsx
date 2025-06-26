import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Plus, Clock, DollarSign } from "lucide-react";

interface Tournament {
  id: string;
  templateId: string;
  dayOfWeek: number;
  startTime: string;
  isPlayed: boolean;
}

interface Template {
  id: string;
  name: string;
  site: string;
  avgBuyIn: string;
  format: string;
  category: string;
  speed: string;
}

interface WeeklyCalendarProps {
  weekStart: Date;
  templates: Template[];
  weeklyPlans: any[];
}

const timeSlots = [
  "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00",
  "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00"
];

const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function WeeklyCalendar({ weekStart, templates, weeklyPlans }: WeeklyCalendarProps) {
  const [selectedSlot, setSelectedSlot] = useState<{ day: number; time: string } | null>(null);
  const [scheduledTournaments, setScheduledTournaments] = useState<Tournament[]>([
    {
      id: "1",
      templateId: "template1",
      dayOfWeek: 1, // Tuesday
      startTime: "18:00",
      isPlayed: false
    },
    {
      id: "2", 
      templateId: "template2",
      dayOfWeek: 3, // Thursday
      startTime: "20:00",
      isPlayed: false
    },
    {
      id: "3",
      templateId: "template1",
      dayOfWeek: 5, // Saturday
      startTime: "18:00",
      isPlayed: false
    }
  ]);

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(num);
  };

  const getWeekDates = () => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const getDayColumn = (dayIndex: number) => {
    return dayIndex + 1; // +1 because first column is time
  };

  const getTimeRow = (timeSlot: string) => {
    return timeSlots.indexOf(timeSlot) + 2; // +2 because first row is header
  };

  const getTournamentAtSlot = (day: number, time: string) => {
    return scheduledTournaments.find(
      t => t.dayOfWeek === day && t.startTime === time
    );
  };

  const getTemplateById = (templateId: string) => {
    return templates.find(t => t.id === templateId);
  };

  const getSiteColor = (site: string) => {
    switch (site?.toLowerCase()) {
      case "pokerstars":
        return "bg-red-600";
      case "partypoker":
        return "bg-blue-600";
      case "888poker":
        return "bg-orange-600";
      case "ggpoker":
        return "bg-green-600";
      default:
        return "bg-poker-green";
    }
  };

  const handleSlotClick = (day: number, time: string) => {
    const existingTournament = getTournamentAtSlot(day, time);
    if (existingTournament) {
      // Remove tournament
      setScheduledTournaments(prev => 
        prev.filter(t => t.id !== existingTournament.id)
      );
    } else {
      setSelectedSlot({ day, time });
    }
  };

  const addTournament = (templateId: string) => {
    if (!selectedSlot) return;

    const newTournament: Tournament = {
      id: Date.now().toString(),
      templateId,
      dayOfWeek: selectedSlot.day,
      startTime: selectedSlot.time,
      isPlayed: false
    };

    setScheduledTournaments(prev => [...prev, newTournament]);
    setSelectedSlot(null);
  };

  const calculateWeekSummary = () => {
    const totalBuyins = scheduledTournaments.reduce((sum, tournament) => {
      const template = getTemplateById(tournament.templateId);
      return sum + (template ? parseFloat(template.avgBuyIn) : 0);
    }, 0);

    return {
      totalBuyins,
      tournamentCount: scheduledTournaments.length,
      estimatedTime: scheduledTournaments.length * 3.5 // Average 3.5 hours per tournament
    };
  };

  const weekDates = getWeekDates();
  const summary = calculateWeekSummary();

  return (
    <div className="space-y-6">
      {/* Calendar Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Header */}
          <div className="grid grid-cols-8 gap-2 mb-4">
            <div className="text-center text-sm text-gray-400 py-2 font-medium">Time</div>
            {dayNames.map((day, index) => (
              <div key={day} className="text-center text-sm text-gray-400 py-2 font-medium">
                <div>{day}</div>
                <div className="text-xs text-gray-500">
                  {weekDates[index].getDate()}/{weekDates[index].getMonth() + 1}
                </div>
              </div>
            ))}
          </div>

          {/* Time Slots */}
          <div className="space-y-1">
            {timeSlots.map((time) => (
              <div key={time} className="grid grid-cols-8 gap-2">
                <div className="text-gray-400 py-3 text-center text-sm font-mono">
                  {time}
                </div>
                {[0, 1, 2, 3, 4, 5, 6].map((dayIndex) => {
                  const tournament = getTournamentAtSlot(dayIndex, time);
                  const template = tournament ? getTemplateById(tournament.templateId) : null;
                  
                  return (
                    <div
                      key={`${dayIndex}-${time}`}
                      onClick={() => handleSlotClick(dayIndex, time)}
                      className={cn(
                        "min-h-[50px] border-2 rounded-lg cursor-pointer transition-colors p-2",
                        tournament
                          ? "border-poker-green bg-poker-green/20"
                          : selectedSlot?.day === dayIndex && selectedSlot?.time === time
                          ? "border-poker-gold bg-poker-gold/20"
                          : "border-dashed border-gray-600 hover:border-gray-500"
                      )}
                    >
                      {tournament && template && (
                        <div className="space-y-1">
                          <div className={cn(
                            "text-xs px-2 py-1 rounded text-white font-medium truncate",
                            getSiteColor(template.site)
                          )}>
                            {template.name}
                          </div>
                          <div className="text-xs text-gray-400">
                            {formatCurrency(template.avgBuyIn)}
                          </div>
                        </div>
                      )}
                      {selectedSlot?.day === dayIndex && selectedSlot?.time === time && (
                        <div className="flex items-center justify-center h-full">
                          <Plus className="h-4 w-4 text-poker-gold" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Template Selector */}
      {selectedSlot && (
        <Card className="bg-poker-surface border-gray-700">
          <CardContent className="p-4">
            <h4 className="text-white font-semibold mb-3">
              Add Tournament - {dayNames[selectedSlot.day]} at {selectedSlot.time}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-y-auto">
              {templates.map((template) => (
                <Button
                  key={template.id}
                  onClick={() => addTournament(template.id)}
                  variant="outline"
                  className="p-3 h-auto text-left border-gray-600 hover:border-poker-green"
                >
                  <div className="space-y-1 w-full">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-white text-sm">{template.name}</span>
                      <Badge className={getSiteColor(template.site)}>{template.site}</Badge>
                    </div>
                    <div className="text-xs text-gray-400">
                      {formatCurrency(template.avgBuyIn)} • {template.format}
                    </div>
                  </div>
                </Button>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-700">
              <Button
                onClick={() => setSelectedSlot(null)}
                variant="ghost"
                size="sm"
                className="text-gray-400"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Week Summary */}
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-4">
          <h4 className="text-white font-semibold mb-3">Week Summary</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center space-x-2">
              <DollarSign className="h-4 w-4 text-poker-gold" />
              <div>
                <div className="text-white font-mono">{formatCurrency(summary.totalBuyins)}</div>
                <div className="text-xs text-gray-400">Planned Buy-ins</div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Plus className="h-4 w-4 text-poker-green" />
              <div>
                <div className="text-white font-mono">{summary.tournamentCount}</div>
                <div className="text-xs text-gray-400">Tournaments</div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-blue-400" />
              <div>
                <div className="text-white font-mono">{summary.estimatedTime.toFixed(1)}h</div>
                <div className="text-xs text-gray-400">Estimated Time</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

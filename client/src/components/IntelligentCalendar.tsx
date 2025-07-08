import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Clock, BookOpen, Coffee, Moon, Zap, AlertTriangle, RefreshCw } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { CalendarBlock, ConflictInfo } from '@/types';
import AdvancedCalendar from './AdvancedCalendar';

interface IntelligentCalendarProps {
  weekStart: Date;
}

const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const blockTypeConfig = {
  grind: {
    icon: Calendar,
    color: 'bg-poker-green',
    textColor: 'text-white',
    borderColor: 'border-poker-green',
    label: 'Grind'
  },
  warmup: {
    icon: Coffee,
    color: 'bg-amber-500',
    textColor: 'text-white',
    borderColor: 'border-amber-500',
    label: 'Warm-up'
  },
  rest: {
    icon: Moon,
    color: 'bg-blue-500',
    textColor: 'text-white',
    borderColor: 'border-blue-500',
    label: 'Descanso'
  },
  study: {
    icon: BookOpen,
    color: 'bg-purple-500',
    textColor: 'text-white',
    borderColor: 'border-purple-500',
    label: 'Estudo'
  }
};

export default function IntelligentCalendar({ weekStart }: IntelligentCalendarProps) {
  const queryClient = useQueryClient();
  
  const { data: routine, isLoading } = useQuery({
    queryKey: ['/api/weekly-routine', weekStart.toISOString()],
    queryFn: async () => {
      const response = await apiRequest(`/api/weekly-routine?weekStart=${weekStart.toISOString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch routine');
      }
      return response.json();
    }
  });

  const generateRoutineMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/weekly-routine/generate', {
        method: 'POST',
        body: JSON.stringify({ weekStart: weekStart.toISOString() })
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/weekly-routine'] });
    }
  });

  const blocks: CalendarBlock[] = routine?.blocks ? 
    (typeof routine.blocks === 'string' ? JSON.parse(routine.blocks) : routine.blocks) : [];
  const conflicts: ConflictInfo[] = routine?.conflicts ? 
    (typeof routine.conflicts === 'string' ? JSON.parse(routine.conflicts) : routine.conflicts) : [];

  const blocksByDay = blocks.reduce((acc, block) => {
    if (!acc[block.dayOfWeek]) acc[block.dayOfWeek] = [];
    acc[block.dayOfWeek].push(block);
    return acc;
  }, {} as Record<number, CalendarBlock[]>);

  return (
    <div className="space-y-6">
      <Tabs defaultValue="advanced" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="advanced">Calendário Avançado</TabsTrigger>
          <TabsTrigger value="intelligent">Rotina Inteligente</TabsTrigger>
        </TabsList>
        
        <TabsContent value="advanced" className="space-y-4">
          <AdvancedCalendar weekStart={weekStart} />
        </TabsContent>
        
        <TabsContent value="intelligent" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Calendário Inteligente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <p className="text-sm text-gray-600">
                    Rotina gerada automaticamente baseada na Grade e Estudos
                  </p>
                </div>
                <Button 
                  onClick={() => generateRoutineMutation.mutate()}
                  disabled={generateRoutineMutation.isPending}
                >
                  {generateRoutineMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-2" />
                      Gerar Nova Rotina
                    </>
                  )}
                </Button>
              </div>

              {/* Conflicts Alert */}
              {conflicts.length > 0 && (
                <Alert className="mb-6">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Conflitos detectados:</strong>
                    <ul className="mt-2 space-y-1">
                      {conflicts.map((conflict, index) => (
                        <li key={index} className="text-sm">
                          • {conflict.message}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Weekly Calendar Grid */}
              <div className="grid grid-cols-7 gap-4">
                {dayNames.map((dayName, dayIndex) => {
                  const dayBlocks = blocksByDay[dayIndex] || [];
                  
                  return (
                    <Card key={dayIndex} className="min-h-[300px]">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-center">
                          {dayName}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {dayBlocks.length > 0 ? (
                          dayBlocks
                            .sort((a, b) => a.startTime.localeCompare(b.startTime))
                            .map((block, blockIndex) => {
                              const config = blockTypeConfig[block.type];
                              const IconComponent = config.icon;
                              
                              return (
                                <div
                                  key={blockIndex}
                                  className={`${config.color} ${config.textColor} rounded-lg p-3 text-xs`}
                                >
                                  <div className="flex items-center gap-2 mb-1">
                                    <IconComponent className="h-3 w-3" />
                                    <span className="font-medium">{block.title}</span>
                                  </div>
                                  <div className="flex items-center gap-1 text-xs opacity-90">
                                    <Clock className="h-3 w-3" />
                                    <span>{block.startTime} - {block.endTime}</span>
                                  </div>
                                  {block.source && (
                                    <div className="mt-1 text-xs opacity-75">
                                      Fonte: {block.source}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                        ) : (
                          <div className="text-center py-8 text-gray-500">
                            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-xs">Nenhuma atividade</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
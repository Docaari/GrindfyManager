import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, Clock, BookOpen, Coffee, Moon, Zap, AlertTriangle, RefreshCw } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { CalendarBlock, ConflictInfo } from '@/types';

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

  const blocks: CalendarBlock[] = routine?.blocks ? JSON.parse(routine.blocks) : [];
  const conflicts: ConflictInfo[] = routine?.conflicts ? JSON.parse(routine.conflicts) : [];

  const blocksByDay = blocks.reduce((acc, block) => {
    if (!acc[block.dayOfWeek]) acc[block.dayOfWeek] = [];
    acc[block.dayOfWeek].push(block);
    return acc;
  }, {} as Record<number, CalendarBlock[]>);

  const renderBlock = (block: CalendarBlock) => {
    const config = blockTypeConfig[block.type];
    const Icon = config.icon;
    
    return (
      <div
        key={block.id}
        className={`
          p-2 rounded-lg mb-2 border-l-4 transition-all duration-200
          ${config.color} ${config.textColor} ${config.borderColor}
          ${block.hasConflict ? 'ring-2 ring-red-500 ring-opacity-50' : ''}
        `}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1">
            <Icon className="h-3 w-3" />
            <span className="text-xs font-medium">{config.label}</span>
          </div>
          <span className="text-xs opacity-80">
            {block.startTime} - {block.endTime}
          </span>
        </div>
        <div className="text-xs opacity-90">{block.title}</div>
        {block.hasConflict && (
          <div className="flex items-center gap-1 mt-1">
            <AlertTriangle className="h-3 w-3 text-red-300" />
            <span className="text-xs text-red-300">Conflito detectado</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header com botão de gerar rotina */}
      <Card className="bg-poker-surface border-gray-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <Zap className="h-5 w-5 text-poker-green" />
              Calendário Inteligente
            </CardTitle>
            <Button 
              onClick={() => generateRoutineMutation.mutate()}
              disabled={generateRoutineMutation.isPending}
              className="bg-poker-green hover:bg-poker-green-light text-white"
            >
              {generateRoutineMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Gerar Rotina
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-gray-400 text-sm">
            Rotina gerada automaticamente baseada nos dados da Grade e Estudos. 
            Inclui warm-up, sessões de grind, descanso e estudos planejados.
          </p>
        </CardContent>
      </Card>

      {/* Alertas de conflitos */}
      {conflicts.length > 0 && (
        <Alert className="bg-red-900/20 border-red-500">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <AlertDescription className="text-red-300">
            <strong>Conflitos detectados:</strong> {conflicts.length} sobreposições de horários foram encontradas.
            Revise os horários planejados para otimizar sua rotina.
          </AlertDescription>
        </Alert>
      )}

      {/* Legenda */}
      <Card className="bg-poker-surface border-gray-700">
        <CardHeader>
          <CardTitle className="text-white text-sm">Legenda</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(blockTypeConfig).map(([type, config]) => {
              const Icon = config.icon;
              return (
                <div key={type} className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded border-l-4 ${config.color} ${config.borderColor}`} />
                  <Icon className="h-3 w-3 text-gray-400" />
                  <span className="text-xs text-gray-400">{config.label}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Calendário semanal */}
      <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
        {dayNames.map((dayName, dayIndex) => {
          const dayBlocks = blocksByDay[dayIndex] || [];
          const sortedBlocks = dayBlocks.sort((a, b) => a.startTime.localeCompare(b.startTime));
          
          return (
            <Card key={dayIndex} className="bg-poker-surface border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm text-center">
                  {dayName}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {sortedBlocks.length > 0 ? (
                  sortedBlocks.map(renderBlock)
                ) : (
                  <div className="text-center py-4">
                    <Calendar className="h-6 w-6 mx-auto text-gray-600 mb-2" />
                    <p className="text-xs text-gray-500">Nenhuma atividade</p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Resumo da semana */}
      {blocks.length > 0 && (
        <Card className="bg-poker-surface border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">Resumo da Semana</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {Object.entries(blockTypeConfig).map(([type, config]) => {
                const typeBlocks = blocks.filter(b => b.type === type);
                const totalMinutes = typeBlocks.reduce((acc, block) => {
                  const start = new Date(`2000-01-01T${block.startTime}:00`);
                  const end = new Date(`2000-01-01T${block.endTime}:00`);
                  return acc + (end.getTime() - start.getTime()) / (1000 * 60);
                }, 0);
                
                const hours = Math.floor(totalMinutes / 60);
                const minutes = totalMinutes % 60;
                
                return (
                  <div key={type} className="text-center">
                    <div className={`text-2xl font-bold mb-1 ${config.textColor.replace('text-white', 'text-poker-green')}`}>
                      {typeBlocks.length}
                    </div>
                    <div className="text-sm text-gray-400 mb-1">{config.label}</div>
                    <div className="text-xs text-gray-500">
                      {hours}h {minutes > 0 ? `${minutes}m` : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
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
      const response = await apiRequest('GET', `/api/weekly-routine?weekStart=${weekStart.toISOString()}`);
      return response;
    }
  });

  const generateRoutineMutation = useMutation({
    mutationFn: async () => {
      // console.log('Generating routine for week:', weekStart.toISOString());
      const response = await apiRequest('POST', '/api/weekly-routine/generate', { weekStart: weekStart.toISOString() });
      // console.log('Routine generated:', response);
      return response;
    },
    onSuccess: (data) => {
      // console.log('Routine generation success:', data);
      queryClient.invalidateQueries({ queryKey: ['/api/weekly-routine'] });
      queryClient.invalidateQueries({ queryKey: ['/api/calendar-events'] });
    },
    onError: (error) => {
      console.error('Routine generation error:', error);
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
      {/* Header com botão de gerar rotina */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Calendário Inteligente
            </CardTitle>
            <Button 
              onClick={() => {
                console.log('Button clicked!');
                generateRoutineMutation.mutate();
              }}
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
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            Gere automaticamente sua rotina baseada na Grade e Estudos. Os eventos aparecerão no calendário abaixo e podem ser editados conforme necessário.
          </p>
        </CardContent>
      </Card>

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

      {/* Advanced Calendar */}
      <AdvancedCalendar weekStart={weekStart} />
    </div>
  );
}
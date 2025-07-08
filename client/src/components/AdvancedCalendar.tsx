import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Plus, 
  Edit3, 
  Trash2, 
  Clock, 
  Calendar, 
  Settings, 
  Palette,
  GripVertical,
  AlertCircle,
  Check,
  X
} from 'lucide-react';
import { CalendarCategory, CalendarEvent, TimeSlot, DragItem, DropResult } from '@/types';
import { format, addDays, startOfWeek, isSameDay, parseISO, formatISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AdvancedCalendarProps {
  weekStart: Date;
}

const TIME_SLOTS = Array.from({ length: 96 }, (_, i) => {
  const hour = Math.floor(i / 4);
  const minute = (i % 4) * 15;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
});

const DAYS_OF_WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const DEFAULT_CATEGORIES = [
  { name: 'Atividade Física', color: '#22c55e', icon: 'activity' },
  { name: 'Warm Up', color: '#f59e0b', icon: 'flame' },
  { name: 'Grind', color: '#ef4444', icon: 'target' },
  { name: 'Estudo', color: '#3b82f6', icon: 'book-open' },
  { name: 'Cooldown', color: '#8b5cf6', icon: 'wind' },
  { name: 'Sono', color: '#1f2937', icon: 'moon' },
];

export default function AdvancedCalendar({ weekStart }: AdvancedCalendarProps) {
  const queryClient = useQueryClient();
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editingCategory, setEditingCategory] = useState<CalendarCategory | null>(null);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
  const [dragTarget, setDragTarget] = useState<{ dayOfWeek: number; timeSlot: string } | null>(null);
  const [newEvent, setNewEvent] = useState<Partial<CalendarEvent>>({
    title: '',
    description: '',
    categoryId: '',
    recurrenceType: 'none',
    isRecurring: false,
    source: 'manual'
  });
  const [newCategory, setNewCategory] = useState<Partial<CalendarCategory>>({
    name: '',
    color: '#3b82f6',
    icon: 'calendar'
  });

  const weekEnd = addDays(weekStart, 6);

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ['/api/calendar-categories'],
    queryFn: async () => {
      const response = await apiRequest('/api/calendar-categories');
      return response.json();
    }
  });

  // Fetch events
  const { data: events = [] } = useQuery({
    queryKey: ['/api/calendar-events', weekStart.toISOString()],
    queryFn: async () => {
      const response = await apiRequest(
        `/api/calendar-events?weekStart=${weekStart.toISOString()}&weekEnd=${weekEnd.toISOString()}`
      );
      return response.json();
    }
  });

  // Create event mutation
  const createEventMutation = useMutation({
    mutationFn: async (eventData: Partial<CalendarEvent>) => {
      const response = await apiRequest('/api/calendar-events', {
        method: 'POST',
        body: JSON.stringify(eventData)
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar-events'] });
      setShowEventDialog(false);
      setNewEvent({
        title: '',
        description: '',
        categoryId: '',
        recurrenceType: 'none',
        isRecurring: false,
        source: 'manual'
      });
    }
  });

  // Update event mutation
  const updateEventMutation = useMutation({
    mutationFn: async ({ id, eventData, editType }: { id: string; eventData: Partial<CalendarEvent>; editType?: 'single' | 'series' }) => {
      const response = await apiRequest(`/api/calendar-events/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...eventData, editType })
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar-events'] });
      setShowEventDialog(false);
      setSelectedEvent(null);
    }
  });

  // Delete event mutation
  const deleteEventMutation = useMutation({
    mutationFn: async ({ id, deleteType }: { id: string; deleteType?: 'single' | 'series' }) => {
      const response = await apiRequest(`/api/calendar-events/${id}?deleteType=${deleteType || 'single'}`, {
        method: 'DELETE'
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar-events'] });
      setSelectedEvent(null);
    }
  });

  // Create category mutation
  const createCategoryMutation = useMutation({
    mutationFn: async (categoryData: Partial<CalendarCategory>) => {
      const response = await apiRequest('/api/calendar-categories', {
        method: 'POST',
        body: JSON.stringify(categoryData)
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar-categories'] });
      setShowCategoryDialog(false);
      setNewCategory({ name: '', color: '#3b82f6', icon: 'calendar' });
    }
  });

  // Update category mutation
  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, categoryData }: { id: string; categoryData: Partial<CalendarCategory> }) => {
      const response = await apiRequest(`/api/calendar-categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify(categoryData)
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar-categories'] });
      setShowCategoryDialog(false);
      setEditingCategory(null);
    }
  });

  // Delete category mutation
  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest(`/api/calendar-categories/${id}`, {
        method: 'DELETE'
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar-categories'] });
    }
  });

  // Generate time slots for a day
  const generateTimeSlots = (dayOfWeek: number): TimeSlot[] => {
    const dayEvents = events.filter((event: CalendarEvent) => event.dayOfWeek === dayOfWeek);

    return TIME_SLOTS.map(time => {
      const [hour, minute] = time.split(':').map(Number);
      
      const event = dayEvents.find((e: CalendarEvent) => {
        const eventStart = new Date(e.startTime);
        const eventEnd = new Date(e.endTime);
        const startHour = eventStart.getHours();
        const startMinute = eventStart.getMinutes();
        const endHour = eventEnd.getHours();
        const endMinute = eventEnd.getMinutes();
        
        // Check if the current time slot falls within the event duration
        const slotTimeInMinutes = hour * 60 + minute;
        const eventStartInMinutes = startHour * 60 + startMinute;
        const eventEndInMinutes = endHour * 60 + endMinute;
        
        return slotTimeInMinutes >= eventStartInMinutes && slotTimeInMinutes < eventEndInMinutes;
      });

      return {
        time,
        isOccupied: !!event,
        event,
        isConflict: false // TODO: Implement conflict detection
      };
    });
  };

  // Handle drag start
  const handleDragStart = (event: CalendarEvent) => {
    setDraggedItem({
      id: event.id,
      type: 'event',
      eventData: event
    });
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent, dayOfWeek: number, timeSlot: string) => {
    e.preventDefault();
    if (draggedItem) {
      setDragTarget({ dayOfWeek, timeSlot });
    }
  };

  // Handle drop
  const handleDrop = (e: React.DragEvent, dayOfWeek: number, timeSlot: string) => {
    e.preventDefault();

    if (!draggedItem) return;

    const [hour, minute] = timeSlot.split(':').map(Number);
    const newStartTime = new Date(weekStart);
    newStartTime.setDate(newStartTime.getDate() + dayOfWeek);
    newStartTime.setHours(hour, minute, 0, 0);

    const originalEvent = draggedItem.eventData;
    const eventDuration = new Date(originalEvent.endTime).getTime() - new Date(originalEvent.startTime).getTime();
    const newEndTime = new Date(newStartTime.getTime() + eventDuration);

    updateEventMutation.mutate({
      id: originalEvent.id,
      eventData: {
        ...originalEvent,
        startTime: newStartTime.toISOString(),
        endTime: newEndTime.toISOString(),
        dayOfWeek
      }
    });

    setDraggedItem(null);
    setDragTarget(null);
  };

  // Handle create event
  const handleCreateEvent = (dayOfWeek: number, timeSlot: string) => {
    const [hour, minute] = timeSlot.split(':').map(Number);
    const startTime = new Date(weekStart);
    startTime.setDate(startTime.getDate() + dayOfWeek);
    startTime.setHours(hour, minute, 0, 0);

    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour default

    setNewEvent({
      ...newEvent,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      dayOfWeek
    });
    setShowEventDialog(true);
  };

  // Handle edit event
  const handleEditEvent = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setNewEvent(event);
    setShowEventDialog(true);
  };

  // Handle event submission
  const handleEventSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedEvent) {
      updateEventMutation.mutate({
        id: selectedEvent.id,
        eventData: newEvent
      });
    } else {
      createEventMutation.mutate(newEvent);
    }
  };

  // Handle category submission
  const handleCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (editingCategory) {
      updateCategoryMutation.mutate({
        id: editingCategory.id,
        categoryData: newCategory
      });
    } else {
      createCategoryMutation.mutate(newCategory);
    }
  };

  // Get category by ID
  const getCategoryById = (id: string) => {
    return categories.find((cat: CalendarCategory) => cat.id === id);
  };

  return (
    <div className="space-y-6">
      {/* Header with Categories Legend */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold">Calendário da Semana</h2>
          <div className="flex items-center gap-2">
            {categories.map((category: CalendarCategory) => (
              <Badge 
                key={category.id} 
                variant="outline" 
                className="text-xs"
                style={{ 
                  borderColor: category.color,
                  color: category.color,
                  backgroundColor: `${category.color}15`
                }}
              >
                {category.name}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Categories Management */}
          <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Categorias
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Gerenciar Categorias</DialogTitle>
              </DialogHeader>
              <Tabs defaultValue="list" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="list">Lista</TabsTrigger>
                  <TabsTrigger value="create">Criar Nova</TabsTrigger>
                </TabsList>

                <TabsContent value="list" className="space-y-4">
                  <ScrollArea className="h-96 w-full">
                    <div className="space-y-3">
                      {categories.map((category: CalendarCategory) => (
                        <Card key={category.id} className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div 
                                className="w-4 h-4 rounded-full"
                                style={{ backgroundColor: category.color }}
                              />
                              <div>
                                <h4 className="font-medium">{category.name}</h4>
                                <p className="text-sm text-gray-500">{category.color}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingCategory(category);
                                  setNewCategory(category);
                                }}
                              >
                                <Edit3 className="h-4 w-4" />
                              </Button>
                              {!category.isDefault && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deleteCategoryMutation.mutate(category.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="create" className="space-y-4">
                  <form onSubmit={handleCategorySubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="categoryName" className="text-[#000000]">Nome da Categoria</Label>
                      <Input
                        id="categoryName"
                        value={newCategory.name || ''}
                        onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="categoryColor">Cor</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="categoryColor"
                          type="color"
                          value={newCategory.color || '#3b82f6'}
                          onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })}
                          className="w-20"
                        />
                        <Input
                          value={newCategory.color || '#3b82f6'}
                          onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })}
                          placeholder="#3b82f6"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="categoryIcon">Ícone (opcional)</Label>
                      <Input
                        id="categoryIcon"
                        value={newCategory.icon || ''}
                        onChange={(e) => setNewCategory({ ...newCategory, icon: e.target.value })}
                        placeholder="calendar"
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => setShowCategoryDialog(false)}
                        className="border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                      >
                        Cancelar
                      </Button>
                      {editingCategory && (
                        <Button 
                          type="button" 
                          variant="destructive"
                          onClick={() => deleteCategoryMutation.mutate(editingCategory.id)}
                          className="bg-red-600 text-white hover:bg-red-700"
                        >
                          Deletar
                        </Button>
                      )}
                      <Button 
                        type="submit"
                        className="bg-blue-600 text-white hover:bg-blue-700"
                      >
                        {editingCategory ? 'Atualizar' : 'Criar'}
                      </Button>
                    </div>
                  </form>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Calendar Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {format(weekStart, 'dd/MM/yyyy', { locale: ptBR })} - {format(weekEnd, 'dd/MM/yyyy', { locale: ptBR })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-8 gap-1">
            {/* Time header */}
            <div className="font-medium text-sm text-center p-2">Horário</div>

            {/* Day headers */}
            {DAYS_OF_WEEK.map((day, index) => (
              <div key={index} className="font-medium text-sm text-center p-2 bg-gray-50 rounded">
                {day}
                <div className="text-xs text-gray-500 font-normal">
                  {format(addDays(weekStart, index), 'dd/MM')}
                </div>
              </div>
            ))}

            {/* Time slots */}
            {TIME_SLOTS.map((timeSlot, timeIndex) => (
              <div key={timeSlot} className="contents">
                {/* Time label */}
                <div className="text-xs text-gray-500 text-center p-1 border-r">
                  {timeSlot}
                </div>

                {/* Day slots */}
                {Array.from({ length: 7 }, (_, dayIndex) => {
                  const daySlots = generateTimeSlots(dayIndex);
                  const slot = daySlots.find(s => s.time === timeSlot);
                  const isDropTarget = dragTarget?.dayOfWeek === dayIndex && dragTarget?.timeSlot === timeSlot;

                  return (
                    <div
                      key={`${dayIndex}-${timeSlot}`}
                      className={`
                        relative min-h-[20px] border border-gray-200 hover:bg-gray-50 cursor-pointer
                        ${isDropTarget ? 'bg-blue-100 border-blue-300' : ''}
                        ${slot?.isOccupied ? 'bg-opacity-80' : ''}
                      `}
                      onDragOver={(e) => handleDragOver(e, dayIndex, timeSlot)}
                      onDrop={(e) => handleDrop(e, dayIndex, timeSlot)}
                      onClick={() => !slot?.isOccupied && handleCreateEvent(dayIndex, timeSlot)}
                    >
                      {slot?.isOccupied && slot.event && (
                        <div
                          className="absolute inset-0 rounded text-xs font-medium text-white p-1 cursor-move"
                          style={{ backgroundColor: getCategoryById(slot.event.categoryId)?.color }}
                          draggable
                          onDragStart={() => handleDragStart(slot.event!)}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditEvent(slot.event!);
                          }}
                        >
                          <div className="flex items-center gap-1">
                            <GripVertical className="h-3 w-3" />
                            <span className="truncate">{slot.event.title}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Event Dialog */}
      <Dialog open={showEventDialog} onOpenChange={setShowEventDialog}>
        <DialogContent className="max-w-2xl bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {selectedEvent ? 'Editar Compromisso' : 'Novo Compromisso'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleEventSubmit} className="space-y-6 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="eventTitle" className="text-gray-300 font-medium">Título</Label>
                <Input
                  id="eventTitle"
                  value={newEvent.title || ''}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  required
                  className="bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:border-red-500 focus:ring-red-500"
                  placeholder="Digite o título do compromisso"
                />
              </div>

              <div>
                <Label htmlFor="eventCategory" className="text-gray-300 font-medium">Categoria</Label>
                <Select 
                  value={newEvent.categoryId || ''} 
                  onValueChange={(value) => setNewEvent({ ...newEvent, categoryId: value })}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-600 text-white focus:border-red-500 focus:ring-red-500">
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-600">
                    {categories.map((category: CalendarCategory) => (
                      <SelectItem key={category.id} value={category.id} className="text-white hover:bg-gray-700">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: category.color }}
                          />
                          {category.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="eventDescription" className="text-gray-300 font-medium">Descrição</Label>
              <Textarea
                id="eventDescription"
                value={newEvent.description || ''}
                onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                rows={3}
                className="bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:border-red-500 focus:ring-red-500"
                placeholder="Descreva o compromisso (opcional)"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="eventStart" className="text-gray-300 font-medium">Início</Label>
                <Input
                  id="eventStart"
                  type="datetime-local"
                  value={newEvent.startTime ? format(new Date(newEvent.startTime), "yyyy-MM-dd'T'HH:mm") : ''}
                  onChange={(e) => setNewEvent({ ...newEvent, startTime: new Date(e.target.value).toISOString() })}
                  required
                  className="bg-gray-800 border-gray-600 text-white focus:border-red-500 focus:ring-red-500"
                />
              </div>

              <div>
                <Label htmlFor="eventEnd" className="text-gray-300 font-medium">Fim</Label>
                <Input
                  id="eventEnd"
                  type="datetime-local"
                  value={newEvent.endTime ? format(new Date(newEvent.endTime), "yyyy-MM-dd'T'HH:mm") : ''}
                  onChange={(e) => setNewEvent({ ...newEvent, endTime: new Date(e.target.value).toISOString() })}
                  required
                  className="bg-gray-800 border-gray-600 text-white focus:border-red-500 focus:ring-red-500"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="recurring"
                  checked={newEvent.isRecurring || false}
                  onCheckedChange={(checked) => setNewEvent({ 
                    ...newEvent, 
                    isRecurring: checked,
                    recurrenceType: checked ? 'daily' : 'none'
                  })}
                />
                <Label htmlFor="recurring" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-gray-300">Compromisso recorrente</Label>
              </div>

              {newEvent.isRecurring && (
                <div>
                  <Label htmlFor="recurrenceType" className="text-gray-300 font-medium">Tipo de Recorrência</Label>
                  <Select 
                    value={newEvent.recurrenceType || 'none'} 
                    onValueChange={(value) => setNewEvent({ ...newEvent, recurrenceType: value as any })}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-600 text-white focus:border-red-500 focus:ring-red-500">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-600">
                      <SelectItem value="daily" className="text-white hover:bg-gray-700">Diário</SelectItem>
                      <SelectItem value="weekly" className="text-white hover:bg-gray-700">Semanal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setShowEventDialog(false)}
                className="border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white"
              >
                Cancelar
              </Button>
              {selectedEvent && (
                <Button 
                  type="button" 
                  variant="destructive"
                  onClick={() => {
                    if (selectedEvent.isRecurring) {
                      // Show confirmation dialog for recurring events
                      if (confirm('Deseja deletar apenas esta ocorrência ou toda a série?')) {
                        deleteEventMutation.mutate({ id: selectedEvent.id, deleteType: 'series' });
                      } else {
                        deleteEventMutation.mutate({ id: selectedEvent.id, deleteType: 'single' });
                      }
                    } else {
                      deleteEventMutation.mutate({ id: selectedEvent.id });
                    }
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  Deletar
                </Button>
              )}
              <Button 
                type="submit" 
                className="bg-red-600 hover:bg-red-700 text-white font-medium"
              >
                {selectedEvent ? 'Atualizar' : 'Criar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
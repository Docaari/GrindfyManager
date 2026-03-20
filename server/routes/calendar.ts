import type { Express } from "express";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import {
  insertActiveDaySchema,
  insertCalendarCategorySchema,
  insertCalendarEventSchema,
  calendarEvents,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";

// Helper function to create timestamp from week start, day of week, and time string
function createTimestamp(weekStart: Date, dayOfWeek: number, timeString: string): Date {
  const [hours, minutes] = timeString.split(':').map(Number);

  // Validate input values
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid time format: ${timeString}`);
  }

  const date = new Date(weekStart);
  date.setDate(date.getDate() + dayOfWeek);

  // Se o horário é antes das 06:00, assume que é no dia seguinte
  if (hours < 6) {
    date.setDate(date.getDate() + 1);
  }

  date.setHours(hours, minutes, 0, 0);

  // Validate the resulting date
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date created from inputs: weekStart=${weekStart}, dayOfWeek=${dayOfWeek}, timeString=${timeString}`);
  }

  return date;
}

// Helper function to validate timestamp before database operations
function validateTimestamp(timestamp: Date, context: string): Date {
  if (!(timestamp instanceof Date)) {
    throw new Error(`Expected Date object for ${context}, got ${typeof timestamp}`);
  }

  if (isNaN(timestamp.getTime())) {
    throw new Error(`Invalid timestamp value for ${context}: ${timestamp}`);
  }

  return timestamp;
}

// Função para gerar rotina semanal automaticamente
async function generateWeeklyRoutine(userId: string, weekStart: Date) {
  const blocks: any[] = [];
  const conflicts: any[] = [];

  // 1. Buscar dados da Grade (weekly-plans com tournaments)
  const weeklyPlans = await storage.getWeeklyPlans(userId);

  // 2. Buscar dados dos Estudos - cronogramas e cartões com planejamento
  const studyCards = await storage.getStudyCards(userId);
  const studySchedules = await storage.getStudySchedules(userId);

  // 3. Limpar eventos existentes gerados pela rotina inteligente (batch delete)
  await db.delete(calendarEvents).where(
    and(
      eq(calendarEvents.userId, userId),
      eq(calendarEvents.source, 'intelligent_routine')
    )
  );


  // 4. Processar cada dia da semana
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
    const currentDate = new Date(weekStart);
    currentDate.setDate(currentDate.getDate() + dayOfWeek);

    // Buscar torneios planejados para este dia na Grade
    const plannedTournaments = await storage.getPlannedTournaments(userId);


    if (plannedTournaments.length > 0) {
    }

    const dayTournaments = plannedTournaments.filter(tournament => {
      const matches = tournament.dayOfWeek === dayOfWeek;

      if (matches) {
      }

      return matches;
    });


    // Se há torneios planejados, criar sessão de grind
    if (dayTournaments.length > 0) {
      try {
        // Ordenar torneios por horário
        const sortedTournaments = dayTournaments.sort((a, b) => {
          const timeA = a.time || '20:00';
          const timeB = b.time || '20:00';
          return timeA.localeCompare(timeB);
        });

        const firstTournament = sortedTournaments[0];
        const lastTournament = sortedTournaments[sortedTournaments.length - 1];

        // Calcular ABI médio
        const totalBuyIn = dayTournaments.reduce((sum, t) => sum + parseFloat(t.buyIn), 0);
        const averageBuyIn = totalBuyIn / dayTournaments.length;

        // Calcular horários da sessão (igual à lógica da Grade)
        const sessionStart = firstTournament.time;
        const sessionEnd = addHours(lastTournament.time, 3);

        // Criar horário de warm-up (15 min antes)
        const warmupStart = addMinutes(sessionStart, -15);
        const warmupEnd = sessionStart;


        // Criar timestamps
        const warmupStartTime = createTimestamp(weekStart, dayOfWeek, warmupStart);
        const warmupEndTime = createTimestamp(weekStart, dayOfWeek, warmupEnd);
        const sessionStartTime = createTimestamp(weekStart, dayOfWeek, sessionStart);
        const sessionEndTime = createTimestamp(weekStart, dayOfWeek, sessionEnd);


        // Adicionar Warm-up
        blocks.push({
          type: 'warmup',
          title: 'Warm-up',
          startTime: warmupStartTime,
          endTime: warmupEndTime,
          dayOfWeek,
          source: 'grade'
        });

        // Adicionar Grind com informações detalhadas
        blocks.push({
          type: 'grind',
          title: 'Grind',
          description: `${dayTournaments.length} torneios • ABI Med: $${averageBuyIn.toFixed(2)}`,
          startTime: sessionStartTime,
          endTime: sessionEndTime,
          dayOfWeek,
          source: 'grade'
        });


      } catch (error) {
        continue;
      }
    }

    // Buscar estudos planejados para este dia
    // 1. Buscar cronogramas de estudo da tabela studySchedules
    const dayStudySchedules = studySchedules.filter(schedule => schedule.dayOfWeek === dayOfWeek);

    // 2. Buscar cartões de estudo com configurações de planejamento
    const studyCardsForDay = studyCards.filter(card => {
      if (!card.studyDays || !Array.isArray(card.studyDays)) return false;
      return card.studyDays.includes(dayOfWeek as any);
    });


    // Processar cronogramas de estudo
    for (const schedule of dayStudySchedules) {
      try {
        const studyStart = schedule.startTime;
        const studyEnd = addMinutes(studyStart, schedule.duration);

        const studyStartTime = createTimestamp(weekStart, dayOfWeek, studyStart);
        const studyEndTime = createTimestamp(weekStart, dayOfWeek, studyEnd);

        // Buscar o cartão relacionado para obter o título
        const relatedCard = studyCards.find(card => card.id === schedule.studyCardId);
        const title = schedule.description || relatedCard?.title || 'Sessão de Estudo';

        blocks.push({
          type: 'study',
          title: title,
          startTime: studyStartTime,
          endTime: studyEndTime,
          dayOfWeek,
          source: 'estudos'
        });


      } catch (error) {
      }
    }

    // Processar cartões de estudo com configurações de planejamento
    for (const studyCard of studyCardsForDay) {
      if (!studyCard.studyStartTime || !studyCard.studyDuration) continue;

      try {
        const studyStart = String(studyCard.studyStartTime);
        const studyEnd = addMinutes(studyStart, studyCard.studyDuration);

        const studyStartTime = createTimestamp(weekStart, dayOfWeek, studyStart);
        const studyEndTime = createTimestamp(weekStart, dayOfWeek, studyEnd);

        blocks.push({
          type: 'study',
          title: studyCard.studyDescription || studyCard.title,
          startTime: studyStartTime,
          endTime: studyEndTime,
          dayOfWeek,
          source: 'estudos'
        });


      } catch (error) {
      }
    }
  }

  // 5. Criar eventos no calendário baseados nos blocos
  const categoryMappings = {
    'warmup': 'cat-2', // Warm-up
    'grind': 'cat-1',  // Grind
    'study': 'cat-3',  // Estudos
    'rest': 'cat-4'    // Descanso
  };


  for (const block of blocks) {
    try {
      const categoryId = categoryMappings[block.type as keyof typeof categoryMappings] || 'cat-1';

      const eventData = {
        userId,
        categoryId,
        title: block.title,
        description: block.description || `Gerado automaticamente pela rotina inteligente - ${block.source}`,
        startTime: block.startTime,
        endTime: block.endTime,
        dayOfWeek: block.dayOfWeek,
        isRecurring: false,
        recurrenceType: 'none',
        source: 'intelligent_routine'
      };

      await storage.createCalendarEvent(eventData);

    } catch (error) {
    }
  }

  // 6. Retornar rotina com estatísticas
  const routine = {
    blocks,
    conflicts: [],
    weekStart,
    stats: {
      totalBlocks: blocks.length,
      grindSessions: blocks.filter(b => b.type === 'grind').length,
      studySessions: blocks.filter(b => b.type === 'study').length,
      warmupSessions: blocks.filter(b => b.type === 'warmup').length
    }
  };

  return routine;
}

// Helper functions
function addHours(timeString: string, hours: number): string {
  const [h, m] = timeString.split(':').map(Number);
  let newHours = h + hours;
  let newMinutes = m;

  // Handle day overflow
  if (newHours >= 24) {
    newHours = newHours % 24;
  }
  if (newHours < 0) {
    newHours = 24 + newHours;
  }

  return `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}`;
}

function addMinutes(timeString: string, minutes: number): string {
  const [h, m] = timeString.split(':').map(Number);
  let totalMinutes = h * 60 + m + minutes;

  // Handle day overflow
  if (totalMinutes >= 24 * 60) {
    totalMinutes = totalMinutes % (24 * 60);
  }
  if (totalMinutes < 0) {
    totalMinutes = 24 * 60 + totalMinutes;
  }

  const newHours = Math.floor(totalMinutes / 60);
  const newMinutes = totalMinutes % 60;

  return `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}`;
}

export function registerCalendarRoutes(app: Express): void {
  // Active Days API routes
  app.get('/api/active-days', requireAuth, async (req: any, res) => {
    try {
      const user = req.user as any;
      const userId = user?.claims?.sub || user?.id;

      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const activeDays = await storage.getActiveDays(userId);
      res.json(activeDays);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch active days" });
    }
  });

  app.post('/api/active-days/toggle', requireAuth, async (req: any, res) => {
    try {
      const user = req.user as any;
      const userId = user?.claims?.sub || user?.id;

      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { dayOfWeek } = req.body;

      if (typeof dayOfWeek !== 'number' || dayOfWeek < 0 || dayOfWeek > 6) {
        return res.status(400).json({ message: "Invalid day of week (0-6)" });
      }

      const activeDay = await storage.toggleActiveDay(userId, dayOfWeek);
      res.json(activeDay);
    } catch (error) {
      res.status(500).json({ message: "Failed to toggle active day" });
    }
  });

  // Calendário Inteligente routes
  app.get('/api/weekly-routine', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const { weekStart } = req.query;

      if (!weekStart) {
        return res.status(400).json({ message: 'weekStart is required' });
      }

      const routine = await storage.getWeeklyRoutine(userId, new Date(weekStart));
      res.json(routine);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch weekly routine' });
    }
  });

  app.post('/api/weekly-routine/generate', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const { weekStart } = req.body;


      if (!weekStart) {
        return res.status(400).json({ message: 'weekStart is required' });
      }

      // Limpar eventos gerados automaticamente da rotina inteligente
      await storage.deleteCalendarEventsBySource(userId, 'intelligent_routine');

      // Gerar rotina automaticamente baseada nos dados da Grade e Estudos
      const routine = await generateWeeklyRoutine(userId, new Date(weekStart));

      // Converter blocos da rotina para eventos do calendário avançado
      if (routine.blocks && routine.blocks.length > 0) {
        const categories = await storage.getCalendarCategories(userId);
        const categoryMap = new Map(categories.map(cat => [cat.name.toLowerCase(), cat.id]));

        // Mapeamento de tipos de bloco para categorias
        const blockTypeToCategory = {
          'grind': 'grind',
          'warmup': 'warm up',
          'rest': 'cooldown',
          'study': 'estudo'
        };

        for (const block of routine.blocks) {
          const categoryName = blockTypeToCategory[block.type as keyof typeof blockTypeToCategory] || 'grind';
          const categoryId = categoryMap.get(categoryName) || categories[0]?.id;

          if (categoryId) {
            const startDate = new Date(weekStart);
            startDate.setDate(startDate.getDate() + block.dayOfWeek);

            // Verificar se startTime e endTime são Date objects ou strings
            let startTime, endTime;

            if (block.startTime instanceof Date) {
              startTime = block.startTime;
            } else if (typeof block.startTime === 'string' && block.startTime.includes(':')) {
              const [startHour, startMinute] = block.startTime.split(':').map(Number);
              if (!isNaN(startHour) && !isNaN(startMinute)) {
                startTime = new Date(startDate);
                startTime.setHours(startHour, startMinute, 0, 0);
              } else {
                continue; // Skip this block
              }
            } else {
              continue; // Skip this block
            }

            if (block.endTime instanceof Date) {
              endTime = block.endTime;
            } else if (typeof block.endTime === 'string' && block.endTime.includes(':')) {
              const [endHour, endMinute] = block.endTime.split(':').map(Number);
              if (!isNaN(endHour) && !isNaN(endMinute)) {
                endTime = new Date(startDate);
                endTime.setHours(endHour, endMinute, 0, 0);
              } else {
                continue; // Skip this block
              }
            } else {
              continue; // Skip this block
            }

            // Validate timestamps before creating event data
            const validatedStartTime = validateTimestamp(startTime, `${block.title} startTime`);
            const validatedEndTime = validateTimestamp(endTime, `${block.title} endTime`);

            const eventData = {
              userId,
              categoryId,
              title: block.title,
              description: `Gerado automaticamente pela rotina inteligente${block.source ? ` - ${block.source}` : ''}`,
              startTime: validatedStartTime,
              endTime: validatedEndTime,
              dayOfWeek: block.dayOfWeek,
              isRecurring: false,
              recurrenceType: 'none',
              source: 'intelligent_routine'
            };

            await storage.createCalendarEvent(eventData);
          }
        }
      }

      res.json(routine);
    } catch (error) {
      res.status(500).json({ message: 'Failed to generate weekly routine' });
    }
  });

  // Calendar Categories routes
  app.get('/api/calendar-categories', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const categories = await storage.getCalendarCategories(userId);

      // Create default categories if none exist
      if (categories.length === 0) {
        const defaultCategories = [
          { name: 'Atividade Física', color: '#22c55e', icon: 'activity', isDefault: true },
          { name: 'Warm Up', color: '#f59e0b', icon: 'flame', isDefault: true },
          { name: 'Grind', color: '#ef4444', icon: 'target', isDefault: true },
          { name: 'Estudo', color: '#3b82f6', icon: 'book-open', isDefault: true },
          { name: 'Cooldown', color: '#8b5cf6', icon: 'wind', isDefault: true },
          { name: 'Sono', color: '#1f2937', icon: 'moon', isDefault: true },
        ];

        for (const category of defaultCategories) {
          await storage.createCalendarCategory({
            ...category,
            userId,
          });
        }

        const newCategories = await storage.getCalendarCategories(userId);
        res.json(newCategories);
      } else {
        res.json(categories);
      }
    } catch (error) {
      res.status(500).json({ message: 'Failed to get calendar categories' });
    }
  });

  app.post('/api/calendar-categories', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const categoryData = insertCalendarCategorySchema.parse({
        ...req.body,
        userId
      });

      const category = await storage.createCalendarCategory(categoryData);
      res.json(category);
    } catch (error) {
      res.status(400).json({ message: 'Failed to create calendar category' });
    }
  });

  app.put('/api/calendar-categories/:id', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const categoryData = insertCalendarCategorySchema.partial().parse(req.body);

      const category = await storage.updateCalendarCategory(id, categoryData);
      res.json(category);
    } catch (error) {
      res.status(400).json({ message: 'Failed to update calendar category' });
    }
  });

  app.delete('/api/calendar-categories/:id', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deleteCalendarCategory(id);
      res.json({ message: 'Calendar category deleted successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to delete calendar category' });
    }
  });

  // Calendar Events routes
  app.get('/api/calendar-events', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const { weekStart, weekEnd } = req.query;

      const events = await storage.getCalendarEvents(
        userId,
        weekStart ? new Date(weekStart as string) : undefined,
        weekEnd ? new Date(weekEnd as string) : undefined
      );
      res.json(events);
    } catch (error) {
      res.status(500).json({ message: 'Failed to get calendar events' });
    }
  });

  app.post('/api/calendar-events', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const eventData = insertCalendarEventSchema.parse({
        ...req.body,
        userId,
        startTime: new Date(req.body.startTime),
        endTime: new Date(req.body.endTime)
      });

      // Handle recurrence creation
      if (eventData.isRecurring && eventData.recurrenceType !== 'none') {
        // Create parent event
        const parentEvent = await storage.createCalendarEvent(eventData);

        // Create recurring instances based on recurrence pattern
        const recurringEvents = [];
        const { recurrenceType, recurrencePattern } = eventData;

        if (recurrenceType === 'daily') {
          // Generate daily events for the next 90 days
          for (let i = 1; i <= 90; i++) {
            const eventDate = new Date(eventData.startTime);
            eventDate.setDate(eventDate.getDate() + i);

            const endDate = new Date(eventData.endTime);
            endDate.setDate(endDate.getDate() + i);

            const recurringEvent = await storage.createCalendarEvent({
              ...eventData,
              startTime: eventDate,
              endTime: endDate,
              parentEventId: parentEvent.id,
              dayOfWeek: eventDate.getDay()
            });
            recurringEvents.push(recurringEvent);
          }
        } else if (recurrenceType === 'weekly') {
          // Generate weekly events for the next 52 weeks
          for (let i = 1; i <= 52; i++) {
            const eventDate = new Date(eventData.startTime);
            eventDate.setDate(eventDate.getDate() + (i * 7));

            const endDate = new Date(eventData.endTime);
            endDate.setDate(endDate.getDate() + (i * 7));

            const recurringEvent = await storage.createCalendarEvent({
              ...eventData,
              startTime: eventDate,
              endTime: endDate,
              parentEventId: parentEvent.id,
              dayOfWeek: eventDate.getDay()
            });
            recurringEvents.push(recurringEvent);
          }
        }

        res.json({ parentEvent, recurringEvents });
      } else {
        const event = await storage.createCalendarEvent(eventData);
        res.json(event);
      }
    } catch (error) {
      res.status(400).json({ message: 'Failed to create calendar event' });
    }
  });

  app.put('/api/calendar-events/:id', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { editType } = req.body; // 'single' or 'series'
      const eventData = insertCalendarEventSchema.partial().parse({
        ...req.body,
        startTime: req.body.startTime ? new Date(req.body.startTime) : undefined,
        endTime: req.body.endTime ? new Date(req.body.endTime) : undefined
      });

      if (editType === 'series') {
        // Find the parent event ID
        const event = await storage.getCalendarEvents(req.user.userPlatformId);
        const currentEvent = event.find(e => e.id === id);
        const parentId = currentEvent?.parentEventId || id;

        await storage.updateRecurringEventSeries(parentId, eventData);
        res.json({ message: 'Recurring series updated successfully' });
      } else {
        const event = await storage.updateCalendarEvent(id, eventData);
        res.json(event);
      }
    } catch (error) {
      res.status(400).json({ message: 'Failed to update calendar event' });
    }
  });

  app.delete('/api/calendar-events/:id', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { deleteType } = req.query; // 'single' or 'series'

      if (deleteType === 'series') {
        // Find the parent event ID
        const events = await storage.getCalendarEvents(req.user.userPlatformId);
        const currentEvent = events.find(e => e.id === id);
        const parentId = currentEvent?.parentEventId || id;

        await storage.deleteRecurringEventSeries(parentId);
        res.json({ message: 'Recurring series deleted successfully' });
      } else {
        await storage.deleteCalendarEvent(id);
        res.json({ message: 'Calendar event deleted successfully' });
      }
    } catch (error) {
      res.status(500).json({ message: 'Failed to delete calendar event' });
    }
  });
}

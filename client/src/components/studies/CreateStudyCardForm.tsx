import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { CATEGORIES, WEEK_DAYS } from "./types";

export const createStudyCardSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional(),
  category: z.string().min(1, "Categoria é obrigatória"),
  difficulty: z.enum(["Iniciante", "Intermediário", "Avançado"]),
  estimatedTime: z.number().min(1, "Tempo estimado deve ser maior que 0"),
  priority: z.enum(["Baixa", "Média", "Alta"]),
  objectives: z.string().optional(),
  studyDays: z.array(z.string()).optional(),
  studyStartTime: z.string().optional(),
  studyDuration: z.number().optional(),
  isRecurring: z.boolean().optional(),
  weeklyFrequency: z.number().optional(),
  studyDescription: z.string().optional(),
});

export type CreateStudyCardData = z.infer<typeof createStudyCardSchema>;

function WeeklyStudyPlanForm({ form }: { form: any }) {
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [isRecurring, setIsRecurring] = useState(false);

  const handleDayToggle = (dayKey: string) => {
    const newDays = selectedDays.includes(dayKey)
      ? selectedDays.filter(d => d !== dayKey)
      : [...selectedDays, dayKey];

    setSelectedDays(newDays);
    form.setValue('studyDays', newDays);
  };

  const handleRecurringToggle = (checked: boolean) => {
    setIsRecurring(checked);
    form.setValue('isRecurring', checked);
  };

  return (
    <div className="space-y-4">
      {/* Dias da Semana */}
      <div>
        <FormLabel className="text-white text-sm font-medium mb-3 block">
          Dias sugeridos para estudo
        </FormLabel>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {WEEK_DAYS.map((day) => (
            <div key={day.key} className="flex items-center space-x-2">
              <Checkbox
                id={day.key}
                checked={selectedDays.includes(day.key)}
                onCheckedChange={() => handleDayToggle(day.key)}
                className="border-gray-600"
              />
              <Label
                htmlFor={day.key}
                className="text-sm text-white cursor-pointer"
              >
                {day.label}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {/* Horário e Duração */}
      {selectedDays.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="studyStartTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Horário de início</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="time"
                    className="bg-gray-800 border-gray-600 text-white"
                    placeholder="10:00"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="studyDuration"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Duração (minutos)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="number"
                    min="15"
                    max="480"
                    className="bg-gray-800 border-gray-600 text-white"
                    placeholder="90"
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 60)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}

      {/* Estudo Recorrente */}
      {selectedDays.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Switch
              id="recurring"
              checked={isRecurring}
              onCheckedChange={handleRecurringToggle}
            />
            <Label htmlFor="recurring" className="text-white">
              Estudo recorrente
            </Label>
          </div>

          {isRecurring && (
            <FormField
              control={form.control}
              name="weeklyFrequency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white">Frequência por semana</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      min="1"
                      max="7"
                      className="bg-gray-800 border-gray-600 text-white w-24"
                      placeholder="2"
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 2)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
      )}

      {/* Descrição do Estudo */}
      {selectedDays.length > 0 && (
        <FormField
          control={form.control}
          name="studyDescription"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white">Descrição opcional</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="Ex: Aula da Apollo, Teoria ICM, etc."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  );
}

interface CreateStudyCardFormProps {
  onClose: () => void;
  onSubmit: (data: CreateStudyCardData) => void;
}

export function CreateStudyCardForm({ onClose, onSubmit }: CreateStudyCardFormProps) {
  const form = useForm<CreateStudyCardData>({
    resolver: zodResolver(createStudyCardSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "",
      difficulty: "Intermediário",
      estimatedTime: 30,
      priority: "Média",
      objectives: "",
      studyDays: [],
      studyStartTime: "",
      studyDuration: 60,
      isRecurring: false,
      weeklyFrequency: 2,
      studyDescription: "",
    },
  });

  const handleFormSubmit = (data: CreateStudyCardData) => {
    onSubmit(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Título do Estudo</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    className="bg-gray-800 border-gray-600 text-white"
                    placeholder="Ex: Defesa contra 3bet"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Categoria</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                      <SelectValue placeholder="Selecione uma categoria" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="bg-poker-surface border-gray-600">
                    {CATEGORIES.map(category => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="difficulty"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Dificuldade</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                      <SelectValue placeholder="Selecione a dificuldade" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="bg-poker-surface border-gray-600">
                    <SelectItem value="Iniciante">Iniciante</SelectItem>
                    <SelectItem value="Intermediário">Intermediário</SelectItem>
                    <SelectItem value="Avançado">Avançado</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Prioridade</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                      <SelectValue placeholder="Selecione a prioridade" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="bg-poker-surface border-gray-600">
                    <SelectItem value="Baixa">Baixa</SelectItem>
                    <SelectItem value="Média">Média</SelectItem>
                    <SelectItem value="Alta">Alta</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="estimatedTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Tempo estimado (min)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="number"
                    min="1"
                    className="bg-gray-800 border-gray-600 text-white"
                    placeholder="30"
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white">Descrição</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="Descreva o que você quer estudar..."
                  rows={3}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="objectives"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white">Objetivos</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="Liste seus objetivos de aprendizado..."
                  rows={3}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Seção de Planejamento Semanal */}
        <div className="space-y-4 border-t border-gray-700 pt-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Planejamento Semanal (Opcional)
          </h3>

          <WeeklyStudyPlanForm form={form} />
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onClose} className="text-white border-gray-600">
            Cancelar
          </Button>
          <Button type="submit" className="bg-poker-accent hover:bg-poker-accent/90 text-black font-semibold">
            Criar Estudo
          </Button>
        </div>
      </form>
    </Form>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  BookOpen, 
  Plus, 
  Brain, 
  Target, 
  Clock, 
  Trophy, 
  TrendingUp, 
  FileText, 
  Video, 
  Link,
  Users,
  Calendar,
  BarChart3,
  Settings,
  Search,
  Filter,
  ChevronRight,
  Star,
  Play,
  Pause,
  RotateCcw,
  Upload,
  ExternalLink,
  CheckCircle,
  Circle,
  Eye,
  Edit,
  Trash2,
  Download
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type StudyCard } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES = [
  "3bet", "4bet", "River Play", "ICM", "Bubble Play", "Final Table", 
  "Tournament Strategy", "Cash Game", "Short Stack", "Big Stack", "Psychology"
];

const createStudyCardSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional(),
  category: z.string().min(1, "Categoria é obrigatória"),
  difficulty: z.enum(["Iniciante", "Intermediário", "Avançado"]),
  estimatedTime: z.number().min(1, "Tempo estimado deve ser maior que 0"),
  priority: z.enum(["Baixa", "Média", "Alta"]),
  objectives: z.string().optional(),
});

type CreateStudyCardData = z.infer<typeof createStudyCardSchema>;

const PRIORITIES = [
  { value: "critico", label: "Crítico", color: "bg-red-500" },
  { value: "alto", label: "Alto", color: "bg-orange-500" },
  { value: "medio", label: "Médio", color: "bg-yellow-500" },
  { value: "baixo", label: "Baixo", color: "bg-green-500" }
];

interface StudyDashboardStats {
  totalCards: number;
  activeCards: number;
  completedCards: number;
  totalTimeInvested: number;
  avgKnowledgeScore: number;
  weeklyTime: number;
  monthlyTime: number;
}

export default function Studies() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCard, setSelectedCard] = useState<StudyCard | null>(null);
  const { toast } = useToast();

  // Fetch study cards
  const { data: studyCards = [], isLoading } = useQuery({
    queryKey: ["/api/study-cards"],
  });

  const createStudyCardMutation = useMutation({
    mutationFn: async (data: CreateStudyCardData) => {
      return await apiRequest('/api/study-cards', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/study-cards'] });
      toast({
        title: "Sucesso!",
        description: "Card de estudo criado com sucesso.",
      });
      setShowCreateDialog(false);
    },
    onError: (error) => {
      console.error('Error creating study card:', error);
      toast({
        title: "Erro",
        description: "Erro ao criar card de estudo. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  // Mock dashboard stats (will be replaced with real data)
  const dashboardStats: StudyDashboardStats = {
    totalCards: 8,
    activeCards: 5,
    completedCards: 3,
    totalTimeInvested: 1250, // minutes
    avgKnowledgeScore: 67,
    weeklyTime: 180,
    monthlyTime: 720
  };

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-400";
    if (score >= 60) return "text-yellow-400";
    return "text-red-400";
  };

  const getPriorityColor = (priority: string) => {
    const priorityConfig = PRIORITIES.find(p => p.value === priority);
    return priorityConfig?.color || "bg-gray-500";
  };

  const filteredCards = studyCards.filter((card: StudyCard) => {
    const matchesCategory = !selectedCategory || selectedCategory === "all" || card.category === selectedCategory;
    const matchesSearch = !searchQuery || 
      card.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-poker-bg flex items-center justify-center">
        <div className="text-poker-gold text-xl">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-poker-bg text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-poker-accent" />
              Estudos
            </h1>
            <p className="text-gray-400 mt-2">
              Centro de conhecimento e desenvolvimento contínuo
            </p>
          </div>
          
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="bg-poker-accent hover:bg-poker-accent/90 text-black font-semibold">
                <Plus className="w-4 h-4 mr-2" />
                Novo Estudo
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] bg-poker-surface border-gray-700">
              <DialogHeader>
                <DialogTitle className="text-white">Criar Novo Cartão de Estudo</DialogTitle>
                <DialogDescription className="text-gray-400">
                  Organize seu aprendizado com objetivos claros e métricas mensuráveis
                </DialogDescription>
              </DialogHeader>
              <CreateStudyCardForm 
                onClose={() => setShowCreateDialog(false)} 
                onSubmit={createStudyCardMutation.mutate}
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* Dashboard Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="bg-poker-surface border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-400">Cartões Ativos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{dashboardStats.activeCards}</div>
              <p className="text-xs text-gray-400">de {dashboardStats.totalCards} totais</p>
            </CardContent>
          </Card>

          <Card className="bg-poker-surface border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-400">Tempo Investido</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-poker-accent">
                {formatTime(dashboardStats.weeklyTime)}
              </div>
              <p className="text-xs text-gray-400">esta semana</p>
            </CardContent>
          </Card>

          <Card className="bg-poker-surface border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-400">Score Médio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getScoreColor(dashboardStats.avgKnowledgeScore)}`}>
                {dashboardStats.avgKnowledgeScore}%
              </div>
              <p className="text-xs text-gray-400">conhecimento geral</p>
            </CardContent>
          </Card>

          <Card className="bg-poker-surface border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-400">Concluídos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-400">{dashboardStats.completedCards}</div>
              <p className="text-xs text-gray-400">estudos finalizados</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar estudos..."
              className="pl-10 bg-poker-surface border-gray-600 text-white"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-full sm:w-48 bg-poker-surface border-gray-600 text-white">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent className="bg-poker-surface border-gray-600">
              <SelectItem value="all">Todas</SelectItem>
              {CATEGORIES.map(category => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Study Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCards.map((card: StudyCard) => (
            <Card 
              key={card.id} 
              className="bg-poker-surface border-gray-700 hover:border-poker-accent/50 transition-colors cursor-pointer"
              onClick={() => setSelectedCard(card)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between mb-2">
                  <Badge className={`${getPriorityColor(card.priority)} text-white`}>
                    {PRIORITIES.find(p => p.value === card.priority)?.label}
                  </Badge>
                  <Badge variant="outline" className="text-white border-gray-400">
                    {card.category}
                  </Badge>
                </div>
                <CardTitle className="text-white text-lg">{card.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Progresso</span>
                    <span className={`font-semibold ${getScoreColor(card.knowledgeScore || 0)}`}>
                      {card.knowledgeScore || 0}%
                    </span>
                  </div>
                  <Progress value={card.knowledgeScore || 0} className="h-2" />
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Tempo investido</span>
                    <span className="text-white">{formatTime(card.timeInvested || 0)}</span>
                  </div>
                  
                  {card.currentStat && card.targetStat && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">Stat atual</span>
                      <span className="text-white">
                        {card.currentStat}% → {card.targetStat}%
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Empty State */}
        {filteredCards.length === 0 && (
          <div className="text-center py-12">
            <Brain className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-400 mb-2">
              {searchQuery || selectedCategory ? "Nenhum estudo encontrado" : "Nenhum estudo criado"}
            </h3>
            <p className="text-gray-500 mb-6">
              {searchQuery || selectedCategory ? 
                "Tente ajustar os filtros ou criar um novo estudo" : 
                "Comece criando seu primeiro cartão de estudo"
              }
            </p>
            <Button 
              onClick={() => setShowCreateDialog(true)}
              className="bg-poker-accent hover:bg-poker-accent/90 text-black font-semibold"
            >
              <Plus className="w-4 h-4 mr-2" />
              Criar Primeiro Estudo
            </Button>
          </div>
        )}
      </div>

      {/* Study Card Detail Dialog */}
      <Dialog open={!!selectedCard} onOpenChange={() => setSelectedCard(null)}>
        <DialogContent className="sm:max-w-[800px] bg-poker-surface border-gray-700">
          {selectedCard && (
            <StudyCardDetail card={selectedCard} onClose={() => setSelectedCard(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateStudyCardForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: CreateStudyCardData) => void }) {
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

function StudyCardDetail({ card, onClose }: { card: StudyCard; onClose: () => void }) {
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);
  const [showAddFlashCard, setShowAddFlashCard] = useState(false);
  const { toast } = useToast();

  // Fetch materials, notes, and flash cards for this study card
  const { data: materials = [] } = useQuery({
    queryKey: ['/api/study-materials', card.id],
  });

  const { data: notes = [] } = useQuery({
    queryKey: ['/api/study-notes', card.id],
  });

  const { data: flashCards = [] } = useQuery({
    queryKey: ['/api/study-flash-cards', card.id],
  });

  return (
    <div className="space-y-6">
      <DialogHeader>
        <div className="flex items-center justify-between">
          <DialogTitle className="text-white flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-poker-accent" />
            {card.title}
          </DialogTitle>
          <Badge className={`${getPriorityColor(card.priority)} text-white`}>
            {PRIORITIES.find(p => p.value === card.priority)?.label}
          </Badge>
        </div>
        <DialogDescription className="text-gray-400">
          {card.description}
        </DialogDescription>
      </DialogHeader>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-gray-800">
          <TabsTrigger value="overview" className="text-white">Visão Geral</TabsTrigger>
          <TabsTrigger value="materials" className="text-white">Materiais</TabsTrigger>
          <TabsTrigger value="notes" className="text-white">Anotações</TabsTrigger>
          <TabsTrigger value="flashcards" className="text-white">Flash Cards</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-gray-800 border-gray-600">
              <CardHeader>
                <CardTitle className="text-white text-sm">Progresso</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-poker-accent mb-2">
                  {card.knowledgeScore || 0}%
                </div>
                <Progress value={card.knowledgeScore || 0} className="h-2" />
              </CardContent>
            </Card>

            <Card className="bg-gray-800 border-gray-600">
              <CardHeader>
                <CardTitle className="text-white text-sm">Tempo Investido</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">
                  {formatTime(card.timeInvested || 0)}
                </div>
              </CardContent>
            </Card>
          </div>

          {card.objectives && (
            <Card className="bg-gray-800 border-gray-600">
              <CardHeader>
                <CardTitle className="text-white text-sm">Objetivos</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 whitespace-pre-wrap">{card.objectives}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="materials" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-white">Materiais de Estudo</h3>
            <Dialog open={showAddMaterial} onOpenChange={setShowAddMaterial}>
              <DialogTrigger asChild>
                <Button className="bg-poker-accent hover:bg-poker-accent/90 text-black">
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Material
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-900 border-gray-700 max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="text-white">Adicionar Material de Estudo</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Adicione links, arquivos ou aulas para organizar seus materiais de estudo
                  </DialogDescription>
                </DialogHeader>
                <AddMaterialForm studyCardId={card.id} onClose={() => setShowAddMaterial(false)} />
              </DialogContent>
            </Dialog>
          </div>

          {materials.length > 0 ? (
            <div className="space-y-3">
              {materials.map((material: any) => (
                <MaterialCard key={material.id} material={material} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Video className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">Nenhum material adicionado ainda</p>
              <p className="text-sm text-gray-500 mt-2">
                Adicione aulas, artigos, vídeos ou arquivos para organizar seus estudos
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="notes" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-white">Anotações</h3>
            <Dialog open={showAddNote} onOpenChange={setShowAddNote}>
              <DialogTrigger asChild>
                <Button className="bg-poker-accent hover:bg-poker-accent/90 text-black">
                  <Plus className="w-4 h-4 mr-2" />
                  Nova Anotação
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-900 border-gray-700 max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="text-white">Nova Anotação</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Crie anotações para registrar insights e descobertas importantes
                  </DialogDescription>
                </DialogHeader>
                <AddNoteForm studyCardId={card.id} onClose={() => setShowAddNote(false)} />
              </DialogContent>
            </Dialog>
          </div>

          {notes.length > 0 ? (
            <div className="space-y-3">
              {notes.map((note: any) => (
                <NoteCard key={note.id} note={note} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">Nenhuma anotação criada ainda</p>
              <p className="text-sm text-gray-500 mt-2">
                Registre insights, descobertas e pontos importantes dos seus estudos
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="flashcards" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-white">Flash Cards</h3>
            <Dialog open={showAddFlashCard} onOpenChange={setShowAddFlashCard}>
              <DialogTrigger asChild>
                <Button className="bg-poker-accent hover:bg-poker-accent/90 text-black">
                  <Plus className="w-4 h-4 mr-2" />
                  Criar Flash Card
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-900 border-gray-700 max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="text-white">Criar Flash Card</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Crie flash cards para fixar conceitos importantes e testar seu conhecimento
                  </DialogDescription>
                </DialogHeader>
                <AddFlashCardForm studyCardId={card.id} onClose={() => setShowAddFlashCard(false)} />
              </DialogContent>
            </Dialog>
          </div>

          {flashCards.length > 0 ? (
            <div className="space-y-3">
              {flashCards.map((flashCard: any) => (
                <FlashCardComponent key={flashCard.id} flashCard={flashCard} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Brain className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">Nenhum flash card criado ainda</p>
              <p className="text-sm text-gray-500 mt-2">
                Crie flash cards para fixar conceitos e testar seu conhecimento
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function getPriorityColor(priority: string) {
  const priorityConfig = PRIORITIES.find(p => p.value === priority);
  return priorityConfig?.color || "bg-gray-500";
}

function formatTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

// Schema for material creation
const createMaterialSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  type: z.enum(["video", "article", "file", "link"]),
  url: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["not_started", "in_progress", "completed"]).default("not_started"),
});

type CreateMaterialData = z.infer<typeof createMaterialSchema>;

function AddMaterialForm({ studyCardId, onClose }: { studyCardId: string; onClose: () => void }) {
  const { toast } = useToast();
  const form = useForm<CreateMaterialData>({
    resolver: zodResolver(createMaterialSchema),
    defaultValues: {
      title: "",
      type: "video",
      url: "",
      description: "",
      status: "not_started",
    },
  });

  const createMaterialMutation = useMutation({
    mutationFn: async (data: CreateMaterialData) => {
      return await apiRequest('/api/study-materials', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          studyCardId,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/study-materials', studyCardId] });
      toast({
        title: "Material adicionado!",
        description: "Material de estudo criado com sucesso.",
      });
      onClose();
    },
    onError: (error) => {
      console.error('Error creating material:', error);
      toast({
        title: "Erro",
        description: "Erro ao criar material. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: CreateMaterialData) => {
    createMaterialMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Título</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    className="bg-gray-800 border-gray-600 text-white"
                    placeholder="Ex: Aula sobre 3bet ranges"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Tipo</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="bg-poker-surface border-gray-600">
                    <SelectItem value="video">📹 Vídeo/Aula</SelectItem>
                    <SelectItem value="article">📄 Artigo</SelectItem>
                    <SelectItem value="file">📎 Arquivo</SelectItem>
                    <SelectItem value="link">🔗 Link</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white">URL/Link</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="https://..."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
                  placeholder="Descreva o conteúdo do material..."
                  rows={3}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onClose} className="text-white border-gray-600">
            Cancelar
          </Button>
          <Button 
            type="submit" 
            className="bg-poker-accent hover:bg-poker-accent/90 text-black font-semibold"
            disabled={createMaterialMutation.isPending}
          >
            {createMaterialMutation.isPending ? "Criando..." : "Adicionar Material"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function MaterialCard({ material }: { material: any }) {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case "video": return <Video className="w-5 h-5 text-red-500" />;
      case "article": return <FileText className="w-5 h-5 text-blue-500" />;
      case "file": return <Download className="w-5 h-5 text-green-500" />;
      case "link": return <ExternalLink className="w-5 h-5 text-purple-500" />;
      default: return <FileText className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "in_progress": return <Clock className="w-5 h-5 text-yellow-500" />;
      default: return <Circle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "completed": return "Concluído";
      case "in_progress": return "Em andamento";
      default: return "Não iniciado";
    }
  };

  return (
    <Card className="bg-gray-800 border-gray-600 hover:bg-gray-750 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getTypeIcon(material.type)}
            <div>
              <h4 className="font-semibold text-white">{material.title}</h4>
              {material.description && (
                <p className="text-sm text-gray-400 mt-1">{material.description}</p>
              )}
              {material.url && (
                <a
                  href={material.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-poker-accent hover:text-poker-accent/80 mt-1 inline-flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  Abrir link
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {getStatusIcon(material.status)}
              <span className="ml-1">{getStatusLabel(material.status)}</span>
            </Badge>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <Eye className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Schema for note creation
const createNoteSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  content: z.string().min(1, "Conteúdo é obrigatório"),
  tags: z.string().optional(),
});

type CreateNoteData = z.infer<typeof createNoteSchema>;

function AddNoteForm({ studyCardId, onClose }: { studyCardId: string; onClose: () => void }) {
  const { toast } = useToast();
  const form = useForm<CreateNoteData>({
    resolver: zodResolver(createNoteSchema),
    defaultValues: {
      title: "",
      content: "",
      tags: "",
    },
  });

  const createNoteMutation = useMutation({
    mutationFn: async (data: CreateNoteData) => {
      return await apiRequest('/api/study-notes', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          studyCardId,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/study-notes', studyCardId] });
      toast({
        title: "Anotação criada!",
        description: "Anotação adicionada com sucesso.",
      });
      onClose();
    },
    onError: (error) => {
      console.error('Error creating note:', error);
      toast({
        title: "Erro",
        description: "Erro ao criar anotação. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: CreateNoteData) => {
    createNoteMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white">Título</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="Ex: Descobertas sobre 3bet calling ranges"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white">Conteúdo</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="Descreva suas descobertas, insights e pontos importantes..."
                  rows={8}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="tags"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white">Tags (opcional)</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="Ex: 3bet, ranges, BTN vs BB"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onClose} className="text-white border-gray-600">
            Cancelar
          </Button>
          <Button 
            type="submit" 
            className="bg-poker-accent hover:bg-poker-accent/90 text-black font-semibold"
            disabled={createNoteMutation.isPending}
          >
            {createNoteMutation.isPending ? "Criando..." : "Criar Anotação"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function NoteCard({ note }: { note: any }) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Card className="bg-gray-800 border-gray-600 hover:bg-gray-750 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-poker-accent" />
              <h4 className="font-semibold text-white">{note.title}</h4>
            </div>
            <p className="text-gray-300 whitespace-pre-wrap mb-3">{note.content}</p>
            {note.tags && (
              <div className="flex flex-wrap gap-1 mb-2">
                {note.tags.split(',').map((tag: string, index: number) => (
                  <Badge key={index} variant="secondary" className="text-xs bg-gray-700">
                    {tag.trim()}
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-500">
              {formatDate(note.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <Edit className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-400 hover:text-red-300">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Schema for flash card creation
const createFlashCardSchema = z.object({
  question: z.string().min(1, "Pergunta é obrigatória"),
  answer: z.string().min(1, "Resposta é obrigatória"),
  difficulty: z.enum(["Fácil", "Médio", "Difícil"]).default("Médio"),
  tags: z.string().optional(),
});

type CreateFlashCardData = z.infer<typeof createFlashCardSchema>;

function AddFlashCardForm({ studyCardId, onClose }: { studyCardId: string; onClose: () => void }) {
  const { toast } = useToast();
  const form = useForm<CreateFlashCardData>({
    resolver: zodResolver(createFlashCardSchema),
    defaultValues: {
      question: "",
      answer: "",
      difficulty: "Médio",
      tags: "",
    },
  });

  const createFlashCardMutation = useMutation({
    mutationFn: async (data: CreateFlashCardData) => {
      return await apiRequest('/api/study-flash-cards', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          studyCardId,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/study-flash-cards', studyCardId] });
      toast({
        title: "Flash Card criado!",
        description: "Flash card adicionado com sucesso.",
      });
      onClose();
    },
    onError: (error) => {
      console.error('Error creating flash card:', error);
      toast({
        title: "Erro",
        description: "Erro ao criar flash card. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: CreateFlashCardData) => {
    createFlashCardMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="question"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white">Pergunta</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="Ex: Qual é a range ideal para 3bet no BTN vs BB?"
                  rows={3}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="answer"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white">Resposta</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="Descreva a resposta detalhada..."
                  rows={4}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <SelectItem value="Fácil">🟢 Fácil</SelectItem>
                    <SelectItem value="Médio">🟡 Médio</SelectItem>
                    <SelectItem value="Difícil">🔴 Difícil</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="tags"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Tags (opcional)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    className="bg-gray-800 border-gray-600 text-white"
                    placeholder="Ex: 3bet, ranges, BTN"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onClose} className="text-white border-gray-600">
            Cancelar
          </Button>
          <Button 
            type="submit" 
            className="bg-poker-accent hover:bg-poker-accent/90 text-black font-semibold"
            disabled={createFlashCardMutation.isPending}
          >
            {createFlashCardMutation.isPending ? "Criando..." : "Criar Flash Card"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function FlashCardComponent({ flashCard }: { flashCard: any }) {
  const [showAnswer, setShowAnswer] = useState(false);

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "Fácil": return "text-green-500";
      case "Médio": return "text-yellow-500";
      case "Difícil": return "text-red-500";
      default: return "text-gray-500";
    }
  };

  return (
    <Card className="bg-gray-800 border-gray-600 hover:bg-gray-750 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-poker-accent" />
            <Badge variant="outline" className={`text-xs ${getDifficultyColor(flashCard.difficulty)}`}>
              {flashCard.difficulty}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <Edit className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-400 hover:text-red-300">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-gray-700 p-3 rounded-lg">
            <p className="text-sm font-medium text-poker-accent mb-1">Pergunta:</p>
            <p className="text-white">{flashCard.question}</p>
          </div>

          {showAnswer && (
            <div className="bg-gray-700 p-3 rounded-lg">
              <p className="text-sm font-medium text-green-400 mb-1">Resposta:</p>
              <p className="text-white">{flashCard.answer}</p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Button 
              variant="outline" 
              onClick={() => setShowAnswer(!showAnswer)}
              className="text-white border-gray-600"
            >
              {showAnswer ? <Eye className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
              {showAnswer ? "Ocultar Resposta" : "Mostrar Resposta"}
            </Button>

            {flashCard.tags && (
              <div className="flex flex-wrap gap-1">
                {flashCard.tags.split(',').map((tag: string, index: number) => (
                  <Badge key={index} variant="secondary" className="text-xs bg-gray-700">
                    {tag.trim()}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
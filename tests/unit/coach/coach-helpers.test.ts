import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes de Caracterizacao: Logica Pura do GradeCoach
//
// As funcoes getPriorityColor, getPriorityLabel, getTypeColor, getTypeIcon e
// generateSampleInsights sao internas ao componente GradeCoach.tsx.
// Como nao sao exportadas, estes testes caracterizam o comportamento da logica
// replicando as funcoes puras. Documentam o contrato ATUAL.
//
// Todos devem PASSAR — refletem o comportamento existente.
// =============================================================================

// ---------------------------------------------------------------------------
// Replica de getPriorityColor (GradeCoach.tsx:166-173)
// ---------------------------------------------------------------------------
function getPriorityColor(priority: number): string {
  switch (priority) {
    case 3: return "border-red-500";
    case 2: return "border-yellow-500";
    case 1: return "border-blue-500";
    default: return "border-gray-500";
  }
}

// ---------------------------------------------------------------------------
// Replica de getPriorityLabel (GradeCoach.tsx:175-182)
// ---------------------------------------------------------------------------
function getPriorityLabel(priority: number): string {
  switch (priority) {
    case 3: return "High Priority";
    case 2: return "Medium Priority";
    case 1: return "Low Priority";
    default: return "Priority";
  }
}

// ---------------------------------------------------------------------------
// Replica de getTypeColor (GradeCoach.tsx:193-200)
// ---------------------------------------------------------------------------
function getTypeColor(type: string): string {
  switch (type) {
    case "suggestion": return "text-green-400";
    case "warning": return "text-yellow-400";
    case "opportunity": return "text-blue-400";
    default: return "text-gray-400";
  }
}

// ---------------------------------------------------------------------------
// Replica de getTypeIcon — retorna o nome do icone em vez do JSX
// (GradeCoach.tsx:184-191)
// ---------------------------------------------------------------------------
function getTypeIconName(type: string): string {
  switch (type) {
    case "suggestion": return "Lightbulb";
    case "warning": return "TrendingUp";
    case "opportunity": return "BarChart3";
    default: return "Lightbulb";
  }
}

// ---------------------------------------------------------------------------
// Replica de generateSampleInsights — retorna o array de dados
// (GradeCoach.tsx:133-163)
// ---------------------------------------------------------------------------
function generateSampleInsights() {
  return [
    {
      type: "suggestion",
      category: "roi_optimization",
      title: "ROI Optimization Opportunity",
      description: "Your ROI in $109 PKO tournaments has improved by 12% over the last month. Consider increasing your volume in this format while reducing play in $55 Turbo tournaments where you're showing a -8.5% ROI.",
      priority: 3,
      data: { improvementRate: 12, recommendedAction: "increase_volume" }
    },
    {
      type: "warning",
      category: "schedule_optimization",
      title: "Schedule Optimization",
      description: "Your performance on Tuesday evenings is 15% below your weekly average. Consider shifting some of your Tuesday tournaments to Wednesday or Thursday when you perform better.",
      priority: 2,
      data: { performanceDecrease: 15, suggestedDays: ["Wednesday", "Thursday"] }
    },
    {
      type: "opportunity",
      category: "volume_adjustment",
      title: "Volume Analysis",
      description: "Your tournament volume has been consistent at 8-10 tournaments per session. Your performance metrics suggest you could handle 2-3 additional tournaments without significant ROI impact.",
      priority: 1,
      data: { currentVolume: 9, suggestedIncrease: 2 }
    }
  ];
}

// ---------------------------------------------------------------------------
// Calculo de summary (GradeCoach.tsx:506-528)
// Usa campo "read" conforme schema (coaching_insights.read)
// ---------------------------------------------------------------------------
function computeSummary(insights: Array<{ priority: number; isApplied: boolean; read: boolean }>) {
  return {
    total: insights.length,
    highPriority: insights.filter(i => i.priority === 3).length,
    applied: insights.filter(i => i.isApplied).length,
    unread: insights.filter(i => !i.read).length,
  };
}

// =============================================================================
// TESTES
// =============================================================================

describe('GradeCoach — getPriorityColor', () => {
  it('deve retornar border-red-500 para priority 3', () => {
    expect(getPriorityColor(3)).toBe('border-red-500');
  });

  it('deve retornar border-yellow-500 para priority 2', () => {
    expect(getPriorityColor(2)).toBe('border-yellow-500');
  });

  it('deve retornar border-blue-500 para priority 1', () => {
    expect(getPriorityColor(1)).toBe('border-blue-500');
  });

  it('deve retornar border-gray-500 para priority desconhecida (0)', () => {
    expect(getPriorityColor(0)).toBe('border-gray-500');
  });

  it('deve retornar border-gray-500 para priority desconhecida (99)', () => {
    expect(getPriorityColor(99)).toBe('border-gray-500');
  });
});

describe('GradeCoach — getPriorityLabel', () => {
  it('deve retornar "High Priority" para priority 3', () => {
    expect(getPriorityLabel(3)).toBe('High Priority');
  });

  it('deve retornar "Medium Priority" para priority 2', () => {
    expect(getPriorityLabel(2)).toBe('Medium Priority');
  });

  it('deve retornar "Low Priority" para priority 1', () => {
    expect(getPriorityLabel(1)).toBe('Low Priority');
  });

  it('deve retornar "Priority" para valor desconhecido', () => {
    expect(getPriorityLabel(0)).toBe('Priority');
  });
});

describe('GradeCoach — getTypeIconName', () => {
  it('deve retornar Lightbulb para suggestion', () => {
    expect(getTypeIconName('suggestion')).toBe('Lightbulb');
  });

  it('deve retornar TrendingUp para warning', () => {
    expect(getTypeIconName('warning')).toBe('TrendingUp');
  });

  it('deve retornar BarChart3 para opportunity', () => {
    expect(getTypeIconName('opportunity')).toBe('BarChart3');
  });

  it('deve retornar Lightbulb para tipo desconhecido', () => {
    expect(getTypeIconName('unknown')).toBe('Lightbulb');
  });
});

describe('GradeCoach — getTypeColor', () => {
  it('deve retornar text-green-400 para suggestion', () => {
    expect(getTypeColor('suggestion')).toBe('text-green-400');
  });

  it('deve retornar text-yellow-400 para warning', () => {
    expect(getTypeColor('warning')).toBe('text-yellow-400');
  });

  it('deve retornar text-blue-400 para opportunity', () => {
    expect(getTypeColor('opportunity')).toBe('text-blue-400');
  });

  it('deve retornar text-gray-400 para tipo desconhecido', () => {
    expect(getTypeColor('unknown')).toBe('text-gray-400');
  });
});

describe('GradeCoach — Summary calculations', () => {
  const sampleInsights = [
    { priority: 3, isApplied: true, read: true },
    { priority: 2, isApplied: false, read: true },
    { priority: 3, isApplied: false, read: false },
    { priority: 1, isApplied: true, read: true },
    { priority: 1, isApplied: false, read: false },
  ];

  it('deve contar total de insights corretamente', () => {
    const summary = computeSummary(sampleInsights);
    expect(summary.total).toBe(5);
  });

  it('deve contar high priority (priority === 3) corretamente', () => {
    const summary = computeSummary(sampleInsights);
    expect(summary.highPriority).toBe(2);
  });

  it('deve contar applied corretamente', () => {
    const summary = computeSummary(sampleInsights);
    expect(summary.applied).toBe(2);
  });

  it('deve contar unread (!read) corretamente', () => {
    const summary = computeSummary(sampleInsights);
    expect(summary.unread).toBe(2);
  });

  it('deve retornar tudo zero para array vazio', () => {
    const summary = computeSummary([]);
    expect(summary).toEqual({ total: 0, highPriority: 0, applied: 0, unread: 0 });
  });
});

describe('GradeCoach — generateSampleInsights', () => {
  it('deve retornar array com exatamente 3 insights', () => {
    const insights = generateSampleInsights();
    expect(insights).toHaveLength(3);
  });

  it('cada insight deve ter type, category, title, description, priority, data', () => {
    const insights = generateSampleInsights();
    for (const insight of insights) {
      expect(insight).toHaveProperty('type');
      expect(insight).toHaveProperty('category');
      expect(insight).toHaveProperty('title');
      expect(insight).toHaveProperty('description');
      expect(insight).toHaveProperty('priority');
      expect(insight).toHaveProperty('data');
    }
  });

  it('deve conter os 3 tipos: suggestion, warning, opportunity', () => {
    const insights = generateSampleInsights();
    const types = insights.map(i => i.type);
    expect(types).toContain('suggestion');
    expect(types).toContain('warning');
    expect(types).toContain('opportunity');
  });

  it('prioridades devem ser 3, 2, 1 respectivamente', () => {
    const insights = generateSampleInsights();
    expect(insights[0].priority).toBe(3);
    expect(insights[1].priority).toBe(2);
    expect(insights[2].priority).toBe(1);
  });

  it('cada insight deve ter data como objeto nao vazio', () => {
    const insights = generateSampleInsights();
    for (const insight of insights) {
      expect(typeof insight.data).toBe('object');
      expect(Object.keys(insight.data).length).toBeGreaterThan(0);
    }
  });
});

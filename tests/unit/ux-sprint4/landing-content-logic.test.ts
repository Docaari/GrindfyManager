import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: RF-02/RF-04/RF-05 — Logica de conteudo da landing page (FP-01)
//
// Funcoes puras que fornecem dados estruturados para a landing:
//   - `getLandingFeatures`: retorna 6 feature cards com icon, title, description
//   - `getFAQItems`: retorna 6-8 perguntas frequentes com pergunta e resposta
//   - `getTestimonials`: retorna 3+ depoimentos com nome, role, quote
//   - `getSocialProofStats`: retorna stats hardcoded para social proof
//
// Modulo esperado: `client/src/lib/landing-content-helpers.ts`
//
// Todos os textos devem estar em PT-BR. Features descritas devem corresponder
// a funcionalidades reais do Grindfy (spec RF-02):
//   1. Dashboard de Performance
//   2. Biblioteca de Torneios
//   3. Grade Semanal
//   4. Grind ao Vivo
//   5. Preparacao Mental
//   6. Import Multi-Rede
//
// Todos devem FALHAR (red phase) — funcoes ainda nao existem.
// =============================================================================

// Tipos esperados
interface LandingFeature {
  icon: string;
  title: string;
  description: string;
}

interface FAQItem {
  question: string;
  answer: string;
}

interface Testimonial {
  name: string;
  role: string;
  quote: string;
}

interface SocialProofStat {
  value: string;
  label: string;
}

// Stubs para compilacao — Implementer substituira
let getLandingFeatures: () => LandingFeature[];
let getFAQItems: () => FAQItem[];
let getTestimonials: () => Testimonial[];
let getSocialProofStats: () => SocialProofStat[];

try {
  const mod = require('../../../client/src/lib/landing-content-helpers');
  if (mod.getLandingFeatures) getLandingFeatures = mod.getLandingFeatures;
  if (mod.getFAQItems) getFAQItems = mod.getFAQItems;
  if (mod.getTestimonials) getTestimonials = mod.getTestimonials;
  if (mod.getSocialProofStats) getSocialProofStats = mod.getSocialProofStats;
} catch {
  // Esperado em red phase
}

// ---------------------------------------------------------------------------
// getLandingFeatures — retorna 6 feature cards
// ---------------------------------------------------------------------------

describe('getLandingFeatures', () => {
  it('deve retornar exatamente 6 features', () => {
    const features = getLandingFeatures();
    expect(features).toHaveLength(6);
  });

  it('cada feature deve ter icon, title e description', () => {
    const features = getLandingFeatures();
    features.forEach(feature => {
      expect(feature.icon).toBeTruthy();
      expect(feature.title).toBeTruthy();
      expect(feature.description).toBeTruthy();
    });
  });

  it('deve incluir feature de Dashboard de Performance', () => {
    const features = getLandingFeatures();
    const dashboard = features.find(f =>
      f.title.toLowerCase().includes('dashboard') ||
      f.title.toLowerCase().includes('performance')
    );
    expect(dashboard).toBeDefined();
  });

  it('deve incluir feature de Biblioteca de Torneios', () => {
    const features = getLandingFeatures();
    const library = features.find(f =>
      f.title.toLowerCase().includes('biblioteca') ||
      f.title.toLowerCase().includes('torneios')
    );
    expect(library).toBeDefined();
  });

  it('deve incluir feature de Grade Semanal', () => {
    const features = getLandingFeatures();
    const grade = features.find(f =>
      f.title.toLowerCase().includes('grade') ||
      f.title.toLowerCase().includes('semanal') ||
      f.title.toLowerCase().includes('planej')
    );
    expect(grade).toBeDefined();
  });

  it('deve incluir feature de Grind ao Vivo', () => {
    const features = getLandingFeatures();
    const grind = features.find(f =>
      f.title.toLowerCase().includes('grind') ||
      f.title.toLowerCase().includes('vivo') ||
      f.title.toLowerCase().includes('tempo real')
    );
    expect(grind).toBeDefined();
  });

  it('deve incluir feature de Preparacao Mental', () => {
    const features = getLandingFeatures();
    const mental = features.find(f =>
      f.title.toLowerCase().includes('mental') ||
      f.title.toLowerCase().includes('preparac') ||
      f.title.toLowerCase().includes('warm')
    );
    expect(mental).toBeDefined();
  });

  it('deve incluir feature de Import Multi-Rede', () => {
    const features = getLandingFeatures();
    const importFeature = features.find(f =>
      f.title.toLowerCase().includes('import') ||
      f.title.toLowerCase().includes('multi-rede') ||
      f.title.toLowerCase().includes('redes')
    );
    expect(importFeature).toBeDefined();
  });

  it('titulos devem estar em portugues (sem palavras em ingles)', () => {
    const features = getLandingFeatures();
    features.forEach(feature => {
      // Excecoes permitidas: ROI, MTT, poker, grind, dashboard (termos tecnicos)
      const titleWithoutExceptions = feature.title
        .replace(/\b(ROI|MTT|poker|grind|dashboard)\b/gi, '');
      expect(titleWithoutExceptions).not.toMatch(/\b(live|weekly|upload|import|mental|coach)\b/i);
    });
  });

  it('descricoes devem ter ao menos 20 caracteres cada', () => {
    const features = getLandingFeatures();
    features.forEach(feature => {
      expect(feature.description.length).toBeGreaterThanOrEqual(20);
    });
  });
});

// ---------------------------------------------------------------------------
// getFAQItems — retorna perguntas frequentes
// ---------------------------------------------------------------------------

describe('getFAQItems', () => {
  it('deve retornar entre 6 e 8 FAQs', () => {
    const faqs = getFAQItems();
    expect(faqs.length).toBeGreaterThanOrEqual(6);
    expect(faqs.length).toBeLessThanOrEqual(8);
  });

  it('cada FAQ deve ter pergunta e resposta', () => {
    const faqs = getFAQItems();
    faqs.forEach(faq => {
      expect(faq.question).toBeTruthy();
      expect(faq.answer).toBeTruthy();
    });
  });

  it('deve incluir FAQ sobre o que e o Grindfy', () => {
    const faqs = getFAQItems();
    const about = faqs.find(f =>
      f.question.toLowerCase().includes('o que') &&
      f.question.toLowerCase().includes('grindfy')
    );
    expect(about).toBeDefined();
  });

  it('deve incluir FAQ sobre redes de poker suportadas', () => {
    const faqs = getFAQItems();
    const networks = faqs.find(f =>
      f.question.toLowerCase().includes('rede') ||
      f.question.toLowerCase().includes('importar')
    );
    expect(networks).toBeDefined();
  });

  it('deve incluir FAQ sobre seguranca dos dados', () => {
    const faqs = getFAQItems();
    const security = faqs.find(f =>
      f.question.toLowerCase().includes('segur') ||
      f.question.toLowerCase().includes('dados')
    );
    expect(security).toBeDefined();
  });

  it('deve incluir FAQ sobre trial gratuito', () => {
    const faqs = getFAQItems();
    const trial = faqs.find(f =>
      f.question.toLowerCase().includes('trial') ||
      f.question.toLowerCase().includes('gr[aá]tis') ||
      f.question.toLowerCase().includes('gratuito')
    );
    expect(trial).toBeDefined();
  });

  it('deve incluir FAQ esclarecendo que nao funciona para cash game', () => {
    const faqs = getFAQItems();
    const cash = faqs.find(f =>
      f.question.toLowerCase().includes('cash') ||
      f.answer.toLowerCase().includes('mtt')
    );
    expect(cash).toBeDefined();
  });

  it('deve incluir FAQ sobre cancelamento', () => {
    const faqs = getFAQItems();
    const cancel = faqs.find(f =>
      f.question.toLowerCase().includes('cancel') ||
      f.question.toLowerCase().includes('fidelidade')
    );
    expect(cancel).toBeDefined();
  });

  it('perguntas devem terminar com interrogacao', () => {
    const faqs = getFAQItems();
    faqs.forEach(faq => {
      expect(faq.question.trim()).toMatch(/\?$/);
    });
  });

  it('respostas devem ter ao menos 30 caracteres', () => {
    const faqs = getFAQItems();
    faqs.forEach(faq => {
      expect(faq.answer.length).toBeGreaterThanOrEqual(30);
    });
  });
});

// ---------------------------------------------------------------------------
// getTestimonials — retorna depoimentos
// ---------------------------------------------------------------------------

describe('getTestimonials', () => {
  it('deve retornar ao menos 3 depoimentos', () => {
    const testimonials = getTestimonials();
    expect(testimonials.length).toBeGreaterThanOrEqual(3);
  });

  it('cada depoimento deve ter nome, role e quote', () => {
    const testimonials = getTestimonials();
    testimonials.forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.role).toBeTruthy();
      expect(t.quote).toBeTruthy();
    });
  });

  it('quotes devem estar em portugues e ter ao menos 40 caracteres', () => {
    const testimonials = getTestimonials();
    testimonials.forEach(t => {
      expect(t.quote.length).toBeGreaterThanOrEqual(40);
      // Nao deve ser inteiramente em ingles
      expect(t.quote).not.toMatch(/^[a-zA-Z\s.,!?'"]+$/);
    });
  });

  it('roles devem descrever jogadores de poker', () => {
    const testimonials = getTestimonials();
    testimonials.forEach(t => {
      const roleLower = t.role.toLowerCase();
      expect(
        roleLower.includes('poker') ||
        roleLower.includes('jogador') ||
        roleLower.includes('grinder') ||
        roleLower.includes('mtt') ||
        roleLower.includes('profissional') ||
        roleLower.includes('semi-pro')
      ).toBe(true);
    });
  });

  it('nomes devem ser distintos', () => {
    const testimonials = getTestimonials();
    const names = testimonials.map(t => t.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });
});

// ---------------------------------------------------------------------------
// getSocialProofStats — retorna stats para social proof
// ---------------------------------------------------------------------------

describe('getSocialProofStats', () => {
  it('deve retornar ao menos 3 stats', () => {
    const stats = getSocialProofStats();
    expect(stats.length).toBeGreaterThanOrEqual(3);
  });

  it('cada stat deve ter value e label', () => {
    const stats = getSocialProofStats();
    stats.forEach(stat => {
      expect(stat.value).toBeTruthy();
      expect(stat.label).toBeTruthy();
    });
  });

  it('deve incluir stat sobre torneios analisados', () => {
    const stats = getSocialProofStats();
    const tournaments = stats.find(s =>
      s.label.toLowerCase().includes('torneio') ||
      s.label.toLowerCase().includes('analisad')
    );
    expect(tournaments).toBeDefined();
  });

  it('deve incluir stat sobre redes suportadas (10+)', () => {
    const stats = getSocialProofStats();
    const networks = stats.find(s =>
      s.label.toLowerCase().includes('rede') ||
      s.label.toLowerCase().includes('suportad')
    );
    expect(networks).toBeDefined();
    expect(networks!.value).toMatch(/10/);
  });

  it('deve incluir stat sobre seguranca', () => {
    const stats = getSocialProofStats();
    const security = stats.find(s =>
      s.label.toLowerCase().includes('segur') ||
      s.label.toLowerCase().includes('privad') ||
      s.value.toLowerCase().includes('100%')
    );
    expect(security).toBeDefined();
  });

  it('labels devem estar em portugues', () => {
    const stats = getSocialProofStats();
    stats.forEach(stat => {
      expect(stat.label).not.toMatch(/\b(tournaments|networks|secure|safe)\b/i);
    });
  });
});

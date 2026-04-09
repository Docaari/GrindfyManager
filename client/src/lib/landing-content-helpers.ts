// Landing page content helpers — all text in PT-BR

export interface LandingFeature {
  icon: string;
  title: string;
  description: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface Testimonial {
  name: string;
  role: string;
  quote: string;
}

export interface SocialProofStat {
  value: string;
  label: string;
}

export function getLandingFeatures(): LandingFeature[] {
  return [
    {
      icon: 'BarChart3',
      title: 'Dashboard de Performance',
      description: 'Acompanhe seus resultados com graficos detalhados de ROI, lucro, volume e tendencias ao longo do tempo.',
    },
    {
      icon: 'Library',
      title: 'Biblioteca de Torneios',
      description: 'Organize e analise todos os torneios que voce joga, agrupados por rede, buy-in e categoria.',
    },
    {
      icon: 'Calendar',
      title: 'Grade Semanal',
      description: 'Planeje sua semana de grind com perfis A, B e C, otimizando volume e horarios por dia.',
    },
    {
      icon: 'Radio',
      title: 'Grind em Tempo Real',
      description: 'Acompanhe sua sessao ao vivo com controle de torneios, breaks e metricas em tempo real.',
    },
    {
      icon: 'Brain',
      title: 'Preparacao e Foco',
      description: 'Faca seu warm-up antes de cada sessao com exercicios de foco, confianca e estado emocional.',
    },
    {
      icon: 'Upload',
      title: 'Importacao Multi-Rede',
      description: 'Importe historicos de mais de 10 redes de poker automaticamente, incluindo PokerStars, GGPoker e WPN.',
    },
  ];
}

export function getFAQItems(): FAQItem[] {
  return [
    {
      question: 'O que e o Grindfy?',
      answer: 'O Grindfy e uma plataforma completa de gestao e analise de performance para jogadores de poker MTT. Ele permite importar historicos, analisar resultados, planejar grades e acompanhar sessoes em tempo real.',
    },
    {
      question: 'Quais redes de poker posso importar?',
      answer: 'O Grindfy suporta mais de 10 redes, incluindo PokerStars, GGPoker, WPN (Americas Cardroom), PartyPoker, 888poker, Bodog, CoinPoker, iPoker Network e outras. Novos formatos sao adicionados regularmente.',
    },
    {
      question: 'Meus dados estao seguros?',
      answer: 'Sim. Todos os dados sao armazenados com criptografia e acesso restrito. Suas informacoes de torneios e performance sao privadas e nunca compartilhadas com terceiros.',
    },
    {
      question: 'Existe um trial gratuito para testar?',
      answer: 'Sim! Oferecemos um trial gratuito de 7 dias com acesso completo a todas as funcionalidades. Nenhum cartao de credito e necessario para comecar.',
    },
    {
      question: 'O Grindfy funciona para cash game?',
      answer: 'Atualmente o Grindfy e focado exclusivamente em torneios MTT. Todas as metricas, analises e ferramentas foram projetadas para o formato de torneios multi-mesa.',
    },
    {
      question: 'Posso cancelar minha assinatura a qualquer momento?',
      answer: 'Sim, nao ha fidelidade. Voce pode cancelar sua assinatura a qualquer momento pelo painel de configuracoes, sem taxas adicionais.',
    },
    {
      question: 'Como funciona a grade semanal?',
      answer: 'A grade semanal permite planejar seus torneios por dia da semana com ate 3 perfis diferentes (A, B e C), cada um com volume e buy-ins adaptados ao seu bankroll e disponibilidade.',
    },
  ];
}

export function getTestimonials(): Testimonial[] {
  return [
    {
      name: 'Lucas Mendes',
      role: 'Jogador profissional de MTT',
      quote: 'O Grindfy mudou completamente minha organização. Consigo planejar minhas sessões e acompanhar meu ROI de forma muito mais precisa do que em planilhas.',
    },
    {
      name: 'Fernanda Costa',
      role: 'Grinder semi-profissional de poker',
      quote: 'A função de grind ao vivo é incrível. Ter o controle dos torneios em tempo real e o acompanhamento de foco me ajudou a manter a concentração nas sessões longas.',
    },
    {
      name: 'Rafael Oliveira',
      role: 'Jogador profissional de poker MTT',
      quote: 'Importar meus históricos de várias redes em um único lugar foi um divisor de águas. A análise por categoria e buy-in me mostrou vazamentos que eu não enxergava.',
    },
  ];
}

export function getSocialProofStats(): SocialProofStat[] {
  return [
    {
      value: '500.000+',
      label: 'Torneios analisados',
    },
    {
      value: '10+',
      label: 'Redes suportadas',
    },
    {
      value: '100%',
      label: 'Dados privados e seguros',
    },
    {
      value: '24/7',
      label: 'Acesso a plataforma',
    },
  ];
}

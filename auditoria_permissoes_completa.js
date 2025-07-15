// AUDITORIA COMPLETA DO SISTEMA DE PERMISSÕES
const TAGS = {
  GRADE: 'Grade',
  GRIND: 'Grind',
  DASHBOARD: 'Dashboard',
  IMPORT: 'Import',
  WARM_UP: 'Warm Up',
  CALENDARIO: 'Calendario',
  ESTUDOS: 'Estudos',
  BIBLIOTECA: 'Biblioteca',
  ANALYTICS: 'Analytics',
  USUARIOS: 'Usuarios',
  BUGS: 'Bugs',
  ADMIN_FULL: 'Admin Full'
};

const SUBSCRIPTION_PROFILES = {
  basico: {
    name: 'Básico',
    tags: [TAGS.GRADE, TAGS.GRIND]
  },
  premium: {
    name: 'Premium', 
    tags: [TAGS.GRADE, TAGS.GRIND, TAGS.DASHBOARD, TAGS.IMPORT]
  },
  pro: {
    name: 'Pro',
    tags: [TAGS.GRADE, TAGS.GRIND, TAGS.DASHBOARD, TAGS.IMPORT, TAGS.WARM_UP, TAGS.CALENDARIO, TAGS.ESTUDOS, TAGS.BIBLIOTECA]
  },
  admin: {
    name: 'Admin',
    tags: [TAGS.GRADE, TAGS.GRIND, TAGS.DASHBOARD, TAGS.IMPORT, TAGS.WARM_UP, TAGS.CALENDARIO, TAGS.ESTUDOS, TAGS.BIBLIOTECA, TAGS.ANALYTICS, TAGS.USUARIOS, TAGS.BUGS]
  }
};

// Páginas principais do sistema
const PAGES = [
  { name: 'Grade Planner', route: 'grade-planner', tag: TAGS.GRADE },
  { name: 'Grind Session', route: 'grind-session', tag: TAGS.GRIND },
  { name: 'Dashboard', route: 'dashboard', tag: TAGS.DASHBOARD },
  { name: 'Upload History', route: 'upload-history', tag: TAGS.IMPORT },
  { name: 'Mental Prep', route: 'mental-prep', tag: TAGS.WARM_UP },
  { name: 'Planner', route: 'planner', tag: TAGS.CALENDARIO },
  { name: 'Estudos', route: 'estudos', tag: TAGS.ESTUDOS },
  { name: 'Biblioteca', route: 'biblioteca', tag: TAGS.BIBLIOTECA },
  { name: 'Analytics', route: 'analytics', tag: TAGS.ANALYTICS },
  { name: 'Admin Users', route: 'admin-users', tag: TAGS.USUARIOS },
  { name: 'Admin Bugs', route: 'admin-bugs', tag: TAGS.BUGS }
];

function hasTagAccess(subscriptionPlan, requiredTag, userEmail) {
  // Super-admin tem acesso total
  if (userEmail === 'ricardo.agnolo@hotmail.com') {
    return true;
  }
  
  const profile = SUBSCRIPTION_PROFILES[subscriptionPlan];
  return profile ? profile.tags.includes(requiredTag) : false;
}

function auditarPlano(nomePlano, plano) {
  console.log(`\\n=== AUDITORIA: ${nomePlano.toUpperCase()} ===`);
  console.log(`Nome: ${plano.name}`);
  console.log(`Tags: [${plano.tags.join(', ')}]`);
  console.log(`Total de tags: ${plano.tags.length}`);
  
  let acessosPermitidos = 0;
  let acessosNegados = 0;
  
  PAGES.forEach(page => {
    const temAcesso = hasTagAccess(nomePlano, page.tag);
    const status = temAcesso ? '✅ PERMITIDO' : '❌ NEGADO';
    console.log(`  ${page.name}: ${status}`);
    
    if (temAcesso) {
      acessosPermitidos++;
    } else {
      acessosNegados++;
    }
  });
  
  console.log(`\\nResumo: ${acessosPermitidos} permitidos, ${acessosNegados} negados`);
  return { permitidos: acessosPermitidos, negados: acessosNegados };
}

// EXECUTAR AUDITORIA COMPLETA
console.log('🔍 AUDITORIA COMPLETA DO SISTEMA DE PERMISSÕES');
console.log('===============================================');

// Verificar definições dos planos
console.log('\\n📋 VERIFICAÇÃO DAS DEFINIÇÕES DOS PLANOS:');
Object.entries(SUBSCRIPTION_PROFILES).forEach(([key, profile]) => {
  console.log(`${key}: [${profile.tags.join(', ')}]`);
});

// Auditoria por plano
const resultados = {};
Object.entries(SUBSCRIPTION_PROFILES).forEach(([nomePlano, plano]) => {
  resultados[nomePlano] = auditarPlano(nomePlano, plano);
});

// Verificar hierarquia
console.log('\\n🔺 VERIFICAÇÃO DE HIERARQUIA:');
console.log(`Básico: ${resultados.basico.permitidos} acessos`);
console.log(`Premium: ${resultados.premium.permitidos} acessos`);
console.log(`Pro: ${resultados.pro.permitidos} acessos`);
console.log(`Admin: ${resultados.admin.permitidos} acessos`);

// Verificar se hierarquia está correta
const hierarquiaCorreta = (
  resultados.basico.permitidos < resultados.premium.permitidos &&
  resultados.premium.permitidos < resultados.pro.permitidos &&
  resultados.pro.permitidos < resultados.admin.permitidos
);

console.log(`\\n🎯 HIERARQUIA CORRETA: ${hierarquiaCorreta ? 'SIM' : 'NÃO'}`);

// Teste do Super Admin
console.log('\\n👑 TESTE SUPER ADMIN:');
const superAdminAnalytics = hasTagAccess('basico', TAGS.ANALYTICS, 'ricardo.agnolo@hotmail.com');
console.log(`Super Admin com plano básico acessando Analytics: ${superAdminAnalytics ? 'SIM' : 'NÃO'}`);

console.log('\\n=== AUDITORIA CONCLUÍDA ===');
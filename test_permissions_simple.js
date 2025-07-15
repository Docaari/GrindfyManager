// TESTE SIMPLES DE PERMISSÕES - INVESTIGAÇÃO CRÍTICA

// Definir as funções e constantes manualmente para teste
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

const SUPER_ADMIN_EMAIL = 'ricardo.agnolo@hotmail.com';

function isSuperAdmin(userEmail) {
  return userEmail === SUPER_ADMIN_EMAIL;
}

function hasTagAccess(subscriptionPlan, requiredTag, userEmail) {
  console.log(`🔍 hasTagAccess called: plan=${subscriptionPlan}, tag=${requiredTag}, email=${userEmail}`);
  
  // Super-admin tem acesso total a tudo
  if (userEmail && isSuperAdmin(userEmail)) {
    console.log(`   ✅ Super-admin bypass: ${userEmail} = ${SUPER_ADMIN_EMAIL}`);
    return true;
  }
  
  const profile = SUBSCRIPTION_PROFILES[subscriptionPlan];
  console.log(`   📋 Profile found: ${profile ? profile.name : 'NONE'}`);
  console.log(`   🏷️  Profile tags: ${profile ? profile.tags.join(', ') : 'NONE'}`);
  
  if (!profile) {
    console.log(`   ❌ Profile not found for plan: ${subscriptionPlan}`);
    return false;
  }
  
  const hasAccess = profile.tags.includes(requiredTag);
  console.log(`   ${hasAccess ? '✅' : '❌'} Access result: ${hasAccess}`);
  
  return hasAccess;
}

function hasPageAccess(subscriptionPlan, pageName, userEmail) {
  console.log(`🔍 hasPageAccess called: plan=${subscriptionPlan}, page=${pageName}, email=${userEmail}`);
  
  // Super-admin tem acesso total a tudo
  if (userEmail && isSuperAdmin(userEmail)) {
    console.log(`   ✅ Super-admin bypass: ${userEmail} = ${SUPER_ADMIN_EMAIL}`);
    return true;
  }
  
  // Mapeamento de páginas para tags
  const pageToTag = {
    'grade-planner': TAGS.GRADE,
    'grind-session': TAGS.GRIND,
    'dashboard': TAGS.DASHBOARD,
    'upload-history': TAGS.IMPORT,
    'mental-prep': TAGS.WARM_UP,
    'planner': TAGS.CALENDARIO,
    'estudos': TAGS.ESTUDOS,
    'biblioteca': TAGS.BIBLIOTECA,
    'tournament-library': TAGS.BIBLIOTECA,
    'analytics': TAGS.ANALYTICS,
    'admin-users': TAGS.USUARIOS,
    'admin-bugs': TAGS.BUGS,
  };
  
  const requiredTag = pageToTag[pageName];
  console.log(`   🏷️  Required tag: ${requiredTag}`);
  
  if (!requiredTag) {
    console.log(`   ❌ Page not found in mapping: ${pageName}`);
    return false;
  }
  
  return hasTagAccess(subscriptionPlan, requiredTag, userEmail);
}

// TESTE PRINCIPAL
console.log('🚨 INICIANDO INVESTIGAÇÃO CRÍTICA DO BUG DE PERMISSÕES');

// Usuários para teste
const testUsers = [
  { email: 'ricardinho2012@gmail.com', plan: 'basico', expected: 2 },
  { email: 'laisag97@hotmail.com', plan: 'pro', expected: 8 },
  { email: 'ricardo.agnolo@hotmail.com', plan: 'admin', expected: 11 }
];

console.log('\n🔍 VERIFICANDO PERFIS DE PLANOS:');
Object.entries(SUBSCRIPTION_PROFILES).forEach(([planName, profile]) => {
  console.log(`${planName}: ${profile.tags.length} tags - ${profile.tags.join(', ')}`);
});

console.log('\n🔍 TESTANDO CADA USUÁRIO:');
testUsers.forEach(user => {
  console.log(`\n=== TESTE ${user.email} (${user.plan}) ===`);
  console.log(`Esperado: ${user.expected} acessos`);
  
  // Testar apenas algumas páginas principais
  const testPages = [
    'grade-planner',
    'grind-session', 
    'dashboard',
    'upload-history',
    'mental-prep',
    'planner',
    'estudos',
    'biblioteca',
    'analytics'
  ];
  
  let acessosPermitidos = 0;
  
  testPages.forEach(page => {
    console.log(`\n--- Testando ${page} ---`);
    const hasAccess = hasPageAccess(user.plan, page, user.email);
    
    if (hasAccess) {
      acessosPermitidos++;
      console.log(`✅ ${page}: PERMITIDO`);
    } else {
      console.log(`❌ ${page}: NEGADO`);
    }
  });
  
  console.log(`\n📊 Resultado: ${acessosPermitidos}/${testPages.length} permitidos`);
  console.log(`Status: ${acessosPermitidos >= user.expected ? '✅ CORRETO' : '❌ INCORRETO'}`);
});

console.log('\n🎯 INVESTIGAÇÃO CONCLUÍDA');
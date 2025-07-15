// 🔧 SISTEMA COMPLETO DE DEBUG DE PERMISSÕES
// Testa todo o fluxo: banco → login → verificação → acesso

const SUPER_ADMIN_EMAIL = 'ricardo.agnolo@hotmail.com';

function isSuperAdmin(email) {
  return email === SUPER_ADMIN_EMAIL;
}

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
  ADMIN_FULL: 'Admin Full',
};

const SUBSCRIPTION_PROFILES = {
  basico: {
    name: 'Básico',
    tags: [TAGS.GRADE, TAGS.GRIND],
    pages: ['grade-planner', 'grind-session'],
  },
  premium: {
    name: 'Premium',
    tags: [TAGS.GRADE, TAGS.GRIND, TAGS.DASHBOARD, TAGS.IMPORT],
    pages: ['grade-planner', 'grind-session', 'dashboard', 'upload-history'],
  },
  pro: {
    name: 'Pro',
    tags: [TAGS.GRADE, TAGS.GRIND, TAGS.DASHBOARD, TAGS.IMPORT, TAGS.WARM_UP, TAGS.CALENDARIO, TAGS.ESTUDOS, TAGS.BIBLIOTECA],
    pages: ['grade-planner', 'grind-session', 'dashboard', 'upload-history', 'mental-prep', 'planner', 'estudos', 'biblioteca'],
  },
  admin: {
    name: 'Admin',
    tags: [TAGS.GRADE, TAGS.GRIND, TAGS.DASHBOARD, TAGS.IMPORT, TAGS.WARM_UP, TAGS.CALENDARIO, TAGS.ESTUDOS, TAGS.BIBLIOTECA, TAGS.ANALYTICS, TAGS.USUARIOS, TAGS.BUGS, TAGS.ADMIN_FULL],
    pages: ['grade-planner', 'grind-session', 'dashboard', 'upload-history', 'mental-prep', 'planner', 'estudos', 'biblioteca', 'analytics', 'admin-users', 'admin-bugs'],
  },
};

function hasPageAccess(subscriptionPlan, pageName, userEmail) {
  console.log(`🔍 VERIFICANDO ACESSO:`);
  console.log(`   👤 Email: ${userEmail}`);
  console.log(`   📄 Página: ${pageName}`);
  console.log(`   🎯 Plano: ${subscriptionPlan}`);
  
  // Super-admin check
  if (userEmail && isSuperAdmin(userEmail)) {
    console.log(`   ✅ SUPER-ADMIN BYPASS - Acesso garantido`);
    return true;
  }
  
  // Clean page name
  const cleanPageName = pageName.replace(/^\//, '').split('?')[0];
  console.log(`   🧹 Página limpa: ${cleanPageName}`);
  
  // Page to tag mapping
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
  
  const requiredTag = pageToTag[cleanPageName];
  console.log(`   🏷️  Tag requerida: ${requiredTag}`);
  
  if (!requiredTag) {
    console.log(`   ❌ PÁGINA NÃO MAPEADA - Acesso negado`);
    return false;
  }
  
  // Get user tags
  const profile = SUBSCRIPTION_PROFILES[subscriptionPlan];
  const userTags = profile ? profile.tags : [];
  console.log(`   📋 Tags do usuário: [${userTags.join(', ')}]`);
  
  const hasAccess = userTags.includes(requiredTag);
  console.log(`   ${hasAccess ? '✅' : '❌'} RESULTADO: ${hasAccess ? 'ACESSO PERMITIDO' : 'ACESSO NEGADO'}`);
  
  return hasAccess;
}

// TESTE COMPLETO DE CENÁRIOS
console.log('🧪 TESTE COMPLETO DO SISTEMA DE PERMISSÕES');
console.log('=' * 50);

// CENÁRIO 1: USER-0001 (Super-admin)
console.log('\n📋 CENÁRIO 1: USER-0001 (Super-admin)');
console.log('Plano: admin, Email: ricardo.agnolo@hotmail.com');
console.log('Expected: Acesso a TODAS as páginas');
const user1Tests = [
  { page: 'dashboard', expected: true },
  { page: 'admin-users', expected: true },
  { page: 'admin-bugs', expected: true },
  { page: 'analytics', expected: true },
];

user1Tests.forEach(test => {
  const result = hasPageAccess('admin', test.page, 'ricardo.agnolo@hotmail.com');
  console.log(`   ${result === test.expected ? '✅' : '❌'} ${test.page}: ${result} (esperado: ${test.expected})`);
});

// CENÁRIO 2: USER-0002 (Admin)
console.log('\n📋 CENÁRIO 2: USER-0002 (Admin)');
console.log('Plano: admin, Email: ricardinho2012@gmail.com');
console.log('Expected: Acesso a TODAS as páginas');
const user2Tests = [
  { page: 'dashboard', expected: true },
  { page: 'admin-users', expected: true },
  { page: 'admin-bugs', expected: true },
  { page: 'analytics', expected: true },
];

user2Tests.forEach(test => {
  const result = hasPageAccess('admin', test.page, 'ricardinho2012@gmail.com');
  console.log(`   ${result === test.expected ? '✅' : '❌'} ${test.page}: ${result} (esperado: ${test.expected})`);
});

// CENÁRIO 3: USER-0003 (Pro)
console.log('\n📋 CENÁRIO 3: USER-0003 (Pro)');
console.log('Plano: pro, Email: laisag97@hotmail.com');
console.log('Expected: Acesso a 8 funcionalidades');
const user3Tests = [
  { page: 'grade-planner', expected: true },
  { page: 'grind-session', expected: true },
  { page: 'dashboard', expected: true },
  { page: 'upload-history', expected: true },
  { page: 'mental-prep', expected: true },
  { page: 'planner', expected: true },
  { page: 'estudos', expected: true },
  { page: 'biblioteca', expected: true },
  { page: 'admin-users', expected: false },
  { page: 'admin-bugs', expected: false },
  { page: 'analytics', expected: false },
];

user3Tests.forEach(test => {
  const result = hasPageAccess('pro', test.page, 'laisag97@hotmail.com');
  console.log(`   ${result === test.expected ? '✅' : '❌'} ${test.page}: ${result} (esperado: ${test.expected})`);
});

// CENÁRIO 4: Teste com Premium
console.log('\n📋 CENÁRIO 4: Teste Premium');
console.log('Plano: premium, Email: test@example.com');
console.log('Expected: Acesso a 4 funcionalidades');
const premiumTests = [
  { page: 'grade-planner', expected: true },
  { page: 'grind-session', expected: true },
  { page: 'dashboard', expected: true },
  { page: 'upload-history', expected: true },
  { page: 'mental-prep', expected: false },
  { page: 'planner', expected: false },
  { page: 'estudos', expected: false },
  { page: 'biblioteca', expected: false },
];

premiumTests.forEach(test => {
  const result = hasPageAccess('premium', test.page, 'test@example.com');
  console.log(`   ${result === test.expected ? '✅' : '❌'} ${test.page}: ${result} (esperado: ${test.expected})`);
});

// CENÁRIO 5: Teste com Básico
console.log('\n📋 CENÁRIO 5: Teste Básico');
console.log('Plano: basico, Email: test@example.com');
console.log('Expected: Acesso a 2 funcionalidades');
const basicTests = [
  { page: 'grade-planner', expected: true },
  { page: 'grind-session', expected: true },
  { page: 'dashboard', expected: false },
  { page: 'upload-history', expected: false },
  { page: 'mental-prep', expected: false },
];

basicTests.forEach(test => {
  const result = hasPageAccess('basico', test.page, 'test@example.com');
  console.log(`   ${result === test.expected ? '✅' : '❌'} ${test.page}: ${result} (esperado: ${test.expected})`);
});

console.log('\n🎯 RESUMO DA LÓGICA DE PERMISSÕES:');
console.log('✅ Super-admin (ricardo.agnolo@hotmail.com): Acesso total');
console.log('✅ Admin: Todas as 11 funcionalidades');
console.log('✅ Pro: 8 funcionalidades (sem Analytics, Usuários, Bugs)');
console.log('✅ Premium: 4 funcionalidades (Grade, Grind, Dashboard, Import)');
console.log('✅ Básico: 2 funcionalidades (Grade, Grind)');
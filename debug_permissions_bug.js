// INVESTIGAÇÃO CRÍTICA: BUG QUE FORÇA TODOS USUÁRIOS COMO BÁSICO
console.log('🚨 INICIANDO INVESTIGAÇÃO CRÍTICA DO BUG DE PERMISSÕES');

// Importar as funções de permissões
const { hasPageAccess, hasTagAccess, SUBSCRIPTION_PROFILES, TAGS } = require('./shared/permissions');

// Usuários para teste
const testUsers = [
  { email: 'ricardinho2012@gmail.com', plan: 'basico', expected: 2 },
  { email: 'laisag97@hotmail.com', plan: 'pro', expected: 8 },
  { email: 'ricardo.agnolo@hotmail.com', plan: 'admin', expected: 11 }
];

// Páginas para teste
const testPages = [
  { name: 'Grade Planner', route: 'grade-planner', tag: 'Grade' },
  { name: 'Grind Session', route: 'grind-session', tag: 'Grind' },
  { name: 'Dashboard', route: 'dashboard', tag: 'Dashboard' },
  { name: 'Upload History', route: 'upload-history', tag: 'Import' },
  { name: 'Mental Prep', route: 'mental-prep', tag: 'Warm Up' },
  { name: 'Planner', route: 'planner', tag: 'Calendario' },
  { name: 'Estudos', route: 'estudos', tag: 'Estudos' },
  { name: 'Biblioteca', route: 'biblioteca', tag: 'Biblioteca' },
  { name: 'Analytics', route: 'analytics', tag: 'Analytics' },
  { name: 'Admin Users', route: 'admin-users', tag: 'Usuarios' },
  { name: 'Admin Bugs', route: 'admin-bugs', tag: 'Bugs' }
];

console.log('\n🔍 VERIFICANDO PERFIS DE PLANOS:');
Object.entries(SUBSCRIPTION_PROFILES).forEach(([planName, profile]) => {
  console.log(`${planName}: ${profile.tags.length} tags`, profile.tags);
});

console.log('\n🔍 TESTANDO CADA USUÁRIO:');
testUsers.forEach(user => {
  console.log(`\n=== ${user.email} (${user.plan}) ===`);
  console.log(`Esperado: ${user.expected} acessos`);
  
  let acessosPermitidos = 0;
  let acessosNegados = 0;
  
  testPages.forEach(page => {
    const hasAccess = hasPageAccess(user.plan, page.route, user.email);
    
    if (hasAccess) {
      acessosPermitidos++;
      console.log(`✅ ${page.name}: PERMITIDO`);
    } else {
      acessosNegados++;
      console.log(`❌ ${page.name}: NEGADO`);
    }
  });
  
  console.log(`\nResultado: ${acessosPermitidos}/${testPages.length} permitidos`);
  console.log(`Status: ${acessosPermitidos === user.expected ? '✅ CORRETO' : '❌ INCORRETO'}`);
  
  if (acessosPermitidos !== user.expected) {
    console.log(`🚨 BUG DETECTADO: Esperado ${user.expected}, obtido ${acessosPermitidos}`);
  }
});

console.log('\n🔍 VERIFICANDO FUNÇÕES ESPECÍFICAS:');

// Teste direto das funções
console.log('\n--- TESTE DIRETO hasTagAccess ---');
const testTag = 'Dashboard';
testUsers.forEach(user => {
  const result = hasTagAccess(user.plan, testTag, user.email);
  console.log(`${user.email} (${user.plan}) para tag ${testTag}: ${result ? 'PERMITIDO' : 'NEGADO'}`);
});

console.log('\n--- TESTE DIRETO hasPageAccess ---');
const testPage = 'dashboard';
testUsers.forEach(user => {
  const result = hasPageAccess(user.plan, testPage, user.email);
  console.log(`${user.email} (${user.plan}) para página ${testPage}: ${result ? 'PERMITIDO' : 'NEGADO'}`);
});

console.log('\n🎯 INVESTIGAÇÃO CONCLUÍDA');